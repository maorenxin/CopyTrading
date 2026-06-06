"""SQLite database for paper trading state."""
import sqlite3
from pathlib import Path
from datetime import date
from typing import Optional

from . import config


def get_db() -> sqlite3.Connection:
    db_path = Path(__file__).resolve().parents[1] / config.DB_PATH
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS daily_snapshots (
            date TEXT PRIMARY KEY,
            equity REAL NOT NULL,
            daily_pnl REAL NOT NULL,
            cumulative_pnl REAL NOT NULL,
            drawdown REAL NOT NULL,
            leverage REAL NOT NULL,
            n_longs INTEGER NOT NULL,
            n_shorts INTEGER NOT NULL,
            fees REAL NOT NULL,
            mode TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS nav_ticks (
            ts TEXT PRIMARY KEY,
            equity REAL NOT NULL,
            unrealized_pnl REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS positions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            coin TEXT NOT NULL,
            side TEXT NOT NULL,
            notional REAL NOT NULL,
            entry_price REAL,
            signal_score REAL,
            daily_pnl REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            coin TEXT NOT NULL,
            action TEXT NOT NULL,
            notional REAL NOT NULL,
            price REAL,
            fee REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS daily_signals (
            date TEXT NOT NULL,
            coin TEXT NOT NULL,
            momentum_score REAL NOT NULL,
            rank INTEGER NOT NULL,
            selected TEXT,
            PRIMARY KEY(date, coin)
        );

        CREATE INDEX IF NOT EXISTS idx_positions_date ON positions(date);
        CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(date);
        CREATE INDEX IF NOT EXISTS idx_signals_date ON daily_signals(date);
    """)
    conn.close()


# --- Query helpers ---

def get_latest_snapshot(conn: sqlite3.Connection) -> Optional[dict]:
    row = conn.execute(
        "SELECT * FROM daily_snapshots ORDER BY date DESC LIMIT 1"
    ).fetchone()
    return dict(row) if row else None


def get_snapshots(conn: sqlite3.Connection, days: int = 365) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM daily_snapshots ORDER BY date DESC LIMIT ?", (days,)
    ).fetchall()
    return [dict(r) for r in reversed(rows)]


def get_current_positions(conn: sqlite3.Connection) -> list[dict]:
    latest = conn.execute(
        "SELECT MAX(date) as d FROM positions"
    ).fetchone()
    if not latest or not latest["d"]:
        return []
    rows = conn.execute(
        "SELECT * FROM positions WHERE date = ? ORDER BY side, notional",
        (latest["d"],)
    ).fetchall()
    return [dict(r) for r in rows]


def get_trades(conn: sqlite3.Connection, days: int = 30) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM trades ORDER BY date DESC, id DESC LIMIT ?",
        (days * 22,)  # ~22 trades per rebalance day
    ).fetchall()
    return [dict(r) for r in rows]


def get_signals(conn: sqlite3.Connection, target_date: Optional[str] = None) -> list[dict]:
    if target_date:
        rows = conn.execute(
            "SELECT * FROM daily_signals WHERE date = ? ORDER BY rank",
            (target_date,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM daily_signals WHERE date = (SELECT MAX(date) FROM daily_signals) ORDER BY rank"
        ).fetchall()
    return [dict(r) for r in rows]
