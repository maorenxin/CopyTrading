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
    # Daily rebalance at the configured hour. misfire_grace_time tolerates a
    # late fire (e.g. the laptop was asleep at the trigger instant and woke up
    # within the window); coalesce collapses multiple missed fires into one.
    _scheduler.add_job(
        _daily_rebalance,
        trigger=CronTrigger(hour=config.REBALANCE_HOUR_UTC, minute=5, timezone="UTC"),
        id="daily_rebalance",
        args=[engine],
        replace_existing=True,
        misfire_grace_time=6 * 3600,
        coalesce=True,
    )
    # Hourly safety net: backfill is idempotent (skips days already rebalanced),
    # so this catches any day the cron fire was dropped entirely — the realistic
    # case on a laptop that sleeps across the trigger window.
    _scheduler.add_job(
        _hourly_backfill,
        trigger=CronTrigger(minute=20, timezone="UTC"),
        id="hourly_backfill",
        args=[engine],
        replace_existing=True,
        misfire_grace_time=3600,
        coalesce=True,
    )
    _scheduler.start()
    logger.info(f"Scheduler started: rebalance at UTC {config.REBALANCE_HOUR_UTC:02d}:05, hourly backfill safety net")


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def reschedule(hour: int):
    """Re-point the daily rebalance job at a new UTC hour."""
    if _scheduler is None:
        return
    _scheduler.reschedule_job(
        "daily_rebalance",
        trigger=CronTrigger(hour=hour, minute=5, timezone="UTC"),
    )
    logger.info(f"Rebalance rescheduled to UTC {hour:02d}:05")


def _daily_rebalance(engine: PaperEngine):
    """Scheduled rebalance task."""
    try:
        # Catch up any days missed while the process was down, then run today.
        engine.backfill()
        result = engine.rebalance()
        logger.info(f"Rebalance complete: {result}")
    except Exception as e:
        logger.error(f"Rebalance failed: {e}", exc_info=True)


def _hourly_backfill(engine: PaperEngine):
    """Safety net: ensure today (calendar date) has been rebalanced. Catches the
    case where the daily cron fire was dropped because the machine slept across
    the trigger. rebalance() is idempotent for a date (skips if a snapshot
    already exists), so this is a no-op once today is done."""
    try:
        result = engine.rebalance()
        if result.get("status") == "ok":
            logger.info(f"Hourly safety net ran today's rebalance: {result['date']}")
    except Exception as e:
        logger.error(f"Hourly safety net failed: {e}", exc_info=True)
