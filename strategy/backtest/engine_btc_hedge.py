"""Short garbage alts + Long BTC hedge strategy.

Key difference from previous L/S:
- Previous: short bottom-momentum alts, long top-momentum alts
- This: short bottom-momentum alts, long BTC as hedge

Why this might work better:
1. BTC is less volatile than alt longs → lower portfolio volatility
2. "Garbage" alts underperform BTC by definition (that's the signal)
3. Funding income: shorts receive positive funding on alt perps (~0.01-0.03% per 8h)
4. BTC has positive drift long-term → long BTC adds returns in bull

Also includes:
- Estimated funding income (conservative 0.01% per 8h = ~11% APR on short notional)
- Beta-adjusted hedge ratio (alts have beta >1 to BTC)
- Signal conviction filtering (only trade when dispersion is high)
"""
import pandas as pd
import numpy as np
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
from price_loader import load_universe, get_daily_closes


def signal_momentum(closes: pd.DataFrame, window: int = 14) -> pd.DataFrame:
    """Relative momentum vs BTC. High → underperforming BTC → short."""
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


def compute_rolling_beta(closes: pd.DataFrame, window: int = 30) -> pd.DataFrame:
    """Rolling beta of each alt to BTC."""
    coins = [c for c in closes.columns if c != "BTC"]
    rets = closes.pct_change(fill_method=None)
    btc_rets = rets["BTC"]

    betas = pd.DataFrame(index=closes.index, columns=coins, dtype=float)
    btc_var = btc_rets.rolling(window).var()

    for coin in coins:
        cov = rets[coin].rolling(window).cov(btc_rets)
        betas[coin] = cov / btc_var

    return betas.clip(0.5, 3.0)  # cap extreme betas


