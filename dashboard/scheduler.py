"""APScheduler-based daily rebalance scheduler."""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import logging

from . import config
from .paper_engine import PaperEngine

logger = logging.getLogger(__name__)
_scheduler: BackgroundScheduler | None = None


def start_scheduler(engine: PaperEngine):
    """Start the background scheduler for daily rebalance."""
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler()
    _scheduler.add_job(
        _daily_rebalance,
        trigger=CronTrigger(hour=config.REBALANCE_HOUR_UTC, minute=5, timezone="UTC"),
        id="daily_rebalance",
        args=[engine],
        replace_existing=True,
    )
    _scheduler.start()
    logger.info(f"Scheduler started: rebalance at UTC {config.REBALANCE_HOUR_UTC:02d}:05")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def _daily_rebalance(engine: PaperEngine):
    """Scheduled rebalance task."""
    try:
        result = engine.rebalance()
        logger.info(f"Rebalance complete: {result}")
    except Exception as e:
        logger.error(f"Rebalance failed: {e}", exc_info=True)
