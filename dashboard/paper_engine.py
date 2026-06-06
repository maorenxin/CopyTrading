"""Paper trading engine — manages positions, rebalance, and PnL tracking."""
import sqlite3
import time
import threading
import logging
from datetime import date, datetime, timezone
from typing import Optional

from . import config, db, signal
from .price_feed import fetch_mark_prices

logger = logging.getLogger(__name__)


class PaperEngine:
    """Stateful paper trading engine backed by SQLite."""

    def __init__(self):
        db.init_db()
        self._live_nav: Optional[dict] = None
        self._nav_lock = threading.Lock()
        self._start_price_feed()

    def _start_price_feed(self):
        """Start background thread to update NAV every 5 minutes."""
        # Run first update synchronously to have data immediately
        try:
            self._update_live_nav()
        except Exception:
            pass
        self._feed_thread = threading.Thread(target=self._price_feed_loop, daemon=True)
        self._feed_thread.start()

    def _price_feed_loop(self):
        """Fetch mark prices every 5 min, compute live NAV."""
        while True:
            try:
                self._update_live_nav()
            except Exception as e:
                logger.error(f"Price feed error: {e}")
            time.sleep(300)  # 5 minutes

    def _update_live_nav(self):
        """Compute live NAV from current positions + mark prices."""
        conn = db.get_db()
        try:
            positions = db.get_current_positions(conn)
            snapshot = db.get_latest_snapshot(conn)
        finally:
            conn.close()

        if not positions or not snapshot:
            return

        prices = fetch_mark_prices()
        if not prices:
            return

        # Calculate unrealized PnL from mark prices
        base_equity = snapshot["equity"]
        unrealized_pnl = 0.0
        position_details = []

        for pos in positions:
            coin = pos["coin"]
            entry_price = pos["entry_price"]
            notional = pos["notional"]
            mark_price = prices.get(coin)

            if mark_price is None or entry_price <= 0:
                position_details.append({**pos, "mark_price": None, "unrealized_pnl": 0})
                continue

            # PnL = notional * (mark/entry - 1)
            # For short: notional is negative, so if price goes up, PnL is negative (correct)
            pnl = notional * (mark_price / entry_price - 1)
            unrealized_pnl += pnl
            position_details.append({
                **pos,
                "mark_price": mark_price,
                "unrealized_pnl": round(pnl, 2),
            })

        live_equity = base_equity + unrealized_pnl
        peak = max(base_equity, live_equity)  # simplified peak for intraday

        # Get historical peak from snapshots
        conn = db.get_db()
        try:
            peak_row = conn.execute("SELECT MAX(equity) as peak FROM daily_snapshots").fetchone()
            if peak_row and peak_row["peak"]:
                peak = max(peak, peak_row["peak"])
        finally:
            conn.close()

        drawdown = (peak - live_equity) / peak if peak > 0 else 0

        with self._nav_lock:
            self._live_nav = {
                "equity": round(live_equity, 2),
                "unrealized_pnl": round(unrealized_pnl, 2),
                "drawdown": round(drawdown, 6),
                "positions": position_details,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }

    def get_live_nav(self) -> Optional[dict]:
        """Get latest live NAV computed from mark prices."""
        with self._nav_lock:
            return self._live_nav

    def get_state(self) -> dict:
        """Get current portfolio state with live NAV if available."""
        conn = db.get_db()
        try:
            snapshot = db.get_latest_snapshot(conn)
            positions = db.get_current_positions(conn)
            running_days = conn.execute("SELECT COUNT(*) as n FROM daily_snapshots").fetchone()["n"]
        finally:
            conn.close()

        live = self.get_live_nav()

        if snapshot:
            equity = live["equity"] if live else snapshot["equity"]
            unrealized = live["unrealized_pnl"] if live else 0
            dd = live["drawdown"] if live else snapshot["drawdown"]
            pos_data = live["positions"] if live else positions
            return {
                "mode": config.MODE,
                "equity": equity,
                "daily_pnl": unrealized,
                "cumulative_pnl": equity - config.INITIAL_CAPITAL,
                "drawdown": dd,
                "leverage": snapshot["leverage"],
                "positions": pos_data,
                "last_rebalance": snapshot["date"],
                "running_days": running_days,
                "nav_updated_at": live["updated_at"] if live else None,
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
                "nav_updated_at": None,
            }

    def _count_days_from_snapshot(self, snapshot, conn):
        row = conn.execute("SELECT COUNT(*) as n FROM daily_snapshots").fetchone()
        return row["n"] if row else 0

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
