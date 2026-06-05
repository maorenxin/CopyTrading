"""Generate backtest report with quantstats-style metrics."""
import sys
from pathlib import Path
import pandas as pd
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "data"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "signals"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backtest"))

from price_loader import load_universe, get_daily_closes
from engine import run_backtest
from config import BacktestConfig


def generate_report(results: pd.DataFrame, config: BacktestConfig) -> str:
    """Generate text report of backtest results."""
    days = len(results)
    equity = results["equity"]
    total_ret = equity.iloc[-1] / config.initial_capital - 1
    annual_ret = (1 + total_ret) ** (365 / days) - 1 if days > 0 else 0

    daily_rets = equity.pct_change(fill_method=None).dropna()
    sharpe = daily_rets.mean() / daily_rets.std() * np.sqrt(365) if daily_rets.std() > 0 else 0
    sortino_denom = daily_rets[daily_rets < 0].std()
    sortino = daily_rets.mean() / sortino_denom * np.sqrt(365) if sortino_denom > 0 else 0

    max_dd = results["drawdown"].max()
    calmar = annual_ret / max_dd if max_dd > 0 else 0

    # Monthly stats
    monthly = equity.resample("ME").last().pct_change(fill_method=None).dropna()
    win_months = (monthly > 0).sum()
    total_months = len(monthly)
    best_month = monthly.max()
    worst_month = monthly.min()

    # Drawdown duration
    in_dd = results["drawdown"] > 0.01
    dd_groups = in_dd.ne(in_dd.shift()).cumsum()
    dd_durations = in_dd[in_dd].groupby(dd_groups[in_dd]).count()
    max_dd_duration = dd_durations.max() if len(dd_durations) > 0 else 0

    report = f"""
{'='*60}
SHORT GARBAGE STRATEGY — BACKTEST REPORT
{'='*60}

Period: {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days} days)
Initial Capital: ${config.initial_capital:,.0f}
Final Equity:    ${equity.iloc[-1]:,.0f}

── Performance ──────────────────────────────
Total Return:     {total_ret:+.1%}
Annual Return:    {annual_ret:+.1%}
Sharpe Ratio:     {sharpe:.2f}
Sortino Ratio:    {sortino:.2f}
Calmar Ratio:     {calmar:.2f}

── Risk ────────────────────────────────────
Max Drawdown:     {max_dd:.1%}
Max DD Duration:  {max_dd_duration} days
Avg Leverage:     {results['leverage'].mean():.2f}x
Avg Positions:    {results['n_positions'].mean():.0f}

── Monthly ──────────────────────────────────
Win Rate:         {win_months}/{total_months} ({win_months/total_months*100:.0f}%)
Best Month:       {best_month:+.1%}
Worst Month:      {worst_month:+.1%}
Avg Month:        {monthly.mean():+.1%}

── Costs ────────────────────────────────────
Total Fees:       ${results['daily_fees'].sum():,.0f}
Total Funding:    ${results['daily_funding'].sum():+,.0f}
Fee Drag (ann.):  {results['daily_fees'].sum()/equity.mean()*365/days:.1%}

── Config ──────────────────────────────────
N Shorts:         {config.n_shorts}
Leverage:         {config.total_leverage}x
Momentum Window:  {config.momentum_window}d
Rebalance:        {config.rebalance_hours}h
Max Position:     {config.max_position_pct:.0%}
Fee Rate:         {config.fee_rate*100:.3f}%
{'='*60}

Monthly Returns:
"""
    for date, ret in monthly.items():
        report += f"  {date.strftime('%Y-%m')}: {ret:+6.1%}\n"

    return report


if __name__ == "__main__":
    universe = load_universe(min_days=180)
    config = BacktestConfig(
        total_leverage=1.0,
        n_shorts=20,
        momentum_window=14,
        max_drawdown_stop=0.99,
    )
    results = run_backtest(universe, config, None, None, verbose=False)
    report = generate_report(results, config)
    print(report)

    # Save
    output = Path(__file__).resolve().parents[1] / "analysis" / "report.txt"
    output.write_text(report)
    print(f"Report saved to {output}")
