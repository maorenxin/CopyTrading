"""Paper trading engine — manages positions, rebalance, and PnL tracking."""
import sqlite3
from datetime import date, datetime, timezone
from typing import Optional

from . import config, db, signal


class PaperEngine:
    """Stateful paper trading engine backed by SQLite."""

    def __init__(self):
        db.init_db()

    def get_state(self) -> dict:
        """Get current portfolio state."""
        conn = db.get_db()
        try:
            snapshot = db.get_latest_snapshot(conn)
            positions = db.get_current_positions(conn)
            if snapshot:
                return {
                    "mode": config.MODE,
                    "equity": snapshot["equity"],
                    "daily_pnl": snapshot["daily_pnl"],
                    "cumulative_pnl": snapshot["cumulative_pnl"],
                    "drawdown": snapshot["drawdown"],
                    "leverage": snapshot["leverage"],
                    "positions": positions,
                    "last_rebalance": snapshot["date"],
                    "running_days": self._count_days(conn),
                }
            else:
                return {
                    "mode": config.MODE,
                    "equity": config.INITIAL_CAPITAL,
                    "daily_pnl": 0,
                    "cumulative_pnl": 0,
                    "drawdown": 0,
                    "leverage": 0,
                    "positions": [],
                    "last_rebalance": None,
                    "running_days": 0,
                }
        finally:
            conn.close()

    def rebalance(self, force_date: Optional[str] = None) -> dict:
        """Execute daily rebalance: compute signals, update positions, record trades."""
        today = force_date or date.today().isoformat()

        conn = db.get_db()
        try:
            # Check if already rebalanced today
            existing = conn.execute(
                "SELECT 1 FROM daily_snapshots WHERE date = ?", (today,)
            ).fetchone()
            if existing:
                return {"status": "skipped", "reason": f"Already rebalanced on {today}"}

            # Load prices and compute signal
            closes = signal.load_daily_closes()
            scores = signal.compute_momentum_signal(closes)
            short_coins, long_coins = signal.select_portfolio(scores)
            prices = signal.get_latest_prices(closes)

            # Get previous equity
            prev_snapshot = db.get_latest_snapshot(conn)
            equity = prev_snapshot["equity"] if prev_snapshot else config.INITIAL_CAPITAL
            peak_equity = equity  # will be updated from history

            # Compute peak from all snapshots
            peak_row = conn.execute(
                "SELECT MAX(equity) as peak FROM daily_snapshots"
            ).fetchone()
            if peak_row and peak_row["peak"]:
                peak_equity = max(peak_equity, peak_row["peak"])

            # Calculate PnL from previous positions
            prev_positions = db.get_current_positions(conn)
            daily_pnl = 0.0
            for pos in prev_positions:
                coin = pos["coin"]
                if coin in closes.columns:
                    # Get today's return
                    coin_closes = closes[coin].dropna()
                    if len(coin_closes) >= 2:
                        ret = (coin_closes.iloc[-1] - coin_closes.iloc[-2]) / coin_closes.iloc[-2]
                        pnl = pos["notional"] * ret
                        daily_pnl += pnl

            equity += daily_pnl

            # Build new positions
            exposure = equity * config.LEVERAGE
            new_positions = []
            total_fees = 0.0
            trades_today = []

            for coin in short_coins:
                notional = -exposure / config.N_SHORT
                price = prices.get(coin, 0)
                score = scores.get(coin, 0)
                new_positions.append({
                    "coin": coin, "side": "short",
                    "notional": notional, "entry_price": price,
                    "signal_score": score,
                })

            for coin in long_coins:
                notional = exposure / config.N_LONG
                price = prices.get(coin, 0)
                score = scores.get(coin, 0)
                new_positions.append({
                    "coin": coin, "side": "long",
                    "notional": notional, "entry_price": price,
                    "signal_score": score,
                })

            # Calculate turnover and fees
            old_map = {p["coin"]: p["notional"] for p in prev_positions}
            new_map = {p["coin"]: p["notional"] for p in new_positions}
            all_coins = set(list(old_map.keys()) + list(new_map.keys()))
            turnover = sum(abs(new_map.get(c, 0) - old_map.get(c, 0)) for c in all_coins)
            total_fees = turnover * config.FEE_BPS / 10000
            equity -= total_fees

            # Record trades (changes from previous positions)
            for coin in all_coins:
                old_n = old_map.get(coin, 0)
                new_n = new_map.get(coin, 0)
                if abs(new_n - old_n) > 1:  # ignore tiny rounding
                    if old_n != 0 and new_n == 0:
                        action = "close_long" if old_n > 0 else "close_short"
                    elif old_n == 0 and new_n != 0:
                        action = "open_short" if new_n < 0 else "open_long"
                    else:
                        action = "adjust_short" if new_n < 0 else "adjust_long"
                    fee = abs(new_n - old_n) * config.FEE_BPS / 10000
                    trades_today.append({
                        "coin": coin, "action": action,
                        "notional": abs(new_n), "price": prices.get(coin, 0),
                        "fee": fee,
                    })

            # Update peak and drawdown
            peak_equity = max(peak_equity, equity)
            drawdown = (peak_equity - equity) / peak_equity if peak_equity > 0 else 0
            cumulative_pnl = equity - config.INITIAL_CAPITAL
            gross_exposure = sum(abs(p["notional"]) for p in new_positions)
            actual_leverage = gross_exposure / equity if equity > 0 else 0

            # Persist to DB
            conn.execute(
                """INSERT INTO daily_snapshots
                   (date, equity, daily_pnl, cumulative_pnl, drawdown, leverage, n_longs, n_shorts, fees, mode)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (today, equity, daily_pnl, cumulative_pnl, drawdown,
                 actual_leverage, len(long_coins), len(short_coins), total_fees, config.MODE)
            )

            for pos in new_positions:
                conn.execute(
                    """INSERT INTO positions (date, coin, side, notional, entry_price, signal_score, daily_pnl)
                       VALUES (?, ?, ?, ?, ?, ?, 0)""",
                    (today, pos["coin"], pos["side"], pos["notional"],
                     pos["entry_price"], pos["signal_score"])
                )

            for trade in trades_today:
                conn.execute(
                    """INSERT INTO trades (date, coin, action, notional, price, fee)
                       VALUES (?, ?, ?, ?, ?, ?)""",
                    (today, trade["coin"], trade["action"],
                     trade["notional"], trade["price"], trade["fee"])
                )

            # Save signals
            for rank_idx, (coin, score) in enumerate(scores.items()):
                selected = None
                if coin in short_coins:
                    selected = "short"
                elif coin in long_coins:
                    selected = "long"
                conn.execute(
                    """INSERT OR REPLACE INTO daily_signals (date, coin, momentum_score, rank, selected)
                       VALUES (?, ?, ?, ?, ?)""",
                    (today, coin, float(score), rank_idx + 1, selected)
                )

            conn.commit()
            return {
                "status": "ok",
                "date": today,
                "equity": equity,
                "daily_pnl": daily_pnl,
                "cumulative_pnl": cumulative_pnl,
                "fees": total_fees,
                "n_trades": len(trades_today),
                "short_coins": short_coins,
                "long_coins": long_coins,
            }
        finally:
            conn.close()

    def _count_days(self, conn: sqlite3.Connection) -> int:
        row = conn.execute("SELECT COUNT(*) as n FROM daily_snapshots").fetchone()
        return row["n"] if row else 0

    def compute_metrics(self) -> dict:
        """Compute cumulative performance metrics."""
        conn = db.get_db()
        try:
            snapshots = db.get_snapshots(conn, days=9999)
            if len(snapshots) < 2:
                return {
                    "sharpe": 0, "arr": 0, "mdd": 0,
                    "sortino": 0, "win_rate": 0, "days": len(snapshots),
                }

            import numpy as np
            equities = [s["equity"] for s in snapshots]
            daily_rets = [(equities[i] - equities[i-1]) / equities[i-1]
                          for i in range(1, len(equities))]

            arr_vals = np.array(daily_rets)
            days = len(snapshots)
            total_ret = equities[-1] / config.INITIAL_CAPITAL - 1
            arr = (1 + total_ret) ** (365 / days) - 1 if days > 1 else 0

            std = np.std(arr_vals)
            sharpe = (np.mean(arr_vals) / std * np.sqrt(365)) if std > 0 else 0

            neg = arr_vals[arr_vals < 0]
            neg_std = np.std(neg) if len(neg) > 0 else 1
            sortino = (np.mean(arr_vals) / neg_std * np.sqrt(365)) if neg_std > 0 else 0

            mdd = max(s["drawdown"] for s in snapshots)
            win_days = sum(1 for r in daily_rets if r > 0)
            win_rate = win_days / len(daily_rets) if daily_rets else 0

            return {
                "sharpe": round(sharpe, 2),
                "arr": round(arr * 100, 1),
                "mdd": round(mdd * 100, 1),
                "sortino": round(sortino, 2),
                "win_rate": round(win_rate * 100, 1),
                "days": days,
                "total_return": round(total_ret * 100, 1),
            }
        finally:
            conn.close()
