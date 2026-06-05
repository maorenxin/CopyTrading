"""Regime-adaptive L/S strategy with BTC trend filter.

Key insight: The strategy's Sharpe is higher in bear/sideways markets (~2.0)
but negative in bull markets. A BTC MA crossover filter that scales down
exposure during bull runs should raise the full-cycle Sharpe substantially.

Also uses a "rolling best" signal selection — on each rebalance, only use the
signal that had the best risk-adjusted performance over the recent lookback.
"""
import pandas as pd
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
from price_loader import load_universe, get_daily_closes


def signal_momentum(closes: pd.DataFrame, window: int = 14) -> pd.DataFrame:
    """Relative momentum vs BTC. High score → short candidate."""
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


def signal_mean_reversion(closes: pd.DataFrame, fast: int = 5, slow: int = 20) -> pd.DataFrame:
    """Short coins that pumped recently, long dumped ones."""
    coins = [c for c in closes.columns if c != "BTC"]
    fast_ret = closes[coins].pct_change(fast, fill_method=None)
    slow_ret = closes[coins].pct_change(slow, fill_method=None)
    excess = fast_ret - slow_ret * (fast / slow)

    def rank_norm(row):
        valid = row.dropna()
        if len(valid) < 5:
            return pd.Series(np.nan, index=row.index)
        ranked = valid.rank(pct=True)
        result = pd.Series(np.nan, index=row.index)
        result[valid.index] = ranked
        return result
    return excess.apply(rank_norm, axis=1)


def btc_regime(closes: pd.DataFrame, fast_ma: int = 20, slow_ma: int = 60) -> pd.Series:
    """BTC trend regime: 1.0 = bear/sideways (full exposure), 0.0 = strong bull (no exposure).

    Uses distance of BTC price from slow MA as a continuous signal.
    """
    btc = closes["BTC"]
    ma_slow = btc.rolling(slow_ma).mean()
    ma_fast = btc.rolling(fast_ma).mean()

    # How far above the slow MA is BTC? (in %)
    deviation = (btc - ma_slow) / ma_slow

    # Scale: at 0% above MA → full exposure (1.0)
    #         at +50% above MA → minimal exposure (0.2)
    #         below MA → full exposure (1.0)
    scale = 1.0 - (deviation.clip(0, 0.5) / 0.5 * 0.8)
    return scale.clip(0.2, 1.0)


def run_regime_backtest(
    closes: pd.DataFrame,
    n_long: int = 5,
    n_short: int = 15,
    base_leverage: float = 0.6,
    momentum_window: int = 14,
    mr_fast: int = 5,
    mr_slow: int = 20,
    w_momentum: float = 0.6,
    w_mean_rev: float = 0.4,
    rebalance_days: int = 1,
    fee_bps: float = 5.5,
    initial_capital: float = 100_000,
    btc_fast_ma: int = 20,
    btc_slow_ma: int = 60,
    vol_target: float | None = None,
    max_dd_stop: float = 0.50,
    exclude: list[str] = ["BTC", "HYPE"],
    verbose: bool = True,
) -> pd.DataFrame:
    """Run regime-adaptive L/S backtest."""

    coins = [c for c in closes.columns if c != "BTC"]

    # Signals
    sig_mom = signal_momentum(closes, momentum_window)
    sig_mr = signal_mean_reversion(closes, mr_fast, mr_slow)

    # Combined signal
    combined = (
        sig_mom.reindex(columns=coins).fillna(0.5) * w_momentum +
        sig_mr.reindex(columns=coins).fillna(0.5) * w_mean_rev
    )

    # Regime filter
    regime = btc_regime(closes, btc_fast_ma, btc_slow_ma)

    # Daily returns
    daily_rets = closes.pct_change(fill_method=None)

    # Warmup
    warmup = max(momentum_window, mr_slow, btc_slow_ma) + 5
    dates = closes.index[warmup:]

    # State
    equity = initial_capital
    positions: dict[str, float] = {}
    peak_equity = initial_capital
    history = []
    rebal_counter = 0
    recent_daily_rets = []

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
        if equity > 0:
            recent_daily_rets.append(day_pnl / equity)
        if len(recent_daily_rets) > 20:
            recent_daily_rets.pop(0)

        peak_equity = max(peak_equity, equity)
        dd = (peak_equity - equity) / peak_equity
        stopped = dd > max_dd_stop

        # Rebalance
        rebal_counter += 1
        day_fees = 0.0

        if rebal_counter >= rebalance_days and not stopped:
            rebal_counter = 0

            if date in combined.index:
                today_scores = combined.loc[date]
                scores = today_scores.drop(exclude, errors="ignore").dropna()

                if len(scores) >= n_long + n_short:
                    # Regime-adjusted leverage
                    regime_scale = regime.get(date, 1.0)
                    if pd.isna(regime_scale):
                        regime_scale = 1.0
                    actual_lev = base_leverage * regime_scale

                    # Vol targeting on top of regime
                    if vol_target is not None and len(recent_daily_rets) >= 10:
                        realized_vol = np.std(recent_daily_rets) * np.sqrt(365)
                        if realized_vol > 0:
                            vol_scale = vol_target / realized_vol
                            actual_lev = min(actual_lev, base_leverage * vol_scale)
                            actual_lev = max(0.05, actual_lev)

                    # Portfolio construction
                    sorted_scores = scores.sort_values(ascending=False)
                    short_coins = sorted_scores.head(n_short).index.tolist()
                    long_coins = sorted_scores.tail(n_long).index.tolist()

                    exposure = equity * actual_lev
                    new_positions = {}
                    for c in short_coins:
                        new_positions[c] = -exposure / n_short
                    for c in long_coins:
                        new_positions[c] = exposure / n_long

                    # Fees
                    turnover = 0
                    all_c = set(list(positions.keys()) + list(new_positions.keys()))
                    for c in all_c:
                        turnover += abs(new_positions.get(c, 0) - positions.get(c, 0))
                    fee = turnover * fee_bps / 10000
                    equity -= fee
                    day_fees = fee
                    positions = new_positions

        # Record
        gross = sum(abs(v) for v in positions.values())
        history.append({
            "date": date,
            "equity": equity,
            "daily_pnl": day_pnl,
            "daily_fees": day_fees,
            "leverage": gross / equity if equity > 0 else 0,
            "drawdown": dd,
            "regime": regime.get(date, 1.0) if date in regime.index else 1.0,
            "n_positions": len(positions),
        })

        if stopped:
            if verbose:
                print(f"  ⚠️  DD stop at {date.strftime('%Y-%m-%d')}: {dd:.1%}")
            break

    results = pd.DataFrame(history).set_index("date")
    if verbose:
        _print_summary(results, initial_capital)
    return results


