#!/usr/bin/env python3
"""Download hourly candle data from Hyperliquid for all traded coins."""
import csv
import json
import os
import time
from pathlib import Path

try:
    import urllib.request
    import urllib.error
except ImportError:
    pass

API_URL = os.getenv("HYPERLIQUID_API_URL", "https://api-ui.hyperliquid.xyz")
PROXY = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")
SLEEP_MS = int(os.getenv("PRICE_SLEEP_MS", "500"))

COIN_SYMBOL_OVERRIDES = {
    "KPEPE": "kPEPEUSDT",
    "KBONK": "kBONKUSDT",
    "KSHIB": "kSHIBUSDT",
    "KFLOKI": "kFLOKIUSDT",
    "KLUNC": "kLUNCUSDT",
    "KNEIRO": "kNEIROUSDT",
}


def make_request(payload: dict) -> list | dict | None:
    data = json.dumps(payload).encode("utf-8")
    if PROXY:
        proxy_handler = urllib.request.ProxyHandler({"https": PROXY, "http": PROXY})
        opener = urllib.request.build_opener(proxy_handler)
    else:
        opener = urllib.request.build_opener()
    for attempt in range(4):
        req = urllib.request.Request(
            f"{API_URL}/info",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        try:
            with opener.open(req, timeout=30) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code == 429 and attempt < 3:
                delay = 2 * (2 ** attempt)
                print(f"[warn] 429, retry {attempt + 1}/3 in {delay}s")
                time.sleep(delay)
                continue
            print(f"[warn] API request failed: {exc}")
            return None
        except Exception as exc:
            print(f"[warn] API request failed: {exc}")
            return None
    return None


def coin_to_symbol(coin: str) -> str:
    upper = coin.strip().upper()
    symbol = COIN_SYMBOL_OVERRIDES.get(upper, upper)
    if not symbol.endswith("USDT"):
        symbol = f"{symbol}USDT"
    return symbol


def get_csv_path(price_dir: Path, symbol: str) -> Path:
    return price_dir / f"{symbol.lower()}_1h_hyperliquid.csv"


def get_last_timestamp(csv_path: Path) -> int:
    if not csv_path.exists():
        return 0
    last_time = 0
    with open(csv_path, "r") as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        for row in reader:
            if row:
                try:
                    t = int(row[0])
                    if t > last_time:
                        last_time = t
                except (ValueError, IndexError):
                    pass
    return last_time


def extract_coins_from_trades(trades_dir: Path) -> set[str]:
    coins: set[str] = set()
    if not trades_dir.exists():
        return coins
    for csv_file in trades_dir.glob("*.csv"):
        try:
            with open(csv_file, "r") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    coin = (row.get("coin") or "").strip().upper()
                    if coin:
                        coins.add(coin)
        except Exception:
            pass
    return coins


def download_coin(coin: str, price_dir: Path) -> None:
    symbol = coin_to_symbol(coin)
    csv_path = get_csv_path(price_dir, symbol)
    last_ts = get_last_timestamp(csv_path)
    start_time = last_ts + 1 if last_ts > 0 else 0
    end_time = int(time.time() * 1000)

    if start_time >= end_time:
        return

    # Hyperliquid candle API
    payload = {
        "type": "candleSnapshot",
        "req": {
            "coin": coin,
            "interval": "1h",
            "startTime": start_time,
            "endTime": end_time,
        },
    }
    data = make_request(payload)
    if not isinstance(data, list) or len(data) == 0:
        return

    is_new = not csv_path.exists()
    with open(csv_path, "a") as f:
        if is_new:
            f.write("time,open,high,low,close,volume\n")
        for candle in data:
            t = candle.get("t") or candle.get("T") or candle.get("time") or 0
            o = candle.get("o") or candle.get("open") or 0
            h = candle.get("h") or candle.get("high") or 0
            l = candle.get("l") or candle.get("low") or 0
            c = candle.get("c") or candle.get("close") or 0
            v = candle.get("v") or candle.get("volume") or 0
            f.write(f"{t},{o},{h},{l},{c},{v}\n")

    print(f"[info] {symbol}: +{len(data)} candles")


def main() -> None:
    root_dir = Path(__file__).resolve().parents[1]
    trades_dir = Path(os.getenv("VAULT_TRADES_DIR", root_dir / "vault_trades_data"))
    price_dir = Path(os.getenv("VAULT_PRICE_DIR", root_dir / "crypto_data"))
    price_dir.mkdir(parents=True, exist_ok=True)

    coins = extract_coins_from_trades(trades_dir)
    if not coins:
        print("[warn] no coins found in trades data")
        return

    print(f"[info] downloading prices for {len(coins)} coins...")
    for coin in sorted(coins):
        download_coin(coin, price_dir)
        time.sleep(SLEEP_MS / 1000.0)

    print("[info] done")


if __name__ == "__main__":
    main()
