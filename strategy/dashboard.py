"""Backtest Dashboard — Interactive strategy parameter tuning.

Run: streamlit run strategy/dashboard.py
"""
import streamlit as st
import pandas as pd
import numpy as np
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "data"))
sys.path.insert(0, str(Path(__file__).resolve().parent / "backtest"))

from price_loader import load_universe, get_daily_closes
from engine_honest import signal_momentum


# ─── Page config ─────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="L/S Momentum Backtest",
    page_icon="📈",
    layout="wide",
)

# Dark theme CSS
st.markdown("""
<style>
    .stApp { background-color: #0a0e17; }
    .stSidebar { background-color: #0d1320; }
    .metric-card {
        background: linear-gradient(135deg, #0d1320 0%, #131b2e 100%);
        border: 1px solid #1a2640;
        border-radius: 12px;
        padding: 16px;
        text-align: center;
    }
    .metric-value { font-size: 24px; font-weight: 700; }
    .metric-label { font-size: 12px; color: #8892a4; margin-top: 4px; }
    .positive { color: #00ff88; }
    .negative { color: #ff4466; }
</style>
""", unsafe_allow_html=True)


# ─── Data loading (cached) ───────────────────────────────────────────────────
@st.cache_data(show_spinner="Loading price data...")
def load_data():
    universe = load_universe(min_days=365)
    closes = get_daily_closes(universe)
    return closes


# ─── Backtest engine ─────────────────────────────────────────────────────────

@st.cache_data(show_spinner="Running backtest...")
def run_backtest(
    _closes_hash: str,  # for cache invalidation
    closes_json: str,
    n_long: int,
    n_short: int,
    leverage: float,
    momentum_window: int,
    fee_bps: float,
    start_date: str,
):
    """Run the L/S momentum backtest."""
    closes = pd.read_json(closes_json)
    closes.index = pd.to_datetime(closes.index)

    if start_date:
        closes = closes[closes.index >= pd.Timestamp(start_date)]

    coins = [c for c in closes.columns if c != "BTC"]
    exclude = ["BTC", "HYPE"]

    # Signal
    sig_mom = signal_momentum(closes, momentum_window)
    daily_rets = closes.pct_change(fill_method=None)

    warmup = momentum_window + 5
    dates = closes.index[warmup:]

    equity = 100_000
    positions: dict[str, float] = {}
    peak_equity = 100_000
    history = []

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

        # Rebalance daily
        day_fees = 0.0
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
                day_fees = fee
                positions = new_pos

        history.append({
            "date": date,
            "equity": equity,
            "daily_pnl": day_pnl,
            "daily_fees": day_fees,
            "drawdown": dd,
        })

    results = pd.DataFrame(history).set_index("date")

    # BTC buy & hold for comparison
    btc_prices = closes["BTC"][closes.index >= results.index[0]]
    btc_hold = 100_000 * btc_prices / btc_prices.iloc[0]

    return results, btc_hold


# ─── Sidebar: Parameters ─────────────────────────────────────────────────────

st.sidebar.markdown("## ⚙️ Strategy Parameters")

n_long = st.sidebar.slider("Long positions (N_long)", 3, 15, 7)
n_short = st.sidebar.slider("Short positions (N_short)", 5, 30, 15)
leverage = st.sidebar.slider("Leverage (per side)", 0.05, 0.50, 0.16, 0.01)
momentum_window = st.sidebar.slider("Momentum lookback (days)", 5, 30, 14)
fee_bps = st.sidebar.slider("Fee (bps per trade)", 0.0, 10.0, 1.0, 0.5)

st.sidebar.markdown("---")
st.sidebar.markdown("## 📅 Backtest Period")

period_options = {
    "Full (2020-12 →)": "",
    "4 years (2022-06 →)": "2022-06-05",
    "3 years (2023-06 →)": "2023-06-05",
    "2 years (2024-06 →)": "2024-06-05",
}
period_label = st.sidebar.selectbox("Start date", list(period_options.keys()), index=1)
start_date = period_options[period_label]

st.sidebar.markdown("---")
st.sidebar.markdown("### Default configs")
if st.sidebar.button("A档: MDD<10%"):
    st.session_state.update({"lev_override": 0.16})
    st.rerun()
if st.sidebar.button("B档: ARR>30%"):
    st.session_state.update({"lev_override": 0.25})
    st.rerun()

