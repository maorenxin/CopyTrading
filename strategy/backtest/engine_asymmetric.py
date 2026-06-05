"""Capital-efficient L/S: deploy only a fraction of capital, keep rest as buffer.

Key insight: if we only deploy 30% of equity but the deployed portion earns
high returns (Sharpe 1.3+), then:
  - MDD on total equity = deployed_fraction * MDD_on_deployed
  - ARR on total equity = deployed_fraction * ARR_on_deployed

With Sharpe 1.5 on the deployed capital:
  - Deploy 30%, lev 2.0x on deployed → effective 0.6x on total equity
  - If deployed portion has ARR ~90%, total ARR = 27%
  - If deployed portion has MDD ~45%, total MDD = 13.5%

But that math doesn't work... We need even higher Sharpe on deployed capital.

Alternative approach: ASYMMETRIC position sizing.
  - Start with base exposure
  - After a win streak, compound (Kelly-style)
  - After a loss, halve exposure for N days
  - This creates an asymmetric return profile that can achieve higher Calmar

Also testing: signal strength filtering — only trade when signal is STRONG.
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


def run_asymmetric_backtest(
    closes: pd.DataFrame,
    n_long: int = 5,
    n_short: int = 15,
    base_leverage: float = 0.6,
    momentum_window: int = 14,
    fee_bps: float = 5.5,
    initial_capital: float = 100_000,
    # Asymmetric sizing
    win_scale: float = 1.3,      # scale up after profitable period
    loss_scale: float = 0.4,     # scale down after losing period
    lookback_sizing: int = 10,   # days to assess recent performance
    # Regime
    btc_ma: int = 50,
    btc_max_dev: float = 0.35,   # scale down when BTC extended
    # Risk limits
    max_leverage: float = 1.5,
    min_leverage: float = 0.1,
    stop_loss_pct: float = 0.06,  # portfolio stop
    cooldown_days: int = 5,
    exclude: list[str] = ["BTC", "HYPE"],
    verbose: bool = True,
) -> pd.DataFrame:
    """L/S with asymmetric position sizing."""

    coins = [c for c in closes.columns if c != "BTC"]
    sig_mom = signal_momentum(closes, momentum_window)
    daily_rets = closes.pct_change(fill_method=None)

    btc_ma_line = closes["BTC"].rolling(btc_ma).mean()
    btc_dev = (closes["BTC"] - btc_ma_line) / btc_ma_line

    warmup = max(momentum_window, btc_ma) + 5
    dates = closes.index[warmup:]

    equity = initial_capital
    positions: dict[str, float] = {}
    peak_equity = initial_capital
    local_peak = initial_capital
    history = []
    cooldown = 0
    in_market = True
    daily_pnls = []

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
        daily_pnls.append(day_pnl / max(equity, 1))
        if len(daily_pnls) > lookback_sizing:
            daily_pnls.pop(0)

        peak_equity = max(peak_equity, equity)
        global_dd = (peak_equity - equity) / peak_equity

        # Stop-loss check
        day_fees = 0.0
        if in_market:
            local_peak = max(local_peak, equity)
            local_dd = (local_peak - equity) / local_peak
            if local_dd >= stop_loss_pct:
                turnover = sum(abs(v) for v in positions.values())
                fee = turnover * fee_bps / 10000
                equity -= fee
                day_fees = fee
                positions = {}
                in_market = False
                cooldown = cooldown_days
        elif cooldown > 0:
            cooldown -= 1
            if cooldown == 0:
                in_market = True
                local_peak = equity

        # Rebalance daily if in market
        if in_market and date in sig_mom.index:
            scores = sig_mom.loc[date].drop(exclude, errors="ignore").dropna()
            if len(scores) >= n_long + n_short:
                # Asymmetric leverage calculation
                recent_perf = sum(daily_pnls[-lookback_sizing:]) if len(daily_pnls) >= lookback_sizing else 0
                if recent_perf > 0:
                    size_scale = win_scale
                else:
                    size_scale = loss_scale

                # BTC deviation scale
                dev = btc_dev.iloc[day_idx] if day_idx < len(btc_dev) else 0
                if pd.isna(dev):
                    dev = 0
                btc_scale = max(0.2, 1.0 - max(0, dev) / btc_max_dev * 0.8)

                actual_lev = base_leverage * size_scale * btc_scale
                actual_lev = np.clip(actual_lev, min_leverage, max_leverage)

                sorted_s = scores.sort_values(ascending=False)
                short_coins = sorted_s.head(n_short).index.tolist()
                long_coins = sorted_s.tail(n_long).index.tolist()

                exposure = equity * actual_lev
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
            "drawdown": global_dd,
            "in_market": in_market,
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
    print(f"  ARR={arr:+.1%} Sharpe={sharpe:.2f} MDD={mdd:.1%} Calmar={calmar:.2f} InMkt={in_pct:.0%} Lev={results['leverage'].mean():.2f}x")


def grid_search(closes: pd.DataFrame):
    """Comprehensive grid search."""
    results = []

    configs = [
        # (n_l, n_s, base_lev, mom_w, win_s, loss_s, lb, btc_ma, btc_dev, max_lev, stop, cool)
        # Standard configs with asymmetric sizing
        (5, 15, 0.5, 14, 1.3, 0.4, 10, 50, 0.35, 1.2, 0.05, 5),
        (5, 15, 0.6, 14, 1.3, 0.4, 10, 50, 0.35, 1.5, 0.05, 5),
        (5, 15, 0.8, 14, 1.3, 0.4, 10, 50, 0.35, 1.5, 0.05, 5),
        (5, 15, 0.6, 14, 1.5, 0.3, 10, 50, 0.35, 1.5, 0.05, 5),
        (5, 15, 0.8, 14, 1.5, 0.3, 10, 50, 0.35, 2.0, 0.05, 5),
        # More aggressive win scaling
        (5, 15, 0.5, 14, 2.0, 0.3, 10, 50, 0.35, 2.0, 0.05, 5),
        (5, 15, 0.6, 14, 2.0, 0.3, 10, 50, 0.35, 2.5, 0.05, 5),
        (5, 15, 0.6, 14, 2.0, 0.2, 10, 50, 0.35, 2.0, 0.04, 5),
        # Tighter stop
        (5, 15, 0.6, 14, 1.5, 0.3, 10, 50, 0.35, 1.5, 0.04, 3),
        (5, 15, 0.8, 14, 1.5, 0.3, 10, 50, 0.35, 1.5, 0.04, 3),
        (5, 15, 1.0, 14, 1.5, 0.3, 10, 50, 0.35, 2.0, 0.04, 3),
        # Aggressive base + tight risk
        (5, 15, 1.0, 14, 1.5, 0.3, 10, 50, 0.25, 2.0, 0.04, 5),
        (5, 15, 1.2, 14, 1.5, 0.3, 10, 50, 0.25, 2.0, 0.04, 5),
        # No BTC filter (rely on asymmetric sizing)
        (5, 15, 0.6, 14, 1.5, 0.3, 10, 50, 99.0, 1.5, 0.05, 5),
        (5, 15, 0.8, 14, 1.5, 0.3, 10, 50, 99.0, 1.5, 0.05, 5),
        # Shorter lookback for sizing
        (5, 15, 0.6, 14, 1.5, 0.3, 5, 50, 0.35, 1.5, 0.05, 5),
        (5, 15, 0.6, 14, 2.0, 0.3, 5, 50, 0.35, 2.0, 0.05, 3),
        # Different momentum windows
        (5, 15, 0.6, 7, 1.5, 0.3, 10, 50, 0.35, 1.5, 0.05, 5),
        (5, 15, 0.6, 21, 1.5, 0.3, 10, 50, 0.35, 1.5, 0.05, 5),
        # Extreme asymmetry
        (5, 15, 0.4, 14, 3.0, 0.2, 10, 50, 0.30, 2.5, 0.03, 5),
        (5, 15, 0.5, 14, 3.0, 0.2, 10, 50, 0.30, 3.0, 0.03, 3),
    ]

    for cfg in configs:
        n_l, n_s, bl, mw, ws, ls, lb, bma, bd, ml, sl, cd = cfg
        try:
            res = run_asymmetric_backtest(
                closes, n_long=n_l, n_short=n_s, base_leverage=bl,
                momentum_window=mw, win_scale=ws, loss_scale=ls,
                lookback_sizing=lb, btc_ma=bma, btc_max_dev=bd,
                max_leverage=ml, stop_loss_pct=sl, cooldown_days=cd,
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
                "params": f"bl{bl} w{ws}/l{ls} lb{lb} btc{bd} ml{ml} sl{sl:.0%} cd{cd}",
                "arr": arr, "sharpe": sharpe, "mdd": mdd, "days": days,
                "calmar": arr / mdd if mdd > 0 else 0,
            })
        except Exception as e:
            continue

    results.sort(key=lambda x: x["calmar"], reverse=True)

    print(f"\n{'='*90}")
    print(f"ASYMMETRIC SIZING GRID ({len(results)} valid)")
    print(f"{'='*90}")
    print(f"{'Config':<52} {'ARR':>6} {'Sharpe':>7} {'MDD':>6} {'Calmar':>7}")
    print(f"{'-'*90}")
    for r in results[:25]:
        flag = "✓" if r["arr"] > 0.30 and r["mdd"] < 0.10 else " "
        print(f"{flag} {r['params']:<50} {r['arr']:>+5.1%} {r['sharpe']:>6.2f} {r['mdd']:>5.1%} {r['calmar']:>6.2f}")

    winners = [r for r in results if r["arr"] > 0.30 and r["mdd"] < 0.10]
    if winners:
        print(f"\n🎯 {len(winners)} configs meet ARR>30% AND MDD<10%!")
    else:
        # Show Pareto front
        print(f"\n⚠️  No config meets both goals.")
        low_mdd = [r for r in results if r["mdd"] < 0.15]
        if low_mdd:
            low_mdd.sort(key=lambda x: x["arr"], reverse=True)
            print(f"   Best with MDD<15%:")
            for c in low_mdd[:3]:
                print(f"     {c['params']} → ARR={c['arr']:+.1%}, MDD={c['mdd']:.1%}, Sharpe={c['sharpe']:.2f}")
    return results


if __name__ == "__main__":
    print("Loading daily price data...")
    universe = load_universe(min_days=365)
    closes = get_daily_closes(universe)
    print(f"Universe: {len(closes.columns)} coins, {len(closes)} days")
    print(f"Period: {closes.index[0].strftime('%Y-%m-%d')} → {closes.index[-1].strftime('%Y-%m-%d')}")
    grid_search(closes)
