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


def compute_momentum_signal(closes: pd.DataFrame, window: int = None) -> pd.Series:
    """Compute today's momentum signal scores for all coins.

    Returns a Series indexed by coin with scores in [0, 1].
    Higher score = worse relative momentum = better short candidate.
    """
    if window is None:
        window = config.MOMENTUM_WINDOW

    rets = closes.pct_change(window, fill_method=None)
    btc_rets = rets["BTC"]
    coins = [c for c in closes.columns if c not in config.EXCLUDE_COINS]
    relative = rets[coins].sub(btc_rets, axis=0)

    # Take latest row
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


def get_latest_prices(closes: pd.DataFrame) -> pd.Series:
    """Get the most recent price for each coin."""
    return closes.iloc[-1].dropna()
