"""Backfill paper trading history using historical price data.

Usage: python3 -m dashboard.backfill [--days 30]
"""
import argparse
from datetime import date, timedelta

from . import config, db
from .signal import load_daily_closes, compute_momentum_signal, select_portfolio
import pandas as pd
import numpy as np


def backfill(days: int = 30):
    """Replay the strategy over the last N days and populate the DB."""
    db.init_db()
    conn = db.get_db()

    # Clear existing data for clean backfill
    conn.execute("DELETE FROM daily_snapshots")
    conn.execute("DELETE FROM positions")
    conn.execute("DELETE FROM trades")
    conn.execute("DELETE FROM daily_signals")
    conn.commit()

    closes = load_daily_closes()
    coins = [c for c in closes.columns if c not in config.EXCLUDE_COINS]
    daily_rets = closes.pct_change(fill_method=None)

    # Start from `days` days ago
    end_idx = len(closes) - 1
    start_idx = max(config.MOMENTUM_WINDOW + 5, end_idx - days)

    equity = config.INITIAL_CAPITAL
    peak_equity = equity
    positions: dict[str, float] = {}  # coin -> notional

    for day_idx in range(start_idx, end_idx + 1):
        today = closes.index[day_idx]
        today_str = today.strftime("%Y-%m-%d")

        # Compute PnL from yesterday's positions
        day_pnl = 0.0
        position_pnls = {}
        for coin, notional in positions.items():
            ret = daily_rets.iloc[day_idx].get(coin, 0)
            if pd.isna(ret):
                ret = 0
            pnl = notional * ret
            day_pnl += pnl
            position_pnls[coin] = pnl

        equity += day_pnl

        # Compute signal using data up to today
        window_closes = closes.iloc[:day_idx + 1]
        rets = window_closes.pct_change(config.MOMENTUM_WINDOW, fill_method=None)
        btc_rets = rets["BTC"]
        relative = rets[coins].sub(btc_rets, axis=0)

        latest = relative.iloc[-1].dropna()
        if len(latest) < config.N_LONG + config.N_SHORT:
            continue

        ranked = latest.rank(pct=True)
        scores = 1 - ranked
        scores = scores.sort_values(ascending=False)

        sorted_scores = scores.sort_values(ascending=False)
        short_coins = sorted_scores.head(config.N_SHORT).index.tolist()
        long_coins = sorted_scores.tail(config.N_LONG).index.tolist()

        # Build new positions
        exposure = equity * config.LEVERAGE
        new_positions = {}
        for c in short_coins:
            new_positions[c] = -exposure / config.N_SHORT
        for c in long_coins:
            new_positions[c] = exposure / config.N_LONG

        # Fees from turnover
        all_coins_set = set(list(positions.keys()) + list(new_positions.keys()))
        turnover = sum(abs(new_positions.get(c, 0) - positions.get(c, 0)) for c in all_coins_set)
        fees = turnover * config.FEE_BPS / 10000
        equity -= fees

        # Update peak and drawdown
        peak_equity = max(peak_equity, equity)
        drawdown = (peak_equity - equity) / peak_equity if peak_equity > 0 else 0
        cumulative_pnl = equity - config.INITIAL_CAPITAL
        gross = sum(abs(v) for v in new_positions.values())
        leverage = gross / equity if equity > 0 else 0

        # Record trades
        trades_today = []
        for coin in all_coins_set:
            old_n = positions.get(coin, 0)
            new_n = new_positions.get(coin, 0)
            if abs(new_n - old_n) > 1:
                if old_n != 0 and new_n == 0:
                    action = "close_long" if old_n > 0 else "close_short"
                elif old_n == 0:
                    action = "open_short" if new_n < 0 else "open_long"
                else:
                    action = "adjust_short" if new_n < 0 else "adjust_long"
                fee = abs(new_n - old_n) * config.FEE_BPS / 10000
                price = closes.iloc[day_idx].get(coin, 0)
                trades_today.append((today_str, coin, action, abs(new_n), price, fee))

        # Persist
        conn.execute(
            """INSERT OR REPLACE INTO daily_snapshots
               (date, equity, daily_pnl, cumulative_pnl, drawdown, leverage, n_longs, n_shorts, fees, mode)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (today_str, equity, day_pnl, cumulative_pnl, drawdown,
             leverage, len(long_coins), len(short_coins), fees, "paper")
        )

        for coin in short_coins:
            price = closes.iloc[day_idx].get(coin, 0)
            conn.execute(
                """INSERT INTO positions (date, coin, side, notional, entry_price, signal_score, daily_pnl)
                   VALUES (?, ?, 'short', ?, ?, ?, ?)""",
                (today_str, coin, new_positions[coin], price,
                 float(scores.get(coin, 0)), position_pnls.get(coin, 0))
            )
        for coin in long_coins:
            price = closes.iloc[day_idx].get(coin, 0)
            conn.execute(
                """INSERT INTO positions (date, coin, side, notional, entry_price, signal_score, daily_pnl)
                   VALUES (?, ?, 'long', ?, ?, ?, ?)""",
                (today_str, coin, new_positions[coin], price,
                 float(scores.get(coin, 0)), position_pnls.get(coin, 0))
            )

        for t in trades_today:
            conn.execute(
                "INSERT INTO trades (date, coin, action, notional, price, fee) VALUES (?, ?, ?, ?, ?, ?)", t
            )

        # Save top/bottom signals for today
        for rank_idx, (coin, score) in enumerate(scores.items()):
            selected = None
            if coin in short_coins:
                selected = "short"
            elif coin in long_coins:
                selected = "long"
            conn.execute(
                """INSERT OR REPLACE INTO daily_signals (date, coin, momentum_score, rank, selected)
                   VALUES (?, ?, ?, ?, ?)""",
                (today_str, coin, float(score), rank_idx + 1, selected)
            )

        positions = new_positions
        conn.commit()

    conn.close()
    print(f"Backfilled {days} days: equity ${equity:,.2f}, PnL ${equity - config.INITIAL_CAPITAL:,.2f}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()
    backfill(args.days)
