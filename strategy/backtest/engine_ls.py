"""Long/Short market-neutral backtest engine with multi-signal alpha.

Signals:
  1. Momentum (trend): short laggards vs BTC, long outperformers
  2. Mean reversion: short recent pumps, long recent dips (5d vs 20d)
  3. Volatility: short high-vol coins, long low-vol coins (vol drag)

Key design: signals are orthogonal → combined Sharpe > individual Sharpe.
"""
import pandas as pd
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))

from price_loader import load_universe, get_daily_closes


# ─── Signal functions ────────────────────────────────────────────────────────

def signal_momentum(closes: pd.DataFrame, window: int = 14) -> pd.DataFrame:
    """Relative momentum vs BTC. High score → short candidate."""
    if "BTC" not in closes.columns:
        raise ValueError("BTC required")
    rets = closes.pct_change(window, fill_method=None)
    btc_rets = rets["BTC"]
    relative = rets.drop(columns=["BTC"]).sub(btc_rets, axis=0)
    # Rank normalize: most negative relative → highest short score
    def rank_norm(row):
        valid = row.dropna()
        if len(valid) < 5:
            return pd.Series(np.nan, index=row.index)
        ranked = valid.rank(pct=True)
        result = pd.Series(np.nan, index=row.index)
        result[valid.index] = 1 - ranked  # invert: worst performer → 1
        return result
    return relative.apply(rank_norm, axis=1)


def signal_mean_reversion(closes: pd.DataFrame, fast: int = 5, slow: int = 20) -> pd.DataFrame:
    """Mean reversion: coins that pumped short-term vs their own trend.

    High score → recently pumped (short), Low score → recently dumped (long).
    Uses z-score of fast return relative to slow return distribution.
    """
    coins = [c for c in closes.columns if c != "BTC"]
    fast_ret = closes[coins].pct_change(fast, fill_method=None)
    slow_ret = closes[coins].pct_change(slow, fill_method=None)

    # Excess short-term return over longer-term trend
    excess = fast_ret - slow_ret * (fast / slow)

    # Cross-sectional rank each day
    def rank_norm(row):
        valid = row.dropna()
        if len(valid) < 5:
            return pd.Series(np.nan, index=row.index)
        ranked = valid.rank(pct=True)
        result = pd.Series(np.nan, index=row.index)
        result[valid.index] = ranked  # high excess → high short score
        return result
    return excess.apply(rank_norm, axis=1)


def signal_volatility(closes: pd.DataFrame, window: int = 20) -> pd.DataFrame:
    """Volatility signal: high-vol coins tend to underperform risk-adjusted.

    High score → high vol (short), Low score → low vol (long).
    """
    coins = [c for c in closes.columns if c != "BTC"]
    daily_rets = closes[coins].pct_change(fill_method=None)
    rolling_vol = daily_rets.rolling(window).std()

    def rank_norm(row):
        valid = row.dropna()
        if len(valid) < 5:
            return pd.Series(np.nan, index=row.index)
        ranked = valid.rank(pct=True)
        result = pd.Series(np.nan, index=row.index)
        result[valid.index] = ranked  # high vol → high short score
        return result
    return rolling_vol.apply(rank_norm, axis=1)


# ─── Portfolio construction ──────────────────────────────────────────────────

def construct_ls_portfolio(
    combined_score: pd.Series,
    n_long: int,
    n_short: int,
    equity: float,
    leverage: float,
    exclude: list[str] | None = None,
) -> dict[str, float]:
    """Construct long/short portfolio from combined scores.

    Score > 0.5 → short candidate, Score < 0.5 → long candidate.
    Returns dict of coin → signed notional.
    """
    scores = combined_score.copy()
    if exclude:
        scores = scores.drop(exclude, errors="ignore")
    scores = scores.dropna()
    if len(scores) < n_long + n_short:
        return {}

    # Top scores → short, bottom scores → long
    sorted_scores = scores.sort_values(ascending=False)
    short_coins = sorted_scores.head(n_short).index.tolist()
    long_coins = sorted_scores.tail(n_long).index.tolist()

    exposure = equity * leverage
    short_per = -exposure / n_short
    long_per = exposure / n_long

    positions = {}
    for c in short_coins:
        positions[c] = short_per
    for c in long_coins:
        positions[c] = long_per
    return positions