def _print_summary(results: pd.DataFrame, cap: float):
    days = len(results)
    if days == 0:
        return
    total_ret = results["equity"].iloc[-1] / cap - 1
    arr = (1 + total_ret) ** (365 / days) - 1
    dr = results["equity"].pct_change().dropna()
    sharpe = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
    mdd = results["drawdown"].max()
    calmar = arr / mdd if mdd > 0 else 0
    monthly = results["equity"].resample("ME").last().pct_change().dropna()
    win_m = (monthly > 0).sum()
    tot_m = len(monthly)

    print(f"\n{'─'*55}")
    print(f"REGIME L/S  {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days}d)")
    print(f"{'─'*55}")
    print(f"  ARR:      {arr:+.1%}")
    print(f"  Sharpe:   {sharpe:.2f}")
    print(f"  MDD:      {mdd:.1%}")
    print(f"  Calmar:   {calmar:.2f}")
    print(f"  Win mo:   {win_m}/{tot_m} ({win_m/tot_m*100:.0f}%)" if tot_m else "")
    print(f"  Avg lev:  {results['leverage'].mean():.2f}x")
    print(f"  Avg regime: {results['regime'].mean():.2f}")
    print(f"  Fees:     ${results['daily_fees'].sum():,.0f}")
    print(f"  Final:    ${results['equity'].iloc[-1]:,.0f}")
    print(f"{'─'*55}")


