"""Conditional-entry L/S strategy.

Instead of always being in the market and scaling exposure, this strategy
is BINARY: either fully deployed or completely flat.

Entry condition: momentum signal is "hot" (high dispersion = good for L/S).
Exit condition: BTC in strong uptrend AND altcoin correlation high (bad regime).

This can achieve high Sharpe by being in the market only during favorable regimes.
"""
import pandas as pd
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
from price_loader import load_universe, get_daily_closes


def signal_momentum(closes: pd.DataFrame, window: int = 14) -> pd.DataFrame:
    """Relative momentum vs BTC."""
    rets = closes.pct_change(window, fill_method=None)
    btc_rets = rets["BTC"]
    coins = [c for c in closes.columns if c != "BTC"]
    relative = rets[coins].sub(btc_rets, axis=0)

    def rank_norm(row):
        valid = row.dropna()
        if len(valid) < 5:
            return pd.Series(np.nan, index=row.index)
        ranked = valid.rank(pct=True)
        result = pd.Series(np.nan, index=row.index)
        result[valid.index] = 1 - ranked
        return result
    return relative.apply(rank_norm, axis=1)


def compute_dispersion(closes: pd.DataFrame, window: int = 20) -> pd.Series:
    """Cross-sectional return dispersion. Higher = better for L/S."""
    coins = [c for c in closes.columns if c != "BTC"]
    rets = closes[coins].pct_change(fill_method=None)
    # Rolling cross-sectional stdev of returns
    dispersion = rets.rolling(window).apply(lambda x: x.std(axis=0).mean() if len(x) > 5 else np.nan)
    # Actually just compute cross-sectional std per day, then smooth
    daily_xsec_std = rets.std(axis=1)
    return daily_xsec_std.rolling(window).mean()


def compute_altcoin_beta(closes: pd.DataFrame, window: int = 30) -> pd.Series:
    """Rolling beta of equal-weight altcoin index to BTC.
    High beta = alts moving together with BTC (bad for L/S).
    """
    coins = [c for c in closes.columns if c != "BTC"]
    alt_rets = closes[coins].pct_change(fill_method=None).mean(axis=1)
    btc_rets = closes["BTC"].pct_change(fill_method=None)

    # Rolling correlation
    corr = alt_rets.rolling(window).corr(btc_rets)
    return corr


