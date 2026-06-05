"""Honest L/S momentum backtest — no position stops (unrealistic in crypto).

After exhaustive testing, here's what we know:
- Cross-sectional momentum L/S achieves Sharpe 1.3-1.5 over full cycle
- No additional signal (MR, vol, funding) meaningfully improves this
- The mathematical relationship: Sharpe = ARR / (vol * sqrt(N))
  With Sharpe 1.5: ARR 30% requires vol ~20%, which means MDD ~25-30%
  With Sharpe 1.5: MDD 10% requires vol ~7%, which means ARR ~10%

The ONLY way to achieve both ARR>30% AND MDD<10% simultaneously is Sharpe > 3.0,
which is virtually impossible for any single liquid strategy over a full cycle.

This script provides the HONEST best-achievable results, plus a sensitivity
analysis showing the Sharpe frontier.
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


def run_honest_backtest(
    closes: pd.DataFrame,
    n_long: int = 5,
    n_short: int = 15,
    leverage: float = 0.6,
    momentum_window: int = 14,
    fee_bps: float = 5.5,
    initial_capital: float = 100_000,
    # BTC filter
    btc_ma: int = 50,
    btc_max_dev: float = 0.30,  # scale to 20% exposure when BTC > 30% above MA
    min_scale: float = 0.2,     # minimum exposure scale
    # Vol target
    vol_target: float | None = None,
    exclude: list[str] = ["BTC", "HYPE"],
    start_date: str | None = None,
    verbose: bool = True,
) -> pd.DataFrame:
    """Honest L/S backtest. No position stops. No look-ahead."""

    if start_date:
        closes = closes[closes.index >= pd.Timestamp(start_date)]

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
    history = []
    recent_rets = []

    for i, date in enumerate(dates):
        day_idx = warmup + i

        # PnL (no stops, no look-ahead)
        day_pnl = 0.0
        for coin, notional in positions.items():
            ret = daily_rets.iloc[day_idx].get(coin, 0)
            if pd.isna(ret):
                ret = 0
            day_pnl += notional * ret

        equity += day_pnl
        if equity > 0:
            recent_rets.append(day_pnl / equity)
        if len(recent_rets) > 20:
            recent_rets.pop(0)

        peak_equity = max(peak_equity, equity)
        dd = (peak_equity - equity) / peak_equity

        # Rebalance daily
        day_fees = 0.0
        if date in sig_mom.index:
            scores = sig_mom.loc[date].drop(exclude, errors="ignore").dropna()
            if len(scores) >= n_long + n_short:
                # BTC regime scale
                dev = btc_dev.iloc[day_idx] if day_idx < len(btc_dev) else 0
                if pd.isna(dev):
                    dev = 0
                if dev > 0:
                    btc_scale = max(min_scale, 1.0 - (dev / btc_max_dev) * (1 - min_scale))
                else:
                    btc_scale = 1.0

                # Vol target scale
                vol_scale = 1.0
                if vol_target and len(recent_rets) >= 10:
                    realized_vol = np.std(recent_rets) * np.sqrt(365)
                    if realized_vol > 0:
                        vol_scale = min(2.0, vol_target / realized_vol)
                        vol_scale = max(0.1, vol_scale)

                actual_lev = leverage * btc_scale * vol_scale
                actual_lev = np.clip(actual_lev, 0.05, leverage * 2)

                # Portfolio construction
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
                day_fees = fee
                positions = new_pos

        gross = sum(abs(v) for v in positions.values())
        history.append({
            "date": date,
            "equity": equity,
            "daily_pnl": day_pnl,
            "daily_fees": day_fees,
            "leverage": gross / equity if equity > 0 else 0,
            "drawdown": dd,
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
    neg_dr = dr[dr < 0]
    sortino = dr.mean() / neg_dr.std() * np.sqrt(365) if len(neg_dr) > 0 and neg_dr.std() > 0 else 0
    mdd = results["drawdown"].max()
    calmar = arr / mdd if mdd > 0 else 0
    vol = dr.std() * np.sqrt(365)
    monthly = results["equity"].resample("ME").last().pct_change().dropna()
    win_m = (monthly > 0).sum()
    tot_m = len(monthly)

    print(f"\n{'─'*60}")
    print(f"  {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days}d)")
    print(f"{'─'*60}")
    print(f"  ARR:      {arr:+.1%}")
    print(f"  Sharpe:   {sharpe:.2f}")
    print(f"  Sortino:  {sortino:.2f}")
    print(f"  MDD:      {mdd:.1%}")
    print(f"  Calmar:   {calmar:.2f}")
    print(f"  Vol:      {vol:.1%}")
    print(f"  Win mo:   {win_m}/{tot_m} ({win_m/tot_m*100:.0f}%)" if tot_m else "")
    print(f"  Avg lev:  {results['leverage'].mean():.2f}x")
    print(f"  Fees:     ${results['daily_fees'].sum():,.0f}")
    print(f"  Final:    ${results['equity'].iloc[-1]:,.0f}")
    print(f"{'─'*60}")


def sharpe_frontier(closes: pd.DataFrame):
    """Show the Sharpe frontier: what ARR/MDD combos are achievable."""
    print("\n" + "="*70)
    print("SHARPE FRONTIER: ARR vs MDD at different leverage levels")
    print("="*70)

    # First, find the base Sharpe over different periods
    periods = [
        (None, "Full (2020-2026)"),
        ("2022-01-01", "Post-2022"),
        ("2023-01-01", "Post-2023"),
    ]

    for start, label in periods:
        print(f"\n{'─'*70}")
        print(f"  {label}")
        print(f"{'─'*70}")
        print(f"  {'Leverage':<10} {'ARR':>8} {'Sharpe':>8} {'MDD':>8} {'Vol':>8} {'Calmar':>8}")

        leverages = [0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2, 1.5]
        for lev in leverages:
            res = run_honest_backtest(
                closes, leverage=lev, btc_max_dev=0.30,
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
            vol = dr.std() * np.sqrt(365)
            calmar = arr / mdd if mdd > 0 else 0
            flag = "✓" if arr > 0.30 and mdd < 0.10 else " "
            print(f"  {flag} {lev:<8.1f} {arr:>+7.1%} {sharpe:>7.2f} {mdd:>7.1%} {vol:>7.1%} {calmar:>7.2f}")

    # Now show with vol targeting
    print(f"\n{'─'*70}")
    print(f"  With Vol Targeting (base_lev=1.0)")
    print(f"{'─'*70}")
    print(f"  {'VolTarget':<10} {'ARR':>8} {'Sharpe':>8} {'MDD':>8} {'Vol':>8} {'Calmar':>8} {'Period':<12}")

    for start, label in periods:
        for vt in [0.05, 0.08, 0.10, 0.12, 0.15, 0.20, 0.25]:
            res = run_honest_backtest(
                closes, leverage=1.0, vol_target=vt,
                btc_max_dev=0.30, start_date=start, verbose=False,
            )
            days = len(res)
            if days < 365:
                continue
            total_ret = res["equity"].iloc[-1] / 100_000 - 1
            arr = (1 + total_ret) ** (365 / days) - 1
            dr = res["equity"].pct_change().dropna()
            sharpe = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
            mdd = res["drawdown"].max()
            vol = dr.std() * np.sqrt(365)
            calmar = arr / mdd if mdd > 0 else 0
            flag = "✓" if arr > 0.30 and mdd < 0.10 else " "
            print(f"  {flag} {vt:<8.0%} {arr:>+7.1%} {sharpe:>7.2f} {mdd:>7.1%} {vol:>7.1%} {calmar:>7.2f} {label[:10]}")


if __name__ == "__main__":
    print("Loading daily price data...")
    universe = load_universe(min_days=365)
    closes = get_daily_closes(universe)
    print(f"Universe: {len(closes.columns)} coins, {len(closes)} days")
    print(f"Period: {closes.index[0].strftime('%Y-%m-%d')} → {closes.index[-1].strftime('%Y-%m-%d')}")
    sharpe_frontier(closes)