# Apply override if button was pressed
if "lev_override" in st.session_state:
    leverage = st.session_state.pop("lev_override")


# ─── Run backtest ────────────────────────────────────────────────────────────

closes = load_data()
closes_json = closes.to_json()
closes_hash = str(hash(closes_json[:1000]))

results, btc_hold = run_backtest(
    closes_hash, closes_json,
    n_long, n_short, leverage, momentum_window, fee_bps, start_date,
)


# ─── Compute metrics ─────────────────────────────────────────────────────────

days = len(results)
total_ret = results["equity"].iloc[-1] / 100_000 - 1
arr = (1 + total_ret) ** (365 / days) - 1
daily_rets = results["equity"].pct_change().dropna()
sharpe = daily_rets.mean() / daily_rets.std() * np.sqrt(365) if daily_rets.std() > 0 else 0
neg_rets = daily_rets[daily_rets < 0]
sortino = daily_rets.mean() / neg_rets.std() * np.sqrt(365) if len(neg_rets) > 0 and neg_rets.std() > 0 else 0
mdd = results["drawdown"].max()
calmar = arr / mdd if mdd > 0 else 0
vol = daily_rets.std() * np.sqrt(365)
monthly = results["equity"].resample("ME").last().pct_change().dropna()
win_months = (monthly > 0).sum()
total_months = len(monthly)
total_fees = results["daily_fees"].sum()

# BTC metrics
btc_aligned = btc_hold.reindex(results.index, method="ffill")
btc_total_ret = btc_aligned.iloc[-1] / 100_000 - 1
btc_arr = (1 + btc_total_ret) ** (365 / days) - 1
btc_daily = btc_aligned.pct_change().dropna()
btc_sharpe = btc_daily.mean() / btc_daily.std() * np.sqrt(365) if btc_daily.std() > 0 else 0
btc_peak = btc_aligned.cummax()
btc_mdd = ((btc_peak - btc_aligned) / btc_peak).max()


# ─── Layout ──────────────────────────────────────────────────────────────────

st.markdown("# 📊 L/S Momentum Backtest Dashboard")
st.markdown(f"**L{n_long}/S{n_short}** | Leverage {leverage:.2f}x | Momentum {momentum_window}d | Fee {fee_bps}bp")

# Metrics row
col1, col2, col3, col4, col5, col6 = st.columns(6)

def metric_card(col, label, value, fmt="{:+.1%}", is_pct=True, good_positive=True):
    if is_pct:
        display = fmt.format(value)
    else:
        display = fmt.format(value)
    color = "positive" if (value > 0) == good_positive else "negative"
    col.markdown(f"""
    <div class="metric-card">
        <div class="metric-value {color}">{display}</div>
        <div class="metric-label">{label}</div>
    </div>
    """, unsafe_allow_html=True)

metric_card(col1, "ARR", arr)
metric_card(col2, "MDD", mdd, "{:.1%}", good_positive=False)
metric_card(col3, "Sharpe", sharpe, "{:.2f}", is_pct=False)
metric_card(col4, "Sortino", sortino, "{:.2f}", is_pct=False)
metric_card(col5, "Calmar", calmar, "{:.2f}", is_pct=False)
metric_card(col6, "Win Rate", win_months / total_months if total_months > 0 else 0, "{:.0%}")

st.markdown("")

# ─── Charts ──────────────────────────────────────────────────────────────────

# Equity curve + BTC comparison
fig = make_subplots(
    rows=2, cols=1,
    shared_xaxes=True,
    vertical_spacing=0.08,
    row_heights=[0.7, 0.3],
    subplot_titles=("NAV vs BTC Buy & Hold", "Drawdown"),
)

# Strategy equity
fig.add_trace(
    go.Scatter(
        x=results.index,
        y=results["equity"],
        name="Strategy",
        line=dict(color="#00ff88", width=2),
        hovertemplate="Strategy: $%{y:,.0f}<extra></extra>",
    ),
    row=1, col=1,
)

# BTC hold
fig.add_trace(
    go.Scatter(
        x=btc_aligned.index,
        y=btc_aligned.values,
        name="BTC Hold",
        line=dict(color="#00d4ff", width=1.5, dash="dot"),
        hovertemplate="BTC Hold: $%{y:,.0f}<extra></extra>",
    ),
    row=1, col=1,
)

# $100K baseline
fig.add_hline(y=100_000, line_dash="dash", line_color="#333", row=1, col=1)