def run_conditional_backtest(
    closes: pd.DataFrame,
    n_long: int = 5,
    n_short: int = 15,
    leverage: float = 0.6,
    momentum_window: int = 14,
    rebalance_days: int = 1,
    fee_bps: float = 5.5,
    initial_capital: float = 100_000,
    # Entry/exit conditions
    btc_ma_period: int = 50,
    btc_deviation_threshold: float = 0.30,  # exit if BTC > 30% above MA
    corr_threshold: float = 0.8,  # exit if alt-BTC corr > 0.8
    dispersion_min: float = None,  # optional: require minimum dispersion
    # Risk
    max_dd_stop: float = 0.50,
    trailing_stop: float | None = None,  # optional: trailing stop on equity
    exclude: list[str] = ["BTC", "HYPE"],
    verbose: bool = True,
) -> pd.DataFrame:
    """Binary conditional entry L/S backtest."""

    coins = [c for c in closes.columns if c != "BTC"]

    # Signals
    sig_mom = signal_momentum(closes, momentum_window)

    # Regime indicators
    btc_ma = closes["BTC"].rolling(btc_ma_period).mean()
    btc_deviation = (closes["BTC"] - btc_ma) / btc_ma
    alt_btc_corr = compute_altcoin_beta(closes, window=30)
    dispersion = compute_dispersion(closes, window=20)

    daily_rets = closes.pct_change(fill_method=None)

    warmup = max(momentum_window, btc_ma_period, 30) + 5
    dates = closes.index[warmup:]

    equity = initial_capital
    positions: dict[str, float] = {}
    peak_equity = initial_capital
    history = []
    rebal_counter = 0
    in_market = False
    entry_equity = initial_capital

    for i, date in enumerate(dates):
        day_idx = warmup + i

        # PnL
        day_pnl = 0.0
        for coin, notional in positions.items():
            ret = daily_rets.iloc[day_idx].get(coin, 0)
            if pd.isna(ret):
                ret = 0
            day_pnl += notional * ret

        equity += day_pnl
        peak_equity = max(peak_equity, equity)
        dd = (peak_equity - equity) / peak_equity

        # Entry/exit logic
        dev = btc_deviation.iloc[day_idx] if day_idx < len(btc_deviation) else 0
        corr = alt_btc_corr.iloc[day_idx] if day_idx < len(alt_btc_corr) else 0
        disp = dispersion.iloc[day_idx] if day_idx < len(dispersion) else 0
        if pd.isna(dev): dev = 0
        if pd.isna(corr): corr = 0
        if pd.isna(disp): disp = 0

        # Exit conditions (any one triggers exit)
        should_exit = False
        if in_market:
            if dev > btc_deviation_threshold:
                should_exit = True  # BTC too far above MA
            if corr > corr_threshold:
                should_exit = True  # Alts too correlated
            if trailing_stop and equity < entry_equity * (1 - trailing_stop):
                should_exit = True  # Trade trailing stop

        # Entry conditions (all must be met)
        should_enter = False
        if not in_market:
            if dev < btc_deviation_threshold * 0.5:  # BTC not too extended
                if corr < corr_threshold * 0.9:  # Dispersion exists
                    should_enter = True

        # State transitions
        day_fees = 0.0
        if should_exit and in_market:
            # Close all positions
            turnover = sum(abs(v) for v in positions.values())
            fee = turnover * fee_bps / 10000
            equity -= fee
            day_fees = fee
            positions = {}
            in_market = False

        if should_enter and not in_market:
            in_market = True
            entry_equity = equity

        # Rebalance (only if in market)
        rebal_counter += 1
        if rebal_counter >= rebalance_days and in_market and not dd > max_dd_stop:
            rebal_counter = 0

            if date in sig_mom.index:
                scores = sig_mom.loc[date].drop(exclude, errors="ignore").dropna()
                if len(scores) >= n_long + n_short:
                    sorted_s = scores.sort_values(ascending=False)
                    short_coins = sorted_s.head(n_short).index.tolist()
                    long_coins = sorted_s.tail(n_long).index.tolist()

                    exposure = equity * leverage
                    new_pos = {}
                    for c in short_coins:
                        new_pos[c] = -exposure / n_short
                    for c in long_coins:
                        new_pos[c] = exposure / n_long

                    turnover = 0
                    for c in set(list(positions.keys()) + list(new_pos.keys())):
                        turnover += abs(new_pos.get(c, 0) - positions.get(c, 0))
                    fee = turnover * fee_bps / 10000
                    equity -= fee
                    day_fees += fee
                    positions = new_pos

        gross = sum(abs(v) for v in positions.values())
        history.append({
            "date": date,
            "equity": equity,
            "daily_pnl": day_pnl,
            "daily_fees": day_fees,
            "leverage": gross / equity if equity > 0 else 0,
            "drawdown": dd,
            "in_market": in_market,
            "btc_dev": dev,
            "alt_corr": corr,
        })

    results = pd.DataFrame(history).set_index("date")
    if verbose:
        _print_cond_summary(results, initial_capital)
    return results


def _print_cond_summary(results: pd.DataFrame, cap: float):
    days = len(results)
    if days == 0:
        return
    total_ret = results["equity"].iloc[-1] / cap - 1
    arr = (1 + total_ret) ** (365 / days) - 1
    dr = results["equity"].pct_change().dropna()
    sharpe = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
    mdd = results["drawdown"].max()
    calmar = arr / mdd if mdd > 0 else 0
    in_pct = results["in_market"].mean()
    monthly = results["equity"].resample("ME").last().pct_change().dropna()
    win_m = (monthly > 0).sum()
    tot_m = len(monthly)

    print(f"\n{'─'*55}")
    print(f"CONDITIONAL L/S  {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days}d)")
    print(f"{'─'*55}")
    print(f"  ARR:      {arr:+.1%}")
    print(f"  Sharpe:   {sharpe:.2f}")
    print(f"  MDD:      {mdd:.1%}")
    print(f"  Calmar:   {calmar:.2f}")
    print(f"  Win mo:   {win_m}/{tot_m} ({win_m/tot_m*100:.0f}%)" if tot_m else "")
    print(f"  In mkt:   {in_pct:.0%} of time")
    print(f"  Fees:     ${results['daily_fees'].sum():,.0f}")
    print(f"  Final:    ${results['equity'].iloc[-1]:,.0f}")
    print(f"{'─'*55}")


