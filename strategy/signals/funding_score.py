"""Funding rate signal: coins with high positive funding are expensive to hold long."""
import pandas as pd
import numpy as np
from pathlib import Path


FUNDING_CACHE = Path(__file__).resolve().parents[2] / "strategy" / "data" / "funding_cache"


def load_daily_funding(coins: list[str]) -> pd.DataFrame:
    """Load funding data and resample to daily average rate."""
    funding = {}
    for coin in coins:
        cache_file = FUNDING_CACHE / f"{coin.lower()}_funding.csv"
        if not cache_file.exists():
            continue
        df = pd.read_csv(cache_file)
        df["time"] = pd.to_datetime(df["time"], unit="ms")
        df = df.set_index("time")
        # Resample to daily average
        daily = df["fundingRate"].astype(float).resample("D").mean()
        funding[coin] = daily

    return pd.DataFrame(funding).sort_index()


def funding_score(daily_funding: pd.DataFrame, window: int = 7) -> pd.Series:
    """Score each coin: higher average positive funding → higher short score.

    Positive funding means longs pay shorts → shorting is profitable.
    Returns latest score (0 to 1).
    """
    # Rolling mean of funding rate
    avg_funding = daily_funding.rolling(window).mean().iloc[-1]

    # Only score coins with positive funding (short gets paid)
    # Negative funding means shorts pay longs (costly to short)
    scores = avg_funding.copy()

    # Normalize positive values to 0-1
    # Treat negative funding as 0 score (not attractive to short)
    scores = scores.clip(lower=0)

    max_val = scores.max()
    if max_val > 0:
        scores = scores / max_val
    return scores.fillna(0)


def rolling_funding_scores(daily_funding: pd.DataFrame, window: int = 7) -> pd.DataFrame:
    """Compute funding scores for every day (for backtesting)."""
    avg_funding = daily_funding.rolling(window).mean()

    # Clip negative to 0 (not attractive to short)
    clipped = avg_funding.clip(lower=0)

    # Row-normalize
    def row_normalize(row):
        valid = row.dropna()
        if len(valid) < 3:
            return row * 0
        max_val = valid.max()
        if max_val <= 0:
            return valid * 0
        return valid / max_val

    scores = clipped.apply(row_normalize, axis=1)
    return scores.fillna(0)


def funding_cost_daily(daily_funding: pd.DataFrame) -> pd.DataFrame:
    """Compute the daily cost/income of being short.

    Positive funding rate → short receives payment (income).
    Negative funding rate → short pays (cost).

    Returns daily rate (multiply by position to get $ PnL).
    Funding is charged 3x daily on HL (every 8h).
    """
    # HL charges funding 3x per day (every 8 hours)
    # daily_funding is already the average hourly rate
    # Annual: rate * 24 * 365, Daily: rate * 24
    return daily_funding * 24  # 24 funding periods per day (hourly on HL)


if __name__ == "__main__":
    daily = load_daily_funding(["ETH", "BTC", "ARB", "WLD", "OP", "SOL", "DOGE"])
    if daily.empty:
        print("No funding data cached. Run fetch_funding.py first.")
    else:
        print(f"Funding data: {daily.shape}")
        print(f"\nLatest 7d avg funding rate:")
        avg = daily.tail(7).mean()
        for coin, rate in avg.sort_values(ascending=False).items():
            annual = rate * 24 * 365 * 100
            print(f"  {coin:8s}: {rate:+.6f} (≈{annual:+.1f}% annual)")