# Drawdown
fig.add_trace(
    go.Scatter(
        x=results.index,
        y=-results["drawdown"] * 100,
        name="Drawdown",
        fill="tozeroy",
        line=dict(color="#ff4466", width=1),
        fillcolor="rgba(255, 68, 102, 0.2)",
        hovertemplate="DD: %{y:.1f}%<extra></extra>",
    ),
    row=2, col=1,
)

# MDD line
fig.add_hline(y=-mdd * 100, line_dash="dash", line_color="#ff4466",
              annotation_text=f"MDD {mdd:.1%}", row=2, col=1)

fig.update_layout(
    height=550,
    template="plotly_dark",
    paper_bgcolor="#0a0e17",
    plot_bgcolor="#0d1320",
    font=dict(color="#c8d0e0"),
    legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
    margin=dict(l=60, r=20, t=40, b=30),
    hovermode="x unified",
)

fig.update_xaxes(gridcolor="#1a2640", zeroline=False)
fig.update_yaxes(gridcolor="#1a2640", zeroline=False)
fig.update_yaxes(title_text="Equity ($)", row=1, col=1)
fig.update_yaxes(title_text="DD (%)", row=2, col=1)

st.plotly_chart(fig, use_container_width=True)

# ─── Monthly returns heatmap ─────────────────────────────────────────────────

st.markdown("### 📅 Monthly Returns")

monthly_rets = results["equity"].resample("ME").last().pct_change().dropna()
monthly_df = pd.DataFrame({
    "year": monthly_rets.index.year,
    "month": monthly_rets.index.month,
    "return": monthly_rets.values,
})
pivot = monthly_df.pivot(index="year", columns="month", values="return")
pivot.columns = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                 "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

fig_heatmap = go.Figure(data=go.Heatmap(
    z=pivot.values * 100,
    x=pivot.columns,
    y=pivot.index,
    colorscale=[[0, "#ff4466"], [0.5, "#1a2640"], [1, "#00ff88"]],
    zmid=0,
    text=[[f"{v:.1f}%" if not np.isnan(v) else "" for v in row] for row in pivot.values * 100],
    texttemplate="%{text}",
    textfont={"size": 11},
    hovertemplate="Year %{y}, %{x}: %{z:.1f}%<extra></extra>",
    colorbar=dict(title="%", ticksuffix="%"),
))

fig_heatmap.update_layout(
    height=250,
    template="plotly_dark",
    paper_bgcolor="#0a0e17",
    plot_bgcolor="#0d1320",
    font=dict(color="#c8d0e0"),
    margin=dict(l=60, r=20, t=10, b=30),
    yaxis=dict(dtick=1),
)

st.plotly_chart(fig_heatmap, use_container_width=True)

# ─── Comparison table ────────────────────────────────────────────────────────

st.markdown("### 📊 Strategy vs BTC")

comp_data = {
    "Metric": ["ARR", "MDD", "Sharpe", "Volatility", "Final Equity"],
    "Strategy": [f"{arr:+.1%}", f"{mdd:.1%}", f"{sharpe:.2f}", f"{vol:.1%}", f"${results['equity'].iloc[-1]:,.0f}"],
    "BTC Hold": [f"{btc_arr:+.1%}", f"{btc_mdd:.1%}", f"{btc_sharpe:.2f}", f"{btc_daily.std()*np.sqrt(365):.1%}", f"${btc_aligned.iloc[-1]:,.0f}"],
}
st.table(pd.DataFrame(comp_data).set_index("Metric"))

# ─── Footer info ─────────────────────────────────────────────────────────────

st.markdown("---")
col_a, col_b = st.columns(2)
with col_a:
    st.markdown(f"""
    **Backtest Details**
    - Period: {results.index[0].strftime('%Y-%m-%d')} → {results.index[-1].strftime('%Y-%m-%d')} ({days} days)
    - Universe: {len(closes.columns)} coins
    - Total fees paid: ${total_fees:,.0f}
    - Win months: {win_months}/{total_months} ({win_months/total_months*100:.0f}%)
    """)
with col_b:
    st.markdown(f"""
    **Configuration**
    - Long {n_long} / Short {n_short} positions
    - Gross leverage: {leverage*2:.2f}x ({leverage:.2f}x per side)
    - Momentum window: {momentum_window} days
    - Fee: {fee_bps} bps (maker orders)
    - Rebalance: Daily
    """)


