"""Universe filter: determine which coins are tradeable on each day."""
import pandas as pd
import numpy as np


def compute_daily_volume(hourly_data: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Compute daily USD volume for each coin.

    Args:
        hourly_data: dict of symbol → hourly OHLCV DataFrame
    Returns:
        DataFrame: index=date, columns=coins, values=daily USD volume
    """
    daily_vol = {}
    for symbol, df in hourly_data.items():
        # volume is in base units, multiply by close for USD volume
        usd_vol = (df["volume"] * df["close"]).resample("D").sum()
        daily_vol[symbol] = usd_vol

    return pd.DataFrame(daily_vol).fillna(0)


def get_tradeable_universe(
    daily_volume: pd.DataFrame,
    min_volume_usd: float = 1_000_000,
    exclude: list[str] | None = None,
) -> pd.DataFrame:
    """Boolean mask of tradeable coins per day.

    Returns DataFrame with True where coin is tradeable (sufficient liquidity).
    If volume data is all zero for a row (no data), treat all coins as tradeable.
    """
    mask = daily_volume >= min_volume_usd

    # If a row has zero total volume (no data available), mark all as tradeable
    no_data_rows = daily_volume.sum(axis=1) == 0
    mask.loc[no_data_rows] = True

    if exclude:
        for coin in exclude:
            if coin in mask.columns:
                mask[coin] = False

    return mask


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(__file__).rsplit("/", 2)[0] + "/data")
    from price_loader import load_universe

    universe = load_universe(min_days=180)
    daily_vol = compute_daily_volume(universe)

    # Show stats
    latest_vol = daily_vol.iloc[-1].sort_values(ascending=False)
    print(f"Total coins: {len(latest_vol)}")
    print(f"Coins with >$1M daily vol: {(latest_vol > 1_000_000).sum()}")
    print(f"Coins with >$5M daily vol: {(latest_vol > 5_000_000).sum()}")
    print(f"\nTop 20 by volume:")
    for coin, vol in latest_vol.head(20).items():
        print(f"  {coin:8s}: ${vol:>12,.0f}")