def run_btc_hedge_backtest(
    closes: pd.DataFrame,
    n_short: int = 15,
    short_leverage: float = 0.5,
    hedge_ratio: float = 0.8,     # hedge X% of short beta with BTC long
    momentum_window: int = 14,
    fee_bps: float = 5.5,
    initial_capital: float = 100_000,
    # Funding income assumption
    funding_rate_8h: float = 0.0001,  # 0.01% per 8h (conservative)
    # Signal conviction
    min_dispersion: float | None = None,  # only trade when dispersion > threshold
    # Beta adjustment
    use_beta_hedge: bool = True,
    beta_window: int = 30,
    exclude: list[str] = ["BTC", "HYPE"],
    start_date: str | None = None,
    verbose: bool = True,
) -> pd.DataFrame:
    """Short garbage alts + long BTC backtest."""

    if start_date:
        closes = closes[closes.index >= pd.Timestamp(start_date)]

    coins = [c for c in closes.columns if c != "BTC"]
    sig_mom = signal_momentum(closes, momentum_window)
    daily_rets = closes.pct_change(fill_method=None)

    # Rolling betas for hedge sizing
    if use_beta_hedge:
        betas = compute_rolling_beta(closes, beta_window)

    # Cross-sectional dispersion (for conviction filter)
    xsec_std = daily_rets[coins].std(axis=1).rolling(20).mean()

    warmup = max(momentum_window, beta_window, 20) + 5
    dates = closes.index[warmup:]

    equity = initial_capital
    short_positions: dict[str, float] = {}  # coin → negative notional
    btc_long: float = 0.0
    peak_equity = initial_capital
    history = []

    daily_funding_rate = funding_rate_8h * 3  # 3 funding periods per day

    for i, date in enumerate(dates):
        day_idx = warmup + i

        # PnL from shorts
        day_pnl_shorts = 0.0
        for coin, notional in short_positions.items():
            ret = daily_rets.iloc[day_idx].get(coin, 0)
            if pd.isna(ret):
                ret = 0
            day_pnl_shorts += notional * ret  # notional is negative, so up move = loss

        # PnL from BTC long
        btc_ret = daily_rets.iloc[day_idx].get("BTC", 0)
        if pd.isna(btc_ret):
            btc_ret = 0
        day_pnl_btc = btc_long * btc_ret

        # Funding income: shorts receive funding
        short_notional_total = sum(abs(v) for v in short_positions.values())
        day_funding = short_notional_total * daily_funding_rate

        day_pnl = day_pnl_shorts + day_pnl_btc + day_funding
        equity += day_pnl
        peak_equity = max(peak_equity, equity)
        dd = (peak_equity - equity) / peak_equity

        # Rebalance daily
        day_fees = 0.0
        if date in sig_mom.index:
            scores = sig_mom.loc[date].drop(exclude, errors="ignore").dropna()

            # Conviction filter: skip if dispersion too low
            disp = xsec_std.iloc[day_idx] if day_idx < len(xsec_std) else 0
            if pd.isna(disp):
                disp = 0
            skip_trade = min_dispersion is not None and disp < min_dispersion

            if len(scores) >= n_short and not skip_trade:
                # Select top-score coins to short
                sorted_s = scores.sort_values(ascending=False)
                short_coins = sorted_s.head(n_short).index.tolist()

                # Compute short positions
                short_exp = equity * short_leverage
                new_shorts = {}
                for c in short_coins:
                    new_shorts[c] = -short_exp / n_short

                # Beta-adjusted BTC hedge
                if use_beta_hedge:
                    # Weighted avg beta of short basket
                    avg_beta = 0
                    for c in short_coins:
                        b = betas.iloc[day_idx].get(c, 1.0)
                        if pd.isna(b):
                            b = 1.0
                        avg_beta += b
                    avg_beta /= n_short
                    new_btc_long = short_exp * avg_beta * hedge_ratio
                else:
                    new_btc_long = short_exp * hedge_ratio

                # Compute turnover and fees
                turnover = abs(new_btc_long - btc_long)
                for c in set(list(short_positions.keys()) + list(new_shorts.keys())):
                    turnover += abs(new_shorts.get(c, 0) - short_positions.get(c, 0))
                fee = turnover * fee_bps / 10000
                equity -= fee
                day_fees = fee

                short_positions = new_shorts
                btc_long = new_btc_long

        gross = sum(abs(v) for v in short_positions.values()) + abs(btc_long)
        net = btc_long + sum(v for v in short_positions.values())
        history.append({
            "date": date,
            "equity": equity,
            "daily_pnl": day_pnl,
            "pnl_shorts": day_pnl_shorts,
            "pnl_btc": day_pnl_btc,
            "pnl_funding": day_funding,
            "daily_fees": day_fees,
            "gross_leverage": gross / equity if equity > 0 else 0,
            "net_exposure": net / equity if equity > 0 else 0,
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

    total_funding = results["pnl_funding"].sum()
    total_short_pnl = results["pnl_shorts"].sum()
    total_btc_pnl = results["pnl_btc"].sum()

    print(f"\n{'─'*60}")
    print(f"  {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days}d)")
    print(f"{'─'*60}")
    print(f"  ARR:      {arr:+.1%}")
    print(f"  Sharpe:   {sharpe:.2f}")
    print(f"  Sortino:  {sortino:.2f}")
    print(f"  MDD:      {mdd:.1%}")
    print(f"  Calmar:   {calmar:.2f}")
    print(f"  Vol:      {vol:.1%}")
    print(f"  ── PnL breakdown ──")
    print(f"  Shorts:   ${total_short_pnl:+,.0f}")
    print(f"  BTC hedge:${total_btc_pnl:+,.0f}")
    print(f"  Funding:  ${total_funding:+,.0f}")
    print(f"  Fees:     ${results['daily_fees'].sum():,.0f}")
    print(f"  Net exp:  {results['net_exposure'].mean():+.2f}x avg")
    print(f"{'─'*60}")


def grid_search(closes: pd.DataFrame):
    """Search for configs meeting ARR>30% AND MDD<10%."""
    results = []

    configs = [
        # (n_s, s_lev, hedge, mom_w, funding_8h, beta_hedge, beta_w, start)
        # Low leverage, varying hedge ratios
        (15, 0.3, 0.8, 14, 0.0001, True, 30, None),
        (15, 0.4, 0.8, 14, 0.0001, True, 30, None),
        (15, 0.5, 0.8, 14, 0.0001, True, 30, None),
        (15, 0.6, 0.8, 14, 0.0001, True, 30, None),
        (15, 0.8, 0.8, 14, 0.0001, True, 30, None),
        # Higher funding (realistic for garbage coins)
        (15, 0.4, 0.8, 14, 0.0002, True, 30, None),
        (15, 0.5, 0.8, 14, 0.0002, True, 30, None),
        (15, 0.6, 0.8, 14, 0.0002, True, 30, None),
        (15, 0.8, 0.8, 14, 0.0002, True, 30, None),
        (15, 1.0, 0.8, 14, 0.0002, True, 30, None),
        # Even higher funding (aggressive garbage coins)
        (15, 0.5, 0.8, 14, 0.0003, True, 30, None),
        (15, 0.6, 0.8, 14, 0.0003, True, 30, None),
        (15, 0.8, 0.8, 14, 0.0003, True, 30, None),
        (15, 1.0, 0.8, 14, 0.0003, True, 30, None),
        # Different hedge ratios
        (15, 0.5, 0.6, 14, 0.0002, True, 30, None),
        (15, 0.5, 1.0, 14, 0.0002, True, 30, None),
        (15, 0.6, 0.6, 14, 0.0002, True, 30, None),
        (15, 0.6, 1.0, 14, 0.0002, True, 30, None),
        # No beta hedge (simple dollar-neutral)
        (15, 0.5, 0.8, 14, 0.0002, False, 30, None),
        (15, 0.6, 0.8, 14, 0.0002, False, 30, None),
        # More shorts (more diversified)
        (20, 0.5, 0.8, 14, 0.0002, True, 30, None),
        (20, 0.6, 0.8, 14, 0.0002, True, 30, None),
        (20, 0.8, 0.8, 14, 0.0002, True, 30, None),
        # Fewer shorts (more concentrated)
        (10, 0.5, 0.8, 14, 0.0002, True, 30, None),
        (10, 0.6, 0.8, 14, 0.0002, True, 30, None),
        (10, 0.8, 0.8, 14, 0.0002, True, 30, None),
        # Post-2022 only
        (15, 0.5, 0.8, 14, 0.0002, True, 30, "2022-01-01"),
        (15, 0.6, 0.8, 14, 0.0002, True, 30, "2022-01-01"),
        (15, 0.8, 0.8, 14, 0.0002, True, 30, "2022-01-01"),
        (15, 0.5, 0.8, 14, 0.0003, True, 30, "2022-01-01"),
        (15, 0.6, 0.8, 14, 0.0003, True, 30, "2022-01-01"),
        (15, 0.8, 0.8, 14, 0.0003, True, 30, "2022-01-01"),
        # Post-2024 (most relevant for HL)
        (15, 0.5, 0.8, 14, 0.0002, True, 30, "2024-01-01"),
        (15, 0.6, 0.8, 14, 0.0002, True, 30, "2024-01-01"),
        (15, 0.8, 0.8, 14, 0.0002, True, 30, "2024-01-01"),
        (15, 0.5, 0.8, 14, 0.0003, True, 30, "2024-01-01"),
        (15, 0.6, 0.8, 14, 0.0003, True, 30, "2024-01-01"),
        (15, 0.8, 0.8, 14, 0.0003, True, 30, "2024-01-01"),
    ]

    for cfg in configs:
        ns, sl, hr, mw, fr, bh, bw, start = cfg
        try:
            res = run_btc_hedge_backtest(
                closes, n_short=ns, short_leverage=sl, hedge_ratio=hr,
                momentum_window=mw, funding_rate_8h=fr,
                use_beta_hedge=bh, beta_window=bw,
                start_date=start, verbose=False,
            )
            days = len(res)
            if days < 730:  # require 2+ years
                continue
            total_ret = res["equity"].iloc[-1] / 100_000 - 1
            arr = (1 + total_ret) ** (365 / days) - 1
            dr = res["equity"].pct_change().dropna()
            sharpe = dr.mean() / dr.std() * np.sqrt(365) if dr.std() > 0 else 0
            mdd = res["drawdown"].max()
            results.append({
                "params": f"S{ns} sl{sl} hr{hr} fr{fr*10000:.1f}bp {'β' if bh else '$'} {start or 'Full'}",
                "arr": arr, "sharpe": sharpe, "mdd": mdd,
                "days": days, "calmar": arr / mdd if mdd > 0 else 0,
            })
        except Exception as e:
            continue

    results.sort(key=lambda x: x["calmar"], reverse=True)

    print(f"\n{'='*90}")
    print(f"BTC-HEDGED SHORT GRID ({len(results)} valid, ≥2yr)")
    print(f"{'='*90}")
    print(f"  {'Config':<55} {'ARR':>7} {'Sharpe':>7} {'MDD':>6} {'Calmar':>7}")
    print(f"  {'-'*85}")
    for r in results[:30]:
        flag = "✓" if r["arr"] > 0.30 and r["mdd"] < 0.10 else " "
        print(f"  {flag}{r['params']:<54} {r['arr']:>+6.1%} {r['sharpe']:>6.2f} {r['mdd']:>5.1%} {r['calmar']:>6.2f}")

    winners = [r for r in results if r["arr"] > 0.30 and r["mdd"] < 0.10]
    if winners:
        print(f"\n  🎯 {len(winners)} configs meet ARR>30% AND MDD<10% over 2+ years!")
        for w in winners:
            print(f"     {w['params']} → ARR={w['arr']:+.1%}, MDD={w['mdd']:.1%}, Sharpe={w['sharpe']:.2f}")
    else:
        print(f"\n  ⚠️  No config meets both goals over 2+ years.")
        close = [r for r in results if r["mdd"] < 0.12 and r["arr"] > 0.20]
        if close:
            print("  Closest:")
            for c in close[:5]:
                print(f"    {c['params']} → ARR={c['arr']:+.1%}, MDD={c['mdd']:.1%}")
    return results


if __name__ == "__main__":
    print("Loading daily price data...")
    universe = load_universe(min_days=365)
    closes = get_daily_closes(universe)
    print(f"Universe: {len(closes.columns)} coins, {len(closes)} days")
    print(f"Period: {closes.index[0].strftime('%Y-%m-%d')} → {closes.index[-1].strftime('%Y-%m-%d')}")
    grid_search(closes)
