"""Fetch historical funding rates from Hyperliquid API."""
import json
import os
import time
import urllib.request
from pathlib import Path

import pandas as pd

API_URL = "https://api.hyperliquid.xyz/info"
PROXY = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")
OUTPUT_DIR = Path(__file__).resolve().parents[2] / "strategy" / "data" / "funding_cache"


def _request(payload: dict) -> list | dict:
    data = json.dumps(payload).encode()
    if PROXY:
        handler = urllib.request.ProxyHandler({"https": PROXY, "http": PROXY})
        opener = urllib.request.build_opener(handler)
    else:
        opener = urllib.request.build_opener()

    req = urllib.request.Request(API_URL, data=data, headers={"Content-Type": "application/json"})
    for attempt in range(3):
        try:
            with opener.open(req, timeout=30) as resp:
                return json.loads(resp.read())
        except Exception as e:
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise


def fetch_funding_history(coin: str, start_time: int, end_time: int | None = None) -> list[dict]:
    """Fetch funding rate history for a coin. HL returns 1 entry per hour."""
    payload = {"type": "fundingHistory", "coin": coin, "startTime": start_time}
    if end_time:
        payload["endTime"] = end_time
    return _request(payload)


def fetch_all_coins_funding(coins: list[str], start_time: int, output_dir: Path | None = None) -> dict[str, pd.DataFrame]:
    """Fetch funding for all coins and cache to CSV."""
    if output_dir is None:
        output_dir = OUTPUT_DIR
    output_dir.mkdir(parents=True, exist_ok=True)

    results = {}
    for i, coin in enumerate(coins):
        cache_file = output_dir / f"{coin.lower()}_funding.csv"

        # Check if we already have recent data
        if cache_file.exists():
            df = pd.read_csv(cache_file)
            if len(df) > 0:
                last_time = df["time"].max()
                # If less than 4 hours old, skip
                if last_time > time.time() * 1000 - 4 * 3600 * 1000:
                    results[coin] = df
                    continue
                # Otherwise fetch from last known time
                start_time_coin = int(last_time) + 1
            else:
                start_time_coin = start_time
        else:
            start_time_coin = start_time

        print(f"[{i+1}/{len(coins)}] Fetching funding for {coin}...")
        try:
            data = fetch_funding_history(coin, start_time_coin)
            if not data:
                print(f"  No funding data for {coin}")
                continue

            df_new = pd.DataFrame(data)

            # Merge with existing if any
            if cache_file.exists():
                df_old = pd.read_csv(cache_file)
                df = pd.concat([df_old, df_new]).drop_duplicates(subset=["time"]).sort_values("time")
            else:
                df = df_new.sort_values("time")

            df.to_csv(cache_file, index=False)
            results[coin] = df
            print(f"  Got {len(df)} entries")
        except Exception as e:
            print(f"  Error: {e}")

        time.sleep(0.3)  # Rate limiting

    return results


def load_funding_matrix(coins: list[str], cache_dir: Path | None = None) -> pd.DataFrame:
    """Load cached funding data into a DataFrame with coins as columns."""
    if cache_dir is None:
        cache_dir = OUTPUT_DIR

    funding = {}
    for coin in coins:
        cache_file = cache_dir / f"{coin.lower()}_funding.csv"
        if not cache_file.exists():
            continue
        df = pd.read_csv(cache_file)
        df["time"] = pd.to_datetime(df["time"], unit="ms")
        df = df.set_index("time")
        funding[coin] = df["fundingRate"].astype(float)

    return pd.DataFrame(funding).sort_index()


if __name__ == "__main__":
    from price_loader import load_universe

    # Get list of coins we have price data for
    universe = load_universe(min_days=180)
    coins = sorted(universe.keys())
    print(f"Fetching funding for {len(coins)} coins...")

    # Fetch 6 months of funding history
    six_months_ago = int((time.time() - 180 * 86400) * 1000)
    fetch_all_coins_funding(coins, six_months_ago)
    print("Done!")
