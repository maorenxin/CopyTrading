"""Portfolio stop-loss with re-entry strategy.

Core idea: mechanically cap MDD by exiting when portfolio draws down X% from
its recent peak, then wait a cooldown period before re-entering.

Combined with the momentum signal that has Sharpe ~1.3-1.5 when active,
this should allow higher leverage while keeping MDD bounded.

The math: if stop-loss at 5%, even with whipsaws, MDD < 10% is achievable
if the signal has positive expectancy on re-entry.
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


def run_stoploss_backtest(
    closes: pd.DataFrame,
    n_long: int = 5,
    n_short: int = 15,
    leverage: float = 1.0,
    momentum_window: int = 14,
    rebalance_days: int = 1,
    fee_bps: float = 5.5,
    initial_capital: float = 100_000,
    # Stop-loss parameters
    stop_loss_pct: float = 0.05,   # exit at 5% drawdown from local peak
    cooldown_days: int = 5,         # wait N days after stop before re-entry
    peak_reset: bool = True,        # reset peak on re-entry
    # BTC filter (optional)
    btc_ma: int | None = None,      # BTC MA filter period
    btc_exit_dev: float = 0.40,     # exit if BTC > X% above MA
    exclude: list[str] = ["BTC", "HYPE"],
    verbose: bool = True,
) -> pd.DataFrame:
    """L/S with portfolio-level stop-loss and cooldown."""

    coins = [c for c in closes.columns if c != "BTC"]
    sig_mom = signal_momentum(closes, momentum_window)
    daily_rets = closes.pct_change(fill_method=None)

    # Optional BTC filter
    if btc_ma:
        btc_ma_line = closes["BTC"].rolling(btc_ma).mean()
        btc_deviation = (closes["BTC"] - btc_ma_line) / btc_ma_line
    else:
        btc_deviation = pd.Series(0, index=closes.index)

    warmup = max(momentum_window, btc_ma or 0) + 5
    dates = closes.index[warmup:]

    equity = initial_capital
    positions: dict[str, float] = {}
    local_peak = initial_capital  # peak since last entry
    global_peak = initial_capital
    history = []
    rebal_counter = 0
    cooldown_remaining = 0
    in_market = True
    n_stops = 0

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
        global_peak = max(global_peak, equity)

        # Check stop-loss
        day_fees = 0.0
        if in_market:
            local_peak = max(local_peak, equity)
            local_dd = (local_peak - equity) / local_peak

            # BTC filter exit
            dev = btc_deviation.iloc[day_idx] if day_idx < len(btc_deviation) else 0
            if pd.isna(dev):
                dev = 0
            btc_exit = btc_ma and dev > btc_exit_dev

            if local_dd >= stop_loss_pct or btc_exit:
                # STOP: close all positions
                turnover = sum(abs(v) for v in positions.values())
                fee = turnover * fee_bps / 10000
                equity -= fee
                day_fees = fee
                positions = {}
                in_market = False
                cooldown_remaining = cooldown_days
                n_stops += 1

        elif cooldown_remaining > 0:
            cooldown_remaining -= 1
            if cooldown_remaining == 0:
                # Re-enter
                in_market = True
                if peak_reset:
                    local_peak = equity

        # Rebalance (only if in market)
        rebal_counter += 1
        if rebal_counter >= rebalance_days and in_market:
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
        global_dd = (global_peak - equity) / global_peak
        history.append({
            "date": date,
            "equity": equity,
            "daily_pnl": day_pnl,
            "daily_fees": day_fees,
            "leverage": gross / equity if equity > 0 else 0,
            "drawdown": global_dd,
            "local_dd": (local_peak - equity) / local_peak if in_market else 0,
            "in_market": in_market,
        })

    results = pd.DataFrame(history).set_index("date")
    if verbose:
        _print(results, initial_capital, n_stops)
    return results


def _print(results: pd.DataFrame, cap: float, n_stops: int):
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
    print(f"STOP-LOSS L/S  {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days}d)")
    print(f"{'─'*55}")
    print(f"  ARR:      {arr:+.1%}")
    print(f"  Sharpe:   {sharpe:.2f}")
    print(f"  MDD:      {mdd:.1%}")
    print(f"  Calmar:   {calmar:.2f}")
    print(f"  Win mo:   {win_m}/{tot_m} ({win_m/tot_m*100:.0f}%)" if tot_m else "")
    print(f"  In mkt:   {in_pct:.0%} of time")
    print(f"  Stops:    {n_stops}")
    print(f"  Fees:     ${results['daily_fees'].sum():,.0f}")
    print(f"  Final:    ${results['equity'].iloc[-1]:,.0f}")
    print(f"{'─'*55}")


def grid_search(closes: pd.DataFrame):
    """Grid search."""
    results = []

    configs = [
        # (n_l, n_s, lev, mom_w, stop%, cool_d, btc_ma, btc_exit)
        # Tight stop, various leverage
        (5, 15, 0.5, 14, 0.04, 3, None, 0.4),
        (5, 15, 0.6, 14, 0.04, 3, None, 0.4),
        (5, 15, 0.8, 14, 0.04, 3, None, 0.4),
        (5, 15, 1.0, 14, 0.04, 3, None, 0.4),
        (5, 15, 0.5, 14, 0.05, 5, None, 0.4),
        (5, 15, 0.6, 14, 0.05, 5, None, 0.4),
        (5, 15, 0.8, 14, 0.05, 5, None, 0.4),
        (5, 15, 1.0, 14, 0.05, 5, None, 0.4),
        (5, 15, 1.2, 14, 0.05, 5, None, 0.4),
        # With BTC filter
        (5, 15, 0.8, 14, 0.05, 5, 50, 0.30),
        (5, 15, 1.0, 14, 0.05, 5, 50, 0.30),
        (5, 15, 1.0, 14, 0.05, 5, 50, 0.20),
        (5, 15, 1.2, 14, 0.05, 5, 50, 0.30),
        # Wider stop, more leverage
        (5, 15, 1.0, 14, 0.07, 5, None, 0.4),
        (5, 15, 1.2, 14, 0.07, 5, None, 0.4),
        (5, 15, 1.5, 14, 0.07, 5, None, 0.4),
        (5, 15, 1.0, 14, 0.07, 3, 50, 0.30),
        (5, 15, 1.2, 14, 0.07, 3, 50, 0.30),
        # Very tight stop
        (5, 15, 1.0, 14, 0.03, 3, None, 0.4),
        (5, 15, 1.5, 14, 0.03, 3, None, 0.4),
        (5, 15, 2.0, 14, 0.03, 3, None, 0.4),
        (5, 15, 1.5, 14, 0.03, 5, 50, 0.30),
        # Longer cooldown
        (5, 15, 1.0, 14, 0.05, 10, None, 0.4),
        (5, 15, 1.0, 14, 0.05, 10, 50, 0.30),
        (5, 15, 1.2, 14, 0.05, 10, 50, 0.30),
        # Different momentum windows
        (5, 15, 1.0, 7, 0.05, 5, None, 0.4),
        (5, 15, 1.0, 21, 0.05, 5, None, 0.4),
        (5, 15, 1.0, 7, 0.05, 5, 50, 0.30),
        # Balanced book
        (10, 10, 1.0, 14, 0.05, 5, None, 0.4),
        (10, 10, 1.0, 14, 0.05, 5, 50, 0.30),
    ]

    for cfg in configs:
        n_l, n_s, lev, mw, sl, cool, bma, bex = cfg
        try:
            res = run_stoploss_backtest(
                closes, n_long=n_l, n_short=n_s, leverage=lev,
                momentum_window=mw, stop_loss_pct=sl, cooldown_days=cool,
                btc_ma=bma, btc_exit_dev=bex, verbose=False,
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
                "params": f"L{n_l}/S{n_s} lev{lev} m{mw} sl{sl:.0%} cd{cool} btc={bma}/{bex}",
                "arr": arr, "sharpe": sharpe, "mdd": mdd,
                "days": days, "in_market": in_pct,
                "calmar": arr / mdd if mdd > 0 else 0,
            })
        except Exception as e:
            continue

    results.sort(key=lambda x: x["calmar"], reverse=True)

    print(f"\n{'='*95}")
    print(f"STOP-LOSS GRID ({len(results)} valid)")
    print(f"{'='*95}")
    print(f"{'Config':<58} {'ARR':>6} {'Sharpe':>7} {'MDD':>6} {'InMkt':>6} {'Calmar':>7}")
    print(f"{'-'*95}")
    for r in results[:25]:
        flag = "✓" if r["arr"] > 0.30 and r["mdd"] < 0.10 else " "
        print(f"{flag} {r['params']:<56} {r['arr']:>+5.1%} {r['sharpe']:>6.2f} {r['mdd']:>5.1%} {r['in_market']:>5.0%} {r['calmar']:>6.2f}")

    winners = [r for r in results if r["arr"] > 0.30 and r["mdd"] < 0.10]
    if winners:
        print(f"\n🎯 {len(winners)} configs meet ARR>30% AND MDD<10%!")
        for w in winners:
            print(f"   {w['params']} → ARR={w['arr']:+.1%}, MDD={w['mdd']:.1%}")
    else:
        # Show closest to goal
        close = [r for r in results if r["mdd"] < 0.15]
        if close:
            close.sort(key=lambda x: x["arr"], reverse=True)
            print(f"\n⚠️  No config meets both. Closest (MDD<15%):")
            for c in close[:5]:
                print(f"   {c['params']} → ARR={c['arr']:+.1%}, MDD={c['mdd']:.1%}")
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
