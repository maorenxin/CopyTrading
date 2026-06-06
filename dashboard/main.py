"""FastAPI dashboard backend."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import logging

from . import config, db
from .paper_engine import PaperEngine
from .scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger(__name__)

engine = PaperEngine()


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler(engine)
    logger.info("Dashboard backend started")
    yield
    stop_scheduler()


app = FastAPI(title="CopyTrading Dashboard", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status")
def get_status():
    """Current strategy status."""
    state = engine.get_state()
    return state


@app.get("/api/positions")
def get_positions():
    """Current open positions."""
    conn = db.get_db()
    try:
        return db.get_current_positions(conn)
    finally:
        conn.close()


@app.get("/api/history")
def get_history(days: int = Query(default=365, ge=1, le=9999)):
    """Daily equity snapshots."""
    conn = db.get_db()
    try:
        return db.get_snapshots(conn, days=days)
    finally:
        conn.close()


@app.get("/api/trades")
def get_trades(days: int = Query(default=30, ge=1, le=365)):
    """Recent trade log."""
    conn = db.get_db()
    try:
        return db.get_trades(conn, days=days)
    finally:
        conn.close()


@app.get("/api/signals")
def get_signals(date: str = Query(default=None)):
    """Signal rankings for a given date (default: latest)."""
    conn = db.get_db()
    try:
        return db.get_signals(conn, target_date=date)
    finally:
        conn.close()


@app.get("/api/metrics")
def get_metrics():
    """Cumulative performance metrics (Sharpe, ARR, MDD, etc.)."""
    return engine.compute_metrics()


@app.post("/api/rebalance")
def trigger_rebalance(date: str = Query(default=None)):
    """Manually trigger rebalance (useful for testing / backfill)."""
    result = engine.rebalance(force_date=date)
    return result


@app.get("/api/config")
def get_config():
    """Current strategy configuration."""
    return {
        "mode": config.MODE,
        "initial_capital": config.INITIAL_CAPITAL,
        "n_long": config.N_LONG,
        "n_short": config.N_SHORT,
        "leverage": config.LEVERAGE,
        "momentum_window": config.MOMENTUM_WINDOW,
        "fee_bps": config.FEE_BPS,
        "exclude_coins": config.EXCLUDE_COINS,
        "rebalance_hour_utc": config.REBALANCE_HOUR_UTC,
    }
