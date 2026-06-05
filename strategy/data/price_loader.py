"""Load price data from crypto_data/ directory."""
import os
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / "crypto_data"


def load_coin(symbol: str, freq: str = "1d") -> pd.DataFrame:
    """Load price data for a single coin. Returns DataFrame with DatetimeIndex."""
    filename = f"{symbol.lower()}usdt_{freq}_hyperliquid.csv"
    filepath = DATA_DIR / filename
    if not filepath.exists():
        raise FileNotFoundError(f"No price data for {symbol}: {filepath}")

    df = pd.read_csv(filepath)
    df["time"] = pd.to_datetime(df["time"], unit="ms")
    df = df.set_index("time").sort_index()
    df = df[["open", "high", "low", "close", "volume"]].astype(float)
    return df


def load_universe(min_days: int = 365, freq: str = "1d") -> dict[str, pd.DataFrame]:
    """Load all coins that have at least min_days of daily data."""
    universe = {}
    suffix = f"_{freq}_hyperliquid.csv"
    for f in sorted(DATA_DIR.iterdir()):
        if not f.name.endswith(suffix):
            continue
        symbol = f.name.replace("usdt" + suffix.replace("usdt", ""), "").replace(suffix, "")
        symbol = f.name[: -len(suffix)]
        # Extract symbol: remove "usdt_1d_hyperliquid.csv" suffix
        symbol = f.name.replace(f"usdt_{freq}_hyperliquid.csv", "").upper()
        try:
            df = load_coin(symbol, freq)
            if len(df) >= min_days:
                universe[symbol] = df
        except Exception:
            continue
    return universe


def get_daily_closes(universe: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Get daily close prices. For daily data, just extract close column.

    Finds the best common window where most coins have data.
    """
    closes = {}
    for symbol, df in universe.items():
        # For daily data, close is already daily
        closes[symbol] = df["close"]

    # Join into DataFrame
    result = pd.DataFrame(closes)
    row_counts = result.notna().sum(axis=1)

    # Find the densest contiguous window with ≥15 coins
    min_coins = 15
    good_rows = row_counts >= min_coins

    if good_rows.sum() == 0:
        return result.dropna(how="all")

    # Get the longest contiguous block of good_rows
    groups = good_rows.ne(good_rows.shift()).cumsum()
    good_groups = good_rows[good_rows].groupby(groups[good_rows])
    longest_group = max(good_groups, key=lambda g: len(g[1]))
    best_idx = longest_group[1].index

    result = result.loc[best_idx]

    # Keep columns with ≥50% data in this window
    coverage = result.notna().sum() / len(result)
    result = result.loc[:, coverage >= 0.5]

    # Forward-fill gaps of up to 3 days
    result = result.ffill(limit=3)

    return result


if __name__ == "__main__":
    uni = load_universe(min_days=365)
    print(f"Loaded {len(uni)} coins with ≥365 days of data")
    closes = get_daily_closes(uni)
    print(f"Daily close matrix: {closes.shape}")
    if len(closes) > 0:
        print(f"Date range: {closes.index[0]} → {closes.index[-1]}")
        print(f"NaN%: {closes.isna().sum().sum() / closes.size * 100:.1f}%")
        print(f"BTC in universe: {'BTC' in closes.columns}")
