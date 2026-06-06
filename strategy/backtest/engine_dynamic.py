"""Dynamic universe L/S momentum backtest.

Instead of statically excluding coins, dynamically assess each coin's
suitability for momentum trading via rolling metrics:

1. Autocorrelation method: rolling autocorrelation of 14d returns
   Positive = trending (momentum works), Negative = mean-reverting

2. Variance ratio method: Var(14d ret) / (14 * Var(1d ret))
   > 1 = trending, < 1 = mean-reverting

3. Signal PnL method: rolling average PnL when signal is applied to this coin
   (uses shift(2) to be strictly causal — no look-ahead)

All methods are purely backward-looking with explicit lag to prevent look-ahead bias.
"""
import pandas as pd
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
from price_loader import load_universe, get_daily_closes


def signal_momentum(closes: pd.DataFrame, window: int = 14) -> pd.DataFrame:
    """Rank-normalized relative momentum signal."""
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


def filter_autocorr(closes: pd.DataFrame, eval_window: int = 60) -> pd.DataFrame:
    """Rolling autocorrelation of 14d returns. Positive = trending."""
    coins = [c for c in closes.columns if c != "BTC"]
    mom_rets = closes[coins].pct_change(14, fill_method=None)
    lagged = mom_rets.shift(14)
    autocorr = mom_rets.rolling(eval_window, min_periods=eval_window // 2).corr(lagged)
    # Shift 1: on day T, use data up to T-1
    return autocorr.shift(1)


def filter_variance_ratio(closes: pd.DataFrame, eval_window: int = 60) -> pd.DataFrame:
    """Variance ratio: Var(14d)/14*Var(1d). >1 = trending, <1 = mean-reverting."""
    coins = [c for c in closes.columns if c != "BTC"]
    daily_rets = closes[coins].pct_change(fill_method=None)
    long_rets = closes[coins].pct_change(14, fill_method=None)
    var_long = long_rets.rolling(eval_window, min_periods=eval_window // 2).var()
    var_short = daily_rets.rolling(eval_window, min_periods=eval_window // 2).var()
    vr = var_long / (14 * var_short)
    return vr.shift(1)


def filter_signal_pnl(
    closes: pd.DataFrame, signals: pd.DataFrame, eval_window: int = 60
) -> pd.DataFrame:
    """Rolling PnL of the signal applied to each coin individually.

    On day T: signal says short (rank > 0.5) or long (rank < 0.5).
    Next-day return determines if signal was right.
    We track rolling sum of signal_direction * actual_return.

    Shift(2) to be strictly causal:
    - Signal on day T uses prices up to T (14d lookback)
    - Next-day return = close[T+1]/close[T] - 1
    - So on day T+1 close, we know if T's signal was right
    - On day T+2 rebalance, we can safely use this info
    """
    coins = [c for c in signals.columns if c in closes.columns]
    daily_rets = closes[coins].pct_change(fill_method=None)

    # Signal direction: >0.5 means short candidate, <0.5 means long candidate
    signal_dir = signals[coins] - 0.5  # positive = short, negative = long

    # PnL if we follow the signal: short when signal says short
    # For short: PnL = -return (profit when price drops)
    # For long: PnL = +return (profit when price rises)
    # Combined: PnL = -signal_dir * return (sign convention)
    # Wait: signal_dir > 0 means short, short PnL = -ret
    # signal_dir < 0 means long, long PnL = +ret = -signal_dir_sign * ret ... hmm
    # Simpler: if we scale position by -signal_dir (short when positive), PnL = -signal_dir * ret
    signal_pnl = -signal_dir * daily_rets[coins].shift(-1)

    # Rolling sum
    rolling_pnl = signal_pnl.rolling(eval_window, min_periods=eval_window // 2).mean()

    # Shift 2: strictly causal (signal on T, outcome on T+1, usable on T+2)
    return rolling_pnl.shift(2)


def run_dynamic_backtest(
    closes: pd.DataFrame,
    n_long: int = 7,
    n_short: int = 15,
    leverage: float = 0.21,
    momentum_window: int = 14,
    fee_bps: float = 1.0,
    initial_capital: float = 100_000,
    # Dynamic filter params
    filter_method: str = "autocorr",  # "autocorr", "variance_ratio", "signal_pnl", "none"
    eval_window: int = 60,
    filter_threshold: float = 0.0,  # exclude coins below this
    # BTC filter
    btc_ma: int = 50,
    btc_max_dev: float = 0.30,
    min_scale: float = 0.2,
    # Vol target
    vol_target: float | None = None,
    exclude: list[str] | None = None,
    start_date: str | None = None,
    verbose: bool = True,
) -> pd.DataFrame:
    """L/S backtest with dynamic coin filtering."""

    if exclude is None:
        exclude = ["BTC", "HYPE"]

    if start_date:
        closes = closes[closes.index >= pd.Timestamp(start_date)]

    sig_mom = signal_momentum(closes, momentum_window)
    daily_rets = closes.pct_change(fill_method=None)

    # Compute filter
    if filter_method == "autocorr":
        filt = filter_autocorr(closes, eval_window)
    elif filter_method == "variance_ratio":
        filt = filter_variance_ratio(closes, eval_window)
        if filter_threshold == 0.0:
            filter_threshold = 1.0  # VR threshold: >1 = trending
    elif filter_method == "signal_pnl":
        filt = filter_signal_pnl(closes, sig_mom, eval_window)
    else:
        filt = None

    btc_ma_line = closes["BTC"].rolling(btc_ma).mean()
    btc_dev = (closes["BTC"] - btc_ma_line) / btc_ma_line

    warmup = max(momentum_window, btc_ma, eval_window + 14) + 5
    dates = closes.index[warmup:]

    equity = initial_capital
    positions: dict[str, float] = {}
    peak_equity = initial_capital
    history = []
    recent_rets = []

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
            recent_rets.append(day_pnl / equity)
        if len(recent_rets) > 20:
            recent_rets.pop(0)

        peak_equity = max(peak_equity, equity)
        dd = (peak_equity - equity) / peak_equity

        # Rebalance
        day_fees = 0.0
        n_excluded = 0
        if date in sig_mom.index:
            scores = sig_mom.loc[date].drop(exclude, errors="ignore").dropna()

            # Dynamic filter
            if filt is not None and date in filt.index:
                filt_today = filt.loc[date]
                # Exclude coins with filter value below threshold
                bad_coins = []
                for coin in scores.index:
                    if coin in filt_today.index:
                        val = filt_today[coin]
                        if pd.notna(val) and val < filter_threshold:
                            bad_coins.append(coin)
                scores = scores.drop(bad_coins, errors="ignore")
                n_excluded = len(bad_coins)

            if len(scores) >= n_long + n_short:
                # BTC regime scale
                dev = btc_dev.iloc[day_idx] if day_idx < len(btc_dev) else 0
                if pd.isna(dev):
                    dev = 0
                btc_scale = max(min_scale, 1.0 - (dev / btc_max_dev) * (1 - min_scale)) if dev > 0 else 1.0

                # Vol target scale
                vol_scale = 1.0
                if vol_target and len(recent_rets) >= 10:
                    realized_vol = np.std(recent_rets) * np.sqrt(365)
                    if realized_vol > 0:
                        vol_scale = np.clip(vol_target / realized_vol, 0.1, 2.0)

                actual_lev = np.clip(leverage * btc_scale * vol_scale, 0.05, leverage * 2)

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

                turnover = sum(
                    abs(new_pos.get(c, 0) - positions.get(c, 0))
                    for c in set(list(positions.keys()) + list(new_pos.keys()))
                )
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
            "n_excluded": n_excluded,
        })

    results = pd.DataFrame(history).set_index("date")
    if verbose:
        _print(results, initial_capital, filter_method)
    return results


def _print(results: pd.DataFrame, cap: float, method: str = ""):
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
    avg_excluded = results["n_excluded"].mean()

    print(f"\n{'─'*60}")
    print(f"  DYNAMIC FILTER [{method}]")
    print(f"  {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days}d)")
    print(f"{'─'*60}")
    print(f"  ARR:          {arr:+.1%}")
    print(f"  Sharpe:       {sharpe:.2f}")
    print(f"  Sortino:      {sortino:.2f}")
    print(f"  MDD:          {mdd:.1%}")
    print(f"  Calmar:       {calmar:.2f}")
    print(f"  Vol:          {vol:.1%}")
    if tot_m:
        print(f"  Win mo:       {win_m}/{tot_m} ({win_m/tot_m*100:.0f}%)")
    print(f"  Avg lev:      {results['leverage'].mean():.2f}x")
    print(f"  Avg excluded: {avg_excluded:.1f} coins")
    print(f"  Fees:         ${results['daily_fees'].sum():,.0f}")
    print(f"  Final:        ${results['equity'].iloc[-1]:,.0f}")
    print(f"{'─'*60}")


if __name__ == "__main__":
    print("Loading daily price data...")
    universe = load_universe(min_days=365)
    closes = get_daily_closes(universe)
    print(f"Universe: {len(closes.columns)} coins, {len(closes)} days")
    print(f"Period: {closes.index[0].strftime('%Y-%m-%d')} → {closes.index[-1].strftime('%Y-%m-%d')}")

    START = "2022-03-01"
    BASE_PARAMS = dict(n_long=7, n_short=15, leverage=0.21, momentum_window=14, fee_bps=1.0)

    # Baseline: no filter
    print("\n" + "=" * 70)
    print("BASELINE: No exclusion (full 75 coins)")
    print("=" * 70)
    run_dynamic_backtest(closes, **BASE_PARAMS, filter_method="none", start_date=START)

    # Compare all filter methods
    print("\n" + "=" * 70)
    print("DYNAMIC FILTER COMPARISON")
    print("=" * 70)

    configs = [
        # (method, eval_window, threshold, label)
        ("autocorr", 30, 0.0, "autocorr w=30 thr=0"),
        ("autocorr", 60, 0.0, "autocorr w=60 thr=0"),
        ("autocorr", 90, 0.0, "autocorr w=90 thr=0"),
        ("autocorr", 60, 0.05, "autocorr w=60 thr=0.05"),
        ("autocorr", 60, -0.05, "autocorr w=60 thr=-0.05"),
        ("variance_ratio", 60, 0.8, "VR w=60 thr=0.8"),
        ("variance_ratio", 60, 1.0, "VR w=60 thr=1.0"),
        ("variance_ratio", 90, 0.8, "VR w=90 thr=0.8"),
        ("variance_ratio", 90, 1.0, "VR w=90 thr=1.0"),
        ("signal_pnl", 30, 0.0, "sigPnL w=30 thr=0"),
        ("signal_pnl", 60, 0.0, "sigPnL w=60 thr=0"),
        ("signal_pnl", 90, 0.0, "sigPnL w=90 thr=0"),
        ("signal_pnl", 120, 0.0, "sigPnL w=120 thr=0"),
    ]

    print(f"\n{'Config':<25} {'ARR':>7} {'Sharpe':>7} {'MDD':>7} {'AvgExcl':>8}")
    print("─" * 60)

    for method, eval_w, thr, label in configs:
        res = run_dynamic_backtest(
            closes, **BASE_PARAMS,
            filter_method=method, eval_window=eval_w, filter_threshold=thr,
            start_date=START, verbose=False,
        )
        days = len(res)
        if days < 365:
            print(f"  {label:<23} (insufficient data)")
            continue
        total_ret = res["equity"].iloc[-1] / 100_000 - 1
        arr = (1 + total_ret) ** (365 / days) - 1
        dr = res["equity"].pct_change().dropna()
        sharpe = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
        mdd = res["drawdown"].max()
        avg_excl = res["n_excluded"].mean()
        flag = "✓" if arr > 0.30 and mdd < 0.10 else " "
        print(f"{flag} {label:<23} {arr:>+6.1%} {sharpe:>7.2f} {mdd:>6.1%} {avg_excl:>7.1f}")
