"""Inflation/supply signal: coins with low MCap/FDV have high future dilution."""
import pandas as pd
import numpy as np
from pathlib import Path


SUPPLY_FILE = Path(__file__).resolve().parents[2] / "strategy" / "data" / "supply_data.csv"


def load_supply_data() -> pd.DataFrame:
    """Load cached supply data from CoinGecko."""
    if not SUPPLY_FILE.exists():
        raise FileNotFoundError(f"Supply data not found: {SUPPLY_FILE}. Run fetch_supply.py first.")
    return pd.read_csv(SUPPLY_FILE)


def inflation_score(supply_df: pd.DataFrame | None = None) -> pd.Series:
    """Score each coin: lower MCap/FDV ratio → higher inflation pressure → higher short score.

    MCap/FDV < 0.3 means >70% of tokens not yet circulating.
    MCap/FDV = 1.0 means fully diluted (no inflation pressure).

    Returns Series indexed by symbol, values 0-1.
    """
    if supply_df is None:
        supply_df = load_supply_data()

    df = supply_df.set_index("symbol")
    ratio = df["mcap_fdv_ratio"].copy()

    # Score: 1 - ratio (lower ratio = higher score)
    # But only meaningful for ratio < 1.0
    scores = (1.0 - ratio).clip(0, 1)

    # Boost score for extremely low ratios (< 0.4)
    # These have massive upcoming dilution
    scores = scores ** 0.7  # Compress to give more differentiation at the bottom

    return scores


def get_high_inflation_coins(threshold: float = 0.5) -> list[str]:
    """Get list of coins with MCap/FDV ratio below threshold."""
    try:
        df = load_supply_data()
        high_inflation = df[df["mcap_fdv_ratio"] < threshold]
        return high_inflation["symbol"].tolist()
    except FileNotFoundError:
        return []


if __name__ == "__main__":
    try:
        df = load_supply_data()
        scores = inflation_score(df)
        print("Inflation scores (higher = more short-worthy):")
        for coin, score in scores.sort_values(ascending=False).head(20).items():
            ratio = df.set_index("symbol").loc[coin, "mcap_fdv_ratio"]
            fdv = df.set_index("symbol").loc[coin, "fdv_usd"]
            print(f"  {coin:8s}: score={score:.3f}, MCap/FDV={ratio:.2%}, FDV=${fdv/1e9:.1f}B")
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print("Run: python strategy/data/fetch_supply.py")