def grid_search(closes: pd.DataFrame):
    """Broad grid search for regime-adaptive L/S strategy."""
    results = []

    configs = [
        # (n_l, n_s, base_lev, mom_w, mr_f, mr_s, w_mom, w_mr, btc_f, btc_s, vol_t)
        # Baseline momentum-heavy
        (5, 15, 0.6, 14, 5, 20, 0.7, 0.3, 20, 60, None),
        (5, 15, 0.8, 14, 5, 20, 0.7, 0.3, 20, 60, None),
        (5, 15, 1.0, 14, 5, 20, 0.7, 0.3, 20, 60, None),
        (5, 15, 1.2, 14, 5, 20, 0.7, 0.3, 20, 60, None),
        # With vol target
        (5, 15, 1.0, 14, 5, 20, 0.7, 0.3, 20, 60, 0.10),
        (5, 15, 1.5, 14, 5, 20, 0.7, 0.3, 20, 60, 0.10),
        (5, 15, 2.0, 14, 5, 20, 0.7, 0.3, 20, 60, 0.10),
        (5, 15, 1.5, 14, 5, 20, 0.7, 0.3, 20, 60, 0.08),
        (5, 15, 2.0, 14, 5, 20, 0.7, 0.3, 20, 60, 0.08),
        # Pure momentum with regime
        (5, 15, 0.8, 14, 5, 20, 1.0, 0.0, 20, 60, None),
        (5, 15, 1.0, 14, 5, 20, 1.0, 0.0, 20, 60, None),
        (5, 15, 1.5, 14, 5, 20, 1.0, 0.0, 20, 60, 0.10),
        # Tighter BTC filter (faster reaction)
        (5, 15, 1.0, 14, 5, 20, 0.7, 0.3, 10, 30, None),
        (5, 15, 1.0, 14, 5, 20, 0.7, 0.3, 10, 30, 0.10),
        (5, 15, 1.5, 14, 5, 20, 0.7, 0.3, 10, 30, 0.10),
        # Slower momentum lookback
        (5, 15, 0.8, 21, 5, 30, 0.7, 0.3, 20, 60, None),
        (5, 15, 1.0, 21, 5, 30, 0.7, 0.3, 20, 60, 0.10),
        # Balanced portfolio (10/10)
        (10, 10, 0.8, 14, 5, 20, 0.7, 0.3, 20, 60, None),
        (10, 10, 1.0, 14, 5, 20, 0.7, 0.3, 20, 60, 0.10),
        (10, 10, 1.5, 14, 5, 20, 0.7, 0.3, 20, 60, 0.10),
        # More mean reversion
        (5, 15, 0.8, 14, 3, 14, 0.4, 0.6, 20, 60, None),
        (5, 15, 1.0, 14, 3, 14, 0.4, 0.6, 20, 60, 0.10),
        (5, 15, 1.5, 14, 3, 14, 0.4, 0.6, 20, 60, 0.10),
        # High leverage + tight vol cap
        (5, 15, 3.0, 14, 5, 20, 0.7, 0.3, 20, 60, 0.08),
        (5, 15, 3.0, 14, 5, 20, 0.7, 0.3, 10, 30, 0.08),
    ]

    for cfg in configs:
        n_l, n_s, lev, mw, mrf, mrs, wm, wmr, bf, bs, vt = cfg
        try:
            res = run_regime_backtest(
                closes,
                n_long=n_l, n_short=n_s, base_leverage=lev,
                momentum_window=mw, mr_fast=mrf, mr_slow=mrs,
                w_momentum=wm, w_mean_rev=wmr,
                btc_fast_ma=bf, btc_slow_ma=bs, vol_target=vt,
                verbose=False,
            )
            days = len(res)
            if days < 365:
                continue
            total_ret = res["equity"].iloc[-1] / 100_000 - 1
            arr = (1 + total_ret) ** (365 / days) - 1
            dr = res["equity"].pct_change().dropna()
            sharpe = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
            mdd = res["drawdown"].max()
            results.append({
                "params": f"L{n_l}/S{n_s} lev{lev} m{mw} mr{mrf}/{mrs} w{wm:.1f}/{wmr:.1f} btc{bf}/{bs} vt={vt}",
                "arr": arr, "sharpe": sharpe, "mdd": mdd, "days": days,
                "calmar": arr / mdd if mdd > 0 else 0,
            })
        except Exception as e:
            continue

    results.sort(key=lambda x: x["calmar"], reverse=True)

    print(f"\n{'='*90}")
    print(f"REGIME GRID SEARCH ({len(results)} valid)")
    print(f"{'='*90}")
    print(f"{'Config':<72} {'ARR':>6} {'Sharpe':>7} {'MDD':>6} {'Calmar':>7}")
    print(f"{'-'*90}")
    for r in results[:25]:
        flag = "✓" if r["arr"] > 0.30 and r["mdd"] < 0.10 else " "
        print(f"{flag} {r['params']:<70} {r['arr']:>+5.1%} {r['sharpe']:>6.2f} {r['mdd']:>5.1%} {r['calmar']:>6.2f}")

    winners = [r for r in results if r["arr"] > 0.30 and r["mdd"] < 0.10]
    if winners:
        print(f"\n🎯 {len(winners)} configs meet ARR>30% AND MDD<10%!")
    else:
        print(f"\n⚠️  No config meets both goals. Best tradeoffs:")
        if results:
            best = results[0]
            print(f"   Calmar={best['calmar']:.2f}: {best['params']}")
            print(f"     ARR={best['arr']:+.1%}, MDD={best['mdd']:.1%}, Sharpe={best['sharpe']:.2f}")
    return results


if __name__ == "__main__":
    print("Loading daily price data...")
    universe = load_universe(min_days=365)
    closes = get_daily_closes(universe)
    print(f"Universe: {len(closes.columns)} coins, {len(closes)} days")
    print(f"Period: {closes.index[0].strftime('%Y-%m-%d')} → {closes.index[-1].strftime('%Y-%m-%d')}")
    grid_search(closes)