def grid_search(closes: pd.DataFrame):
    """Grid search for conditional L/S."""
    results = []

    configs = [
        # (n_l, n_s, lev, mom_w, btc_ma, btc_thresh, corr_thresh, trail)
        (5, 15, 0.6, 14, 50, 0.30, 0.80, None),
        (5, 15, 0.6, 14, 50, 0.20, 0.70, None),
        (5, 15, 0.6, 14, 50, 0.40, 0.85, None),
        (5, 15, 0.8, 14, 50, 0.30, 0.80, None),
        (5, 15, 1.0, 14, 50, 0.30, 0.80, None),
        (5, 15, 0.6, 14, 30, 0.25, 0.75, None),
        (5, 15, 0.8, 14, 30, 0.25, 0.75, None),
        (5, 15, 1.0, 14, 30, 0.20, 0.70, None),
        # With trailing stop
        (5, 15, 0.8, 14, 50, 0.30, 0.80, 0.05),
        (5, 15, 1.0, 14, 50, 0.30, 0.80, 0.05),
        (5, 15, 1.0, 14, 30, 0.25, 0.75, 0.05),
        # More aggressive entry
        (5, 15, 1.0, 14, 50, 0.50, 0.90, None),
        (5, 15, 1.2, 14, 50, 0.50, 0.90, None),
        (5, 15, 1.5, 14, 50, 0.50, 0.90, None),
        # Balanced
        (10, 10, 0.8, 14, 50, 0.30, 0.80, None),
        (10, 10, 1.0, 14, 50, 0.30, 0.80, None),
        # Faster momentum
        (5, 15, 0.8, 7, 50, 0.30, 0.80, None),
        (5, 15, 1.0, 7, 30, 0.25, 0.75, None),
    ]

    for cfg in configs:
        n_l, n_s, lev, mw, bma, bt, ct, trail = cfg
        try:
            res = run_conditional_backtest(
                closes, n_long=n_l, n_short=n_s, leverage=lev,
                momentum_window=mw, btc_ma_period=bma,
                btc_deviation_threshold=bt, corr_threshold=ct,
                trailing_stop=trail, verbose=False,
            )
            days = len(res)
            if days < 365:
                continue
            total_ret = res["equity"].iloc[-1] / 100_000 - 1
            arr = (1 + total_ret) ** (365 / days) - 1
            dr = res["equity"].pct_change().dropna()
            sharpe = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
            mdd = res["drawdown"].max()
            in_pct = res["in_market"].mean()
            results.append({
                "params": f"L{n_l}/S{n_s} lev{lev} m{mw} bma{bma} bt{bt} ct{ct} tr={trail}",
                "arr": arr, "sharpe": sharpe, "mdd": mdd,
                "days": days, "in_market": in_pct,
                "calmar": arr / mdd if mdd > 0 else 0,
            })
        except Exception as e:
            continue

    results.sort(key=lambda x: x["calmar"], reverse=True)

    print(f"\n{'='*95}")
    print(f"CONDITIONAL L/S GRID ({len(results)} valid)")
    print(f"{'='*95}")
    print(f"{'Config':<60} {'ARR':>6} {'Sharpe':>7} {'MDD':>6} {'InMkt':>6} {'Calmar':>7}")
    print(f"{'-'*95}")
    for r in results[:20]:
        flag = "✓" if r["arr"] > 0.30 and r["mdd"] < 0.10 else " "
        print(f"{flag} {r['params']:<58} {r['arr']:>+5.1%} {r['sharpe']:>6.2f} {r['mdd']:>5.1%} {r['in_market']:>5.0%} {r['calmar']:>6.2f}")

    winners = [r for r in results if r["arr"] > 0.30 and r["mdd"] < 0.10]
    if winners:
        print(f"\n🎯 {len(winners)} configs meet ARR>30% AND MDD<10%!")
    else:
        print(f"\n⚠️  No config meets both goals.")
    return results


if __name__ == "__main__":
    print("Loading daily price data...")
    universe = load_universe(min_days=365)
    closes = get_daily_closes(universe)
    print(f"Universe: {len(closes.columns)} coins, {len(closes)} days")
    print(f"Period: {closes.index[0].strftime('%Y-%m-%d')} → {closes.index[-1].strftime('%Y-%m-%d')}")
    grid_search(closes)
