"""Core backtest engine for the short-garbage strategy."""
import pandas as pd
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "signals"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import BacktestConfig
from universe import compute_daily_volume, get_tradeable_universe
from composite import compute_composite_scores, select_short_basket
from funding_score import load_daily_funding, funding_cost_daily


def run_backtest(
    hourly_data: dict[str, pd.DataFrame],
    config: BacktestConfig,
    funding_data: pd.DataFrame | None = None,
    supply_data: pd.DataFrame | None = None,
    verbose: bool = True,
) -> pd.DataFrame:
    """Run the short-garbage backtest.

    Returns DataFrame with daily portfolio stats:
        - equity, pnl, positions, fees, funding_pnl, etc.
    """
    from price_loader import get_daily_closes

    # Prepare daily data
    daily_closes = get_daily_closes(hourly_data)
    daily_volume = compute_daily_volume(hourly_data)
    tradeable = get_tradeable_universe(
        daily_volume,
        min_volume_usd=config.min_daily_volume_usd,
        exclude=list(config.exclude_coins),
    )

    # Compute composite scores
    composite = compute_composite_scores(
        daily_closes,
        daily_funding=funding_data,
        supply_df=supply_data,
        momentum_window=config.momentum_window,
        funding_window=config.funding_window,
        weights=config.signal_weights,
    )

    # Compute daily returns for PnL calculation
    daily_returns = daily_closes.pct_change(fill_method=None)

    # Funding cost (if available)
    if funding_data is not None and not funding_data.empty:
        daily_funding_cost = funding_cost_daily(funding_data)
    else:
        daily_funding_cost = None

    # Warmup period
    warmup = max(config.momentum_window, config.funding_window) + 5
    start_idx = warmup

    # State
    equity = config.initial_capital
    positions: dict[str, float] = {}  # coin → notional (negative = short)
    history = []

    dates = daily_closes.index[start_idx:]
    rebalance_counter = 0

    for i, date in enumerate(dates):
        day_idx = start_idx + i

        # Daily PnL from existing positions
        day_pnl = 0.0
        day_funding = 0.0
        day_fees = 0.0

        for coin, notional in list(positions.items()):
            if coin not in daily_returns.columns:
                continue
            ret = daily_returns.iloc[day_idx].get(coin, 0)
            if pd.isna(ret):
                ret = 0

            # Short position: PnL = -notional * return
            # (notional is negative for shorts, so pnl = notional * return... wait)
            # Let's use: positions stores SIGNED notional (negative = short)
            # PnL = position * return (short position * positive return = loss)
            pnl = notional * ret
            day_pnl += pnl

            # Funding: short receives positive funding, pays negative
            if daily_funding_cost is not None and coin in daily_funding_cost.columns:
                fund_rate = daily_funding_cost.iloc[day_idx].get(coin, 0)
                if pd.isna(fund_rate):
                    fund_rate = 0
                # Short position: receives funding when rate is positive
                # funding_income = -notional * fund_rate (notional is negative, so double neg = positive)
                funding_income = -notional * fund_rate
                day_funding += funding_income

        equity += day_pnl + day_funding

        # Check max drawdown stop
        peak_equity = max(h["equity"] for h in history) if history else config.initial_capital
        peak_equity = max(peak_equity, equity)
        drawdown = (peak_equity - equity) / peak_equity
        stopped = drawdown > config.max_drawdown_stop

        # Rebalance?
        rebalance_counter += 1
        should_rebalance = (rebalance_counter >= config.rebalance_hours // 24) and not stopped

        if should_rebalance:
            rebalance_counter = 0

            # Get today's scores
            if date not in composite.index:
                continue
            today_scores = composite.loc[date].copy()

            # Filter by tradeable universe
            if date in tradeable.index:
                tradeable_today = tradeable.loc[date]
                for coin in today_scores.index:
                    if coin in tradeable_today.index and not tradeable_today[coin]:
                        today_scores[coin] = 0

            # Select short basket
            basket = select_short_basket(
                today_scores,
                n_shorts=config.n_shorts,
                exclude=list(config.exclude_coins),
            )

            # Compute target positions (equal weight shorts)
            target_exposure = equity * config.total_leverage
            per_position = -target_exposure / len(basket) if basket else 0
            # Cap single position
            max_single = equity * config.max_position_pct
            per_position = max(per_position, -max_single)

            new_positions = {coin: per_position for coin in basket}

            # Compute turnover and fees
            turnover = 0
            for coin in set(list(positions.keys()) + list(new_positions.keys())):
                old = positions.get(coin, 0)
                new = new_positions.get(coin, 0)
                turnover += abs(new - old)

            fee = turnover * (config.fee_rate + config.slippage_bps / 10000)
            day_fees = fee
            equity -= fee

            positions = new_positions

        # Record
        total_short_exposure = sum(abs(v) for v in positions.values())
        history.append({
            "date": date,
            "equity": equity,
            "daily_pnl": day_pnl,
            "daily_funding": day_funding,
            "daily_fees": day_fees,
            "n_positions": len(positions),
            "short_exposure": total_short_exposure,
            "leverage": total_short_exposure / equity if equity > 0 else 0,
            "drawdown": drawdown,
            "stopped": stopped,
        })

        if stopped and verbose:
            print(f"  ⚠️ Max drawdown stop triggered at {date.strftime('%Y-%m-%d')}: DD={drawdown:.1%}")
            break

    results = pd.DataFrame(history)
    results = results.set_index("date")

    if verbose:
        _print_summary(results, config)

    return results


def _print_summary(results: pd.DataFrame, config: BacktestConfig):
    """Print backtest summary statistics."""
    days = len(results)
    total_return = (results["equity"].iloc[-1] / config.initial_capital) - 1
    annual_return = (1 + total_return) ** (365 / days) - 1 if days > 0 else 0

    daily_returns = results["equity"].pct_change().dropna()
    sharpe = daily_returns.mean() / daily_returns.std() * np.sqrt(365) if daily_returns.std() > 0 else 0

    max_dd = results["drawdown"].max()
    calmar = annual_return / max_dd if max_dd > 0 else 0

    total_fees = results["daily_fees"].sum()
    total_funding = results["daily_funding"].sum()

    # Monthly returns
    monthly = results["equity"].resample("ME").last().pct_change().dropna()
    win_months = (monthly > 0).sum()
    total_months = len(monthly)

    print(f"\n{'='*60}")
    print(f"BACKTEST RESULTS")
    print(f"{'='*60}")
    print(f"Period: {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days} days)")
    print(f"Initial capital: ${config.initial_capital:,.0f}")
    print(f"Final equity: ${results['equity'].iloc[-1]:,.0f}")
    print(f"")
    print(f"Total return: {total_return:+.1%}")
    print(f"Annual return: {annual_return:+.1%}")
    print(f"Sharpe ratio: {sharpe:.2f}")
    print(f"Max drawdown: {max_dd:.1%}")
    print(f"Calmar ratio: {calmar:.2f}")
    print(f"")
    print(f"Monthly win rate: {win_months}/{total_months} ({win_months/total_months*100:.0f}%)" if total_months > 0 else "")
    print(f"Total fees paid: ${total_fees:,.0f}")
    print(f"Total funding income: ${total_funding:+,.0f}")
    print(f"Avg leverage: {results['leverage'].mean():.2f}x")
    print(f"Avg positions: {results['n_positions'].mean():.0f}")
    print(f"{'='*60}")


if __name__ == "__main__":
    from price_loader import load_universe

    print("Loading price data...")
    universe = load_universe(min_days=180)
    print(f"Loaded {len(universe)} coins")

    # Try loading optional data
    try:
        funding = load_daily_funding(list(universe.keys()))
        print(f"Funding data: {funding.shape}")
    except Exception:
        funding = None
        print("No funding data (run fetch_funding.py to enable)")

    try:
        from inflation_score import load_supply_data
        supply = load_supply_data()
        print(f"Supply data: {len(supply)} coins")
    except Exception:
        supply = None
        print("No supply data (run fetch_supply.py to enable)")

    config = BacktestConfig()
    print(f"\nRunning backtest with config:")
    print(f"  N shorts: {config.n_shorts}")
    print(f"  Leverage: {config.total_leverage}x")
    print(f"  Momentum window: {config.momentum_window}d")
    print(f"  Rebalance: every {config.rebalance_hours}h")
    print()

    results = run_backtest(universe, config, funding, supply)

    # Save results
    output_path = Path(__file__).resolve().parents[1] / "analysis" / "backtest_results.csv"
    results.to_csv(output_path)
    print(f"\nResults saved to {output_path}")