# ─── Backtest engine ─────────────────────────────────────────────────────────

def run_ls_backtest(
    closes: pd.DataFrame,
    n_long: int = 5,
    n_short: int = 15,
    leverage: float = 0.6,
    momentum_window: int = 14,
    mr_fast: int = 5,
    mr_slow: int = 20,
    vol_window: int = 20,
    w_momentum: float = 0.4,
    w_mean_rev: float = 0.3,
    w_vol: float = 0.3,
    rebalance_days: int = 1,
    fee_bps: float = 5.5,  # taker + slippage
    initial_capital: float = 100_000,
    vol_target: float | None = None,  # annualized vol target for dynamic sizing
    max_dd_stop: float = 0.25,
    exclude: list[str] = ["BTC", "HYPE"],
    verbose: bool = True,
) -> pd.DataFrame:
    """Run Long/Short market-neutral backtest."""

    # Compute signals
    if verbose:
        print("Computing signals...")
    sig_mom = signal_momentum(closes, momentum_window)
    sig_mr = signal_mean_reversion(closes, mr_fast, mr_slow)
    sig_vol = signal_volatility(closes, vol_window)

    # Combine signals (weighted average, normalized)
    coins = [c for c in closes.columns if c != "BTC"]
    combined = (
        sig_mom.reindex(columns=coins).fillna(0.5) * w_momentum +
        sig_mr.reindex(columns=coins).fillna(0.5) * w_mean_rev +
        sig_vol.reindex(columns=coins).fillna(0.5) * w_vol
    )

    # Daily returns for PnL
    daily_rets = closes.pct_change(fill_method=None)

    # Warmup
    warmup = max(momentum_window, mr_slow, vol_window) + 5
    dates = closes.index[warmup:]

    # State
    equity = initial_capital
    positions: dict[str, float] = {}
    peak_equity = initial_capital
    history = []
    rebal_counter = 0

    # For vol targeting: track recent portfolio volatility
    recent_pnl = []

    for i, date in enumerate(dates):
        day_idx = warmup + i

        # ─── PnL from existing positions ───
        day_pnl = 0.0
        for coin, notional in positions.items():
            ret = daily_rets.iloc[day_idx].get(coin, 0)
            if pd.isna(ret):
                ret = 0
            day_pnl += notional * ret

        equity += day_pnl
        recent_pnl.append(day_pnl)
        if len(recent_pnl) > 20:
            recent_pnl.pop(0)

        # Track drawdown
        peak_equity = max(peak_equity, equity)
        dd = (peak_equity - equity) / peak_equity
        stopped = dd > max_dd_stop

        # ─── Rebalance ───
        rebal_counter += 1
        day_fees = 0.0

        if rebal_counter >= rebalance_days and not stopped:
            rebal_counter = 0

            if date in combined.index:
                today_scores = combined.loc[date]

                # Dynamic leverage via vol target
                actual_lev = leverage
                if vol_target is not None and len(recent_pnl) >= 10:
                    realized_vol = np.std(recent_pnl) / equity * np.sqrt(365)
                    if realized_vol > 0:
                        actual_lev = min(leverage * 2, leverage * vol_target / realized_vol)
                        actual_lev = max(0.1, actual_lev)

                new_positions = construct_ls_portfolio(
                    today_scores, n_long, n_short, equity, actual_lev, exclude
                )

                # Turnover and fees
                turnover = 0
                all_coins = set(list(positions.keys()) + list(new_positions.keys()))
                for coin in all_coins:
                    turnover += abs(new_positions.get(coin, 0) - positions.get(coin, 0))
                fee = turnover * fee_bps / 10000
                equity -= fee
                day_fees = fee
                positions = new_positions

        # ─── Record ───
        gross_exp = sum(abs(v) for v in positions.values())
        net_exp = sum(v for v in positions.values())
        history.append({
            "date": date,
            "equity": equity,
            "daily_pnl": day_pnl,
            "daily_fees": day_fees,
            "gross_exposure": gross_exp,
            "net_exposure": net_exp,
            "leverage": gross_exp / equity if equity > 0 else 0,
            "drawdown": dd,
            "n_positions": len(positions),
        })

        if stopped:
            if verbose:
                print(f"  ⚠️  Max DD stop at {date.strftime('%Y-%m-%d')}: DD={dd:.1%}")
            break

    results = pd.DataFrame(history).set_index("date")
    if verbose:
        _print_ls_summary(results, initial_capital)
    return results


