"""Load hourly price data from crypto_data/ directory."""
import os
from pathlib import Path

import pandas as pd

DATA_DIR = Path(__file__).resolve().parents[2] / "crypto_data"

# HL symbol → filename mapping overrides
_SYMBOL_OVERRIDES = {
    "kPEPE": "kpepeusdt_1h_hyperliquid.csv",
    "kBONK": "kbonkusdt_1h_hyperliquid.csv",
    "kSHIB": "kshibusdt_1h_hyperliquid.csv",
    "kFLOKI": "kflokiusdt_1h_hyperliquid.csv",
    "kLUNC": "kluncusdt_1h_hyperliquid.csv",
    "kNEIRO": "kneirousdt_1h_hyperliquid.csv",
}


def load_coin(symbol: str, freq: str = "1h") -> pd.DataFrame:
    """Load price data for a single coin. Returns DataFrame with DatetimeIndex."""
    filename = _SYMBOL_OVERRIDES.get(symbol)
    if not filename:
        filename = f"{symbol.lower()}usdt_{freq}_hyperliquid.csv"

    filepath = DATA_DIR / filename
    if not filepath.exists():
        raise FileNotFoundError(f"No price data for {symbol}: {filepath}")

    df = pd.read_csv(filepath)
    df["time"] = pd.to_datetime(df["time"], unit="ms")
    df = df.set_index("time").sort_index()
    df = df[["open", "high", "low", "close", "volume"]].astype(float)
    return df


def load_universe(min_days: int = 90) -> dict[str, pd.DataFrame]:
    """Load all coins that have dense enough hourly data.

    Selects coins with at least min_days of actual data points (not just date range).
    """
    universe = {}
    for f in sorted(DATA_DIR.iterdir()):
        if not f.name.endswith("_1h_hyperliquid.csv"):
            continue
        symbol = f.name.replace("usdt_1h_hyperliquid.csv", "").upper()
        try:
            df = load_coin(symbol)
            # Count actual data days (not just range)
            actual_days = len(df["close"].resample("D").last().dropna())
            if actual_days >= min_days:
                universe[symbol] = df
        except Exception:
            continue
    return universe


def get_daily_closes(universe: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Convert hourly data to daily close prices. Returns coins as columns.

    Finds the best common window where most coins have data.
    """
    # Get daily close for each coin (only days with actual data)
    closes = {}
    for symbol, df in universe.items():
        daily = df["close"].resample("D").last().dropna()
        closes[symbol] = daily

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

    # Keep columns with ≥60% data in this window
    coverage = result.notna().sum() / len(result)
    result = result.loc[:, coverage >= 0.6]

    # Forward-fill gaps of up to 2 days within the window
    result = result.ffill(limit=2)

    return result


if __name__ == "__main__":
    uni = load_universe(min_days=180)
    print(f"Loaded {len(uni)} coins with ≥180 days of data")
    closes = get_daily_closes(uni)
    print(f"Daily close matrix: {closes.shape}")
    print(f"Date range: {closes.index[0]} → {closes.index[-1]}")
