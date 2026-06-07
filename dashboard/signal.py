"""Signal computation for dashboard — reuses momentum logic from engine_honest.py"""
import pandas as pd
import numpy as np
from pathlib import Path

from . import config


def load_daily_closes() -> pd.DataFrame:
    """Load daily close prices from crypto_data/ directory."""
    data_dir = Path(__file__).resolve().parents[1] / config.CRYPTO_DATA_DIR
    frames = {}

    for f in sorted(data_dir.glob("*usdt_1d_hyperliquid.csv")):
        coin = f.stem.replace("usdt_1d_hyperliquid", "").upper()
        try:
            df = pd.read_csv(f)
            # Column is 'time' (epoch ms)
            df["date"] = pd.to_datetime(df["time"], unit="ms")
            df = df.set_index("date")["close"].rename(coin)
            if len(df) >= config.MIN_HISTORY_DAYS:
                frames[coin] = df
        except Exception:
            continue

    if not frames:
        raise RuntimeError(f"No price data found in {data_dir}")

    closes = pd.DataFrame(frames)
    closes = closes.sort_index()
    # Need BTC for relative momentum
    if "BTC" not in closes.columns:
        raise RuntimeError("BTC price data not found")
    return closes


def compute_momentum_signal(closes: pd.DataFrame, window: int = None,
                            as_of_date: str = None) -> pd.Series:
    """Compute momentum signal scores as of a given date (default: latest row).

    Returns a Series indexed by coin with scores in [0, 1].
    Higher score = worse relative momentum = better short candidate.
    """
    if window is None:
        window = config.MOMENTUM_WINDOW

    closes = _slice(closes, as_of_date)
    rets = closes.pct_change(window, fill_method=None)
    btc_rets = rets["BTC"]
    coins = [c for c in closes.columns if c not in config.EXCLUDE_COINS]
    relative = rets[coins].sub(btc_rets, axis=0)

    # Take the row at as_of_date (or the latest available)
    latest = relative.iloc[-1].dropna()
    if len(latest) < config.N_LONG + config.N_SHORT:
        raise RuntimeError(f"Only {len(latest)} coins have valid signal, need {config.N_LONG + config.N_SHORT}")

    # Rank normalize: 1 = worst performer (short candidate), 0 = best (long candidate)
    ranked = latest.rank(pct=True)
    scores = 1 - ranked
    return scores.sort_values(ascending=False)


def select_portfolio(scores: pd.Series) -> tuple[list[str], list[str]]:
    """Select long and short coins from signal scores.

    Returns (short_coins, long_coins).
    """
    sorted_scores = scores.sort_values(ascending=False)
    short_coins = sorted_scores.head(config.N_SHORT).index.tolist()
    long_coins = sorted_scores.tail(config.N_LONG).index.tolist()
    return short_coins, long_coins


def get_latest_prices(closes: pd.DataFrame, as_of_date: str = None) -> pd.Series:
    """Get the close price for each coin as of a given date (default: latest)."""
    return _slice(closes, as_of_date).iloc[-1].dropna()


def get_daily_return(closes: pd.DataFrame, coin: str, as_of_date: str = None) -> float:
    """Single-day return for a coin as of a given date (close-to-close)."""
    if coin not in closes.columns:
        return 0.0
    s = _slice(closes, as_of_date)[coin].dropna()
    if len(s) >= 2:
        return (s.iloc[-1] - s.iloc[-2]) / s.iloc[-2]
    return 0.0


def available_dates(closes: pd.DataFrame, after: str = None) -> list[str]:
    """Trading dates present in the data, ascending. If `after` is given,
    only dates strictly later than it are returned (used for backfill)."""
    dates = [d.strftime("%Y-%m-%d") for d in closes.index]
    if after:
        dates = [d for d in dates if d > after]
    return dates


def _slice(closes: pd.DataFrame, as_of_date: str = None) -> pd.DataFrame:
    """Restrict closes to rows up to and including as_of_date."""
    if as_of_date is None:
        return closes
    return closes.loc[:as_of_date]