def _print_ls_summary(results: pd.DataFrame, initial_capital: float):
    days = len(results)
    if days == 0:
        print("No results")
        return
    total_ret = results["equity"].iloc[-1] / initial_capital - 1
    arr = (1 + total_ret) ** (365 / days) - 1 if days > 0 else 0
    daily_rets = results["equity"].pct_change().dropna()
    sharpe = daily_rets.mean() / daily_rets.std() * np.sqrt(365) if daily_rets.std() > 0 else 0
    sortino_den = daily_rets[daily_rets < 0].std()
    sortino = daily_rets.mean() / sortino_den * np.sqrt(365) if sortino_den > 0 else 0
    mdd = results["drawdown"].max()
    calmar = arr / mdd if mdd > 0 else 0
    monthly = results["equity"].resample("ME").last().pct_change().dropna()
    win_m = (monthly > 0).sum()
    tot_m = len(monthly)
    fees = results["daily_fees"].sum()

    print(f"\n{'─'*55}")
    print(f"L/S BACKTEST  {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days}d)")
    print(f"{'─'*55}")
    print(f"  ARR:      {arr:+.1%}")
    print(f"  Sharpe:   {sharpe:.2f}")
    print(f"  Sortino:  {sortino:.2f}")
    print(f"  MDD:      {mdd:.1%}")
    print(f"  Calmar:   {calmar:.2f}")
    print(f"  Win mo:   {win_m}/{tot_m} ({win_m/tot_m*100:.0f}%)" if tot_m else "")
    print(f"  Fees:     ${fees:,.0f}")
    print(f"  Final:    ${results['equity'].iloc[-1]:,.0f}")
    print(f"{'─'*55}")


# ─── Grid search ─────────────────────────────────────────────────────────────

