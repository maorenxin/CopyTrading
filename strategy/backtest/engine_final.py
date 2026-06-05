"""Final approach: high-conviction L/S with position-level stops.

Key observations from all prior testing:
1. Full-cycle Sharpe ceiling is ~1.3-1.5 for cross-sectional momentum
2. 2021 bull run destroys short strategies regardless of hedging
3. Post-2022, the strategy works much better (more coins, more dispersion)

This script tests:
1. Full 5.5-year period (honest backtest)
2. Post-Jan-2022 period (practical: when HL had enough liquidity)
3. Position-level stops + portfolio-level stops stacked
4. Concentration: fewer positions, higher conviction
5. BTC trend as binary on/off switch (not continuous)
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


def run_final_backtest(
    closes: pd.DataFrame,
    n_long: int = 5,
    n_short: int = 10,
    leverage: float = 0.8,
    momentum_window: int = 14,
    fee_bps: float = 5.5,
    initial_capital: float = 100_000,
    # Position-level stop
    position_stop_pct: float = 0.15,  # close individual position if it moves 15% against
    # Portfolio-level stop
    portfolio_stop_pct: float = 0.06,
    cooldown_days: int = 5,
    # BTC filter
    btc_ma_period: int = 50,
    btc_bull_threshold: float = 0.25,  # BTC > 25% above MA → go flat
    btc_reentry_threshold: float = 0.10,  # re-enter when BTC < 10% above MA
    exclude: list[str] = ["BTC", "HYPE"],
    start_date: str | None = None,
    verbose: bool = True,
) -> pd.DataFrame:
    """High-conviction L/S with position + portfolio stops."""

    if start_date:
        closes = closes[closes.index >= pd.Timestamp(start_date)]

    coins = [c for c in closes.columns if c != "BTC"]
    sig_mom = signal_momentum(closes, momentum_window)
    daily_rets = closes.pct_change(fill_method=None)

    # BTC trend
    btc_ma = closes["BTC"].rolling(btc_ma_period).mean()
    btc_dev = (closes["BTC"] - btc_ma) / btc_ma

    warmup = max(momentum_window, btc_ma_period) + 5
    dates = closes.index[warmup:]

    equity = initial_capital
    positions: dict[str, float] = {}     # coin → notional
    entry_prices: dict[str, float] = {}  # coin → price at entry
    peak_equity = initial_capital
    local_peak = initial_capital
    history = []
    cooldown = 0
    in_market = True
    btc_blocked = False

    for i, date in enumerate(dates):
        day_idx = warmup + i

        # ─── Check position-level stops BEFORE computing PnL ───
        stopped_positions = []
        for coin in list(positions.keys()):
            if coin not in closes.columns:
                continue
            current_price = closes.iloc[day_idx].get(coin, np.nan)
            if pd.isna(current_price) or coin not in entry_prices:
                continue
            entry_price = entry_prices[coin]
            if positions[coin] < 0:  # short position
                pct_move = (current_price - entry_price) / entry_price
                if pct_move > position_stop_pct:  # price went UP = bad for short
                    stopped_positions.append(coin)
            else:  # long position
                pct_move = (entry_price - current_price) / entry_price
                if pct_move > position_stop_pct:  # price went DOWN = bad for long
                    stopped_positions.append(coin)

        # Close stopped positions
        stop_fee = 0
        for coin in stopped_positions:
            stop_fee += abs(positions[coin]) * fee_bps / 10000
            del positions[coin]
            del entry_prices[coin]
        equity -= stop_fee

        # ─── PnL from remaining positions ───
        day_pnl = 0.0
        for coin, notional in positions.items():
            ret = daily_rets.iloc[day_idx].get(coin, 0)
            if pd.isna(ret):
                ret = 0
            day_pnl += notional * ret

        equity += day_pnl
        peak_equity = max(peak_equity, equity)
        global_dd = (peak_equity - equity) / peak_equity

        # ─── BTC regime check ───
        dev = btc_dev.iloc[day_idx] if day_idx < len(btc_dev) else 0
        if pd.isna(dev):
            dev = 0

        if not btc_blocked and dev > btc_bull_threshold:
            btc_blocked = True
            # Close all positions
            if positions:
                turnover = sum(abs(v) for v in positions.values())
                equity -= turnover * fee_bps / 10000
                positions = {}
                entry_prices = {}
        elif btc_blocked and dev < btc_reentry_threshold:
            btc_blocked = False

        # ─── Portfolio stop-loss check ───
        day_fees = stop_fee
        if in_market and not btc_blocked:
            local_peak = max(local_peak, equity)
            local_dd = (local_peak - equity) / local_peak
            if local_dd >= portfolio_stop_pct:
                if positions:
                    turnover = sum(abs(v) for v in positions.values())
                    fee = turnover * fee_bps / 10000
                    equity -= fee
                    day_fees += fee
                    positions = {}
                    entry_prices = {}
                in_market = False
                cooldown = cooldown_days
        elif cooldown > 0:
            cooldown -= 1
            if cooldown == 0:
                in_market = True
                local_peak = equity

        # ─── Rebalance (daily, if allowed) ───
        if in_market and not btc_blocked and date in sig_mom.index:
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

                # Reset entry prices on every rebalance (stop is per-rebalance-period)
                new_entries = {}
                for c in new_pos:
                    price = closes.iloc[day_idx].get(c, np.nan)
                    new_entries[c] = price if not pd.isna(price) else 0

                turnover = 0
                for c in set(list(positions.keys()) + list(new_pos.keys())):
                    turnover += abs(new_pos.get(c, 0) - positions.get(c, 0))
                fee = turnover * fee_bps / 10000
                equity -= fee
                day_fees += fee
                positions = new_pos
                entry_prices = new_entries

        gross = sum(abs(v) for v in positions.values())
        history.append({
            "date": date,
            "equity": equity,
            "daily_pnl": day_pnl,
            "daily_fees": day_fees,
            "leverage": gross / equity if equity > 0 else 0,
            "drawdown": global_dd,
            "in_market": in_market and not btc_blocked,
            "btc_dev": dev,
        })

    results = pd.DataFrame(history).set_index("date")
    if verbose:
        _print(results, initial_capital)
    return results


def _print(results: pd.DataFrame, cap: float):
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
    print(f"  {results.index[0].strftime('%Y-%m-%d')}→{results.index[-1].strftime('%Y-%m-%d')} ({days}d)"
          f"  ARR={arr:+.1%} Sharpe={sharpe:.2f} MDD={mdd:.1%} Calmar={calmar:.2f} InMkt={in_pct:.0%}")


def comprehensive_search(closes: pd.DataFrame):
    """Search across both full period and post-2022."""
    print("\n" + "="*80)
    print("COMPREHENSIVE SEARCH: Full period AND post-2022")
    print("="*80)

    start_dates = [None, "2022-01-01", "2022-06-01", "2023-01-01"]

    configs = [
        # (n_l, n_s, lev, mom_w, pos_stop, port_stop, cool, btc_ma, btc_bull, btc_re)
        (5, 15, 0.6, 14, 0.15, 0.05, 5, 50, 0.25, 0.10),
        (5, 15, 0.8, 14, 0.15, 0.05, 5, 50, 0.25, 0.10),
        (5, 15, 1.0, 14, 0.15, 0.05, 5, 50, 0.25, 0.10),
        (5, 15, 0.6, 14, 0.10, 0.04, 3, 50, 0.25, 0.10),
        (5, 15, 0.8, 14, 0.10, 0.04, 3, 50, 0.25, 0.10),
        (5, 15, 1.0, 14, 0.10, 0.04, 3, 50, 0.25, 0.10),
        (5, 15, 1.2, 14, 0.10, 0.04, 3, 50, 0.25, 0.10),
        # Tighter BTC filter
        (5, 15, 1.0, 14, 0.15, 0.05, 5, 50, 0.15, 0.05),
        (5, 15, 1.0, 14, 0.10, 0.05, 5, 50, 0.15, 0.05),
        (5, 15, 1.2, 14, 0.10, 0.05, 5, 50, 0.15, 0.05),
        # More concentrated
        (3, 8, 0.6, 14, 0.12, 0.05, 5, 50, 0.25, 0.10),
        (3, 8, 0.8, 14, 0.12, 0.05, 5, 50, 0.25, 0.10),
        (3, 8, 1.0, 14, 0.12, 0.05, 5, 50, 0.25, 0.10),
        # Fewer shorts, wider stops
        (5, 10, 0.8, 14, 0.20, 0.06, 5, 50, 0.25, 0.10),
        (5, 10, 1.0, 14, 0.20, 0.06, 5, 50, 0.25, 0.10),
        (5, 10, 1.2, 14, 0.20, 0.06, 5, 50, 0.25, 0.10),
        # No BTC filter (rely purely on stops)
        (5, 15, 0.6, 14, 0.10, 0.05, 5, 50, 9.0, 9.0),
        (5, 15, 0.8, 14, 0.10, 0.05, 5, 50, 9.0, 9.0),
        (5, 15, 0.6, 14, 0.10, 0.04, 3, 50, 9.0, 9.0),
    ]

    all_results = []

    for start in start_dates:
        label = start if start else "Full"
        print(f"\n{'─'*80}")
        print(f"  Period: {label}")
        print(f"{'─'*80}")

        period_results = []
        for cfg in configs:
            n_l, n_s, lev, mw, ps, pts, cd, bma, bb, br = cfg
            try:
                res = run_final_backtest(
                    closes, n_long=n_l, n_short=n_s, leverage=lev,
                    momentum_window=mw, position_stop_pct=ps,
                    portfolio_stop_pct=pts, cooldown_days=cd,
                    btc_ma_period=bma, btc_bull_threshold=bb,
                    btc_reentry_threshold=br,
                    start_date=start, verbose=False,
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
                period_results.append({
                    "period": label,
                    "params": f"L{n_l}/S{n_s} lev{lev} ps{ps:.0%} pts{pts:.0%} cd{cd} btc{bb:.0%}",
                    "arr": arr, "sharpe": sharpe, "mdd": mdd,
                    "days": days, "in_market": in_pct,
                    "calmar": arr / mdd if mdd > 0 else 0,
                })
            except:
                continue

        period_results.sort(key=lambda x: x["calmar"], reverse=True)
        print(f"  {'Config':<52} {'ARR':>6} {'Sharpe':>7} {'MDD':>6} {'InMkt':>6} {'Calmar':>7}")
        for r in period_results[:10]:
            flag = "✓" if r["arr"] > 0.30 and r["mdd"] < 0.10 else " "
            print(f"  {flag}{r['params']:<51} {r['arr']:>+5.1%} {r['sharpe']:>6.2f} {r['mdd']:>5.1%} {r['in_market']:>5.0%} {r['calmar']:>6.2f}")

        all_results.extend(period_results)

    # Final summary: any winners?
    winners = [r for r in all_results if r["arr"] > 0.30 and r["mdd"] < 0.10]
    print(f"\n{'='*80}")
    if winners:
        print(f"🎯 {len(winners)} configs meet ARR>30% AND MDD<10%!")
        for w in winners:
            print(f"   [{w['period']}] {w['params']} → ARR={w['arr']:+.1%}, MDD={w['mdd']:.1%}, Sharpe={w['sharpe']:.2f}")
    else:
        # Show best per period
        print("⚠️  No config meets both ARR>30% AND MDD<10% in any period.")
        print("\nBest Calmar per period:")
        for start in start_dates:
            label = start if start else "Full"
            period = [r for r in all_results if r["period"] == label]
            if period:
                best = period[0]  # already sorted
                print(f"   [{label}] {best['params']} → ARR={best['arr']:+.1%}, MDD={best['mdd']:.1%}, Calmar={best['calmar']:.2f}")

    return all_results


if __name__ == "__main__":
    print("Loading daily price data...")
    universe = load_universe(min_days=365)
    closes = get_daily_closes(universe)
    print(f"Universe: {len(closes.columns)} coins, {len(closes)} days")
    print(f"Period: {closes.index[0].strftime('%Y-%m-%d')} → {closes.index[-1].strftime('%Y-%m-%d')}")
    comprehensive_search(closes)