def grid_search(closes: pd.DataFrame):
    """Search for parameter combos meeting ARR>30% and MDD<10%."""
    results = []

    param_grid = [
        # (n_long, n_short, leverage, mom_w, mr_fast, mr_slow, vol_w, w_mom, w_mr, w_vol, vol_target)
        (5, 15, 0.6, 14, 5, 20, 20, 0.4, 0.3, 0.3, None),
        (5, 15, 0.4, 14, 5, 20, 20, 0.4, 0.3, 0.3, 0.10),
        (5, 15, 0.5, 14, 5, 20, 20, 0.4, 0.3, 0.3, 0.12),
        (5, 15, 0.8, 14, 5, 20, 20, 0.4, 0.3, 0.3, 0.10),
        (5, 15, 1.0, 14, 5, 20, 20, 0.4, 0.3, 0.3, 0.08),
        # Higher mean reversion weight
        (5, 15, 0.6, 14, 3, 14, 20, 0.3, 0.5, 0.2, None),
        (5, 15, 0.6, 14, 3, 14, 20, 0.3, 0.5, 0.2, 0.10),
        (5, 15, 0.8, 14, 3, 14, 20, 0.3, 0.5, 0.2, 0.10),
        # Pure mean reversion
        (5, 15, 0.6, 14, 5, 20, 20, 0.0, 0.7, 0.3, None),
        (5, 15, 0.8, 14, 5, 20, 20, 0.0, 0.7, 0.3, 0.10),
        # More longs, balanced portfolio
        (10, 10, 0.6, 14, 5, 20, 20, 0.4, 0.3, 0.3, None),
        (10, 10, 0.8, 14, 5, 20, 20, 0.4, 0.3, 0.3, 0.10),
        (10, 10, 1.0, 14, 5, 20, 20, 0.3, 0.4, 0.3, 0.10),
        # Faster momentum
        (5, 15, 0.6, 7, 3, 10, 14, 0.4, 0.4, 0.2, None),
        (5, 15, 0.8, 7, 3, 10, 14, 0.4, 0.4, 0.2, 0.10),
        # Aggressive with vol target capping risk
        (5, 15, 1.5, 14, 5, 20, 20, 0.4, 0.3, 0.3, 0.08),
        (5, 15, 2.0, 14, 5, 20, 20, 0.4, 0.3, 0.3, 0.08),
        (5, 15, 2.0, 14, 3, 14, 20, 0.3, 0.5, 0.2, 0.08),
        # Short more, concentrated shorts
        (3, 20, 0.6, 14, 5, 20, 20, 0.4, 0.3, 0.3, None),
        (3, 20, 0.8, 14, 5, 20, 20, 0.3, 0.4, 0.3, 0.10),
    ]

    for params in param_grid:
        n_l, n_s, lev, mom_w, mr_f, mr_s, vol_w, w_m, w_mr, w_v, vt = params
        try:
            res = run_ls_backtest(
                closes,
                n_long=n_l, n_short=n_s, leverage=lev,
                momentum_window=mom_w, mr_fast=mr_f, mr_slow=mr_s, vol_window=vol_w,
                w_momentum=w_m, w_mean_rev=w_mr, w_vol=w_v,
                vol_target=vt,
                verbose=False,
            )
            days = len(res)
            if days < 365:
                continue
            total_ret = res["equity"].iloc[-1] / 100_000 - 1
            arr = (1 + total_ret) ** (365 / days) - 1
            daily_r = res["equity"].pct_change().dropna()
            sharpe = daily_r.mean() / daily_r.std() * np.sqrt(365) if daily_r.std() > 0 else 0
            mdd = res["drawdown"].max()

            results.append({
                "params": f"L{n_l}/S{n_s} lev{lev} mom{mom_w} mr{mr_f}/{mr_s} vol{vol_w} w{w_m}/{w_mr}/{w_v} vt={vt}",
                "arr": arr,
                "sharpe": sharpe,
                "mdd": mdd,
                "days": days,
                "calmar": arr / mdd if mdd > 0 else 0,
            })
        except Exception as e:
            print(f"  Error with {params}: {e}")
            continue

    # Sort by Calmar (best risk-adjusted)
    results.sort(key=lambda x: x["calmar"], reverse=True)

    print(f"\n{'='*80}")
    print(f"GRID SEARCH RESULTS ({len(results)} valid configs)")
    print(f"{'='*80}")
    print(f"{'Config':<65} {'ARR':>6} {'Sharpe':>7} {'MDD':>6} {'Calmar':>7}")
    print(f"{'-'*80}")
    for r in results[:20]:
        flag = "✓" if r["arr"] > 0.30 and r["mdd"] < 0.10 else " "
        print(f"{flag} {r['params']:<63} {r['arr']:>+5.1%} {r['sharpe']:>6.2f} {r['mdd']:>5.1%} {r['calmar']:>6.2f}")
    print(f"{'='*80}")

    # Highlight any that meet the goal
    winners = [r for r in results if r["arr"] > 0.30 and r["mdd"] < 0.10]
    if winners:
        print(f"\n🎯 {len(winners)} configs meet ARR>30% AND MDD<10%!")
        for w in winners:
            print(f"   {w['params']}")
    else:
        # Show the best tradeoffs
        best_calmar = results[0] if results else None
        best_arr = max(results, key=lambda x: x["arr"]) if results else None
        lowest_mdd = min(results, key=lambda x: x["mdd"]) if results else None
        print(f"\n⚠️  No config meets both ARR>30% AND MDD<10%")
        if best_calmar:
            print(f"   Best Calmar: {best_calmar['params']}")
            print(f"     → ARR={best_calmar['arr']:+.1%}, MDD={best_calmar['mdd']:.1%}, Sharpe={best_calmar['sharpe']:.2f}")
        if best_arr:
            print(f"   Best ARR: {best_arr['params']}")
            print(f"     → ARR={best_arr['arr']:+.1%}, MDD={best_arr['mdd']:.1%}")

    return results


if __name__ == "__main__":
    print("Loading daily price data...")
    universe = load_universe(min_days=365)
    closes = get_daily_closes(universe)
    print(f"Universe: {len(closes.columns)} coins, {len(closes)} days")
    print(f"Period: {closes.index[0].strftime('%Y-%m-%d')} → {closes.index[-1].strftime('%Y-%m-%d')}")

    # Run grid search
    grid_search(closes)

