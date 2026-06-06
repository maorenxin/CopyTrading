"""Real-time mark price fetcher from Hyperliquid API."""
import json
import logging
from urllib.request import Request, urlopen
from typing import Optional

logger = logging.getLogger(__name__)

HL_INFO_URL = "https://api.hyperliquid.xyz/info"


def fetch_mark_prices() -> dict[str, float]:
    """Fetch all mid prices from Hyperliquid.

    Returns dict of coin -> price (e.g. {"BTC": 100000.5, "ETH": 3500.2}).
    """
    req = Request(HL_INFO_URL, method="POST")
    req.add_header("Content-Type", "application/json")
    body = json.dumps({"type": "allMids"}).encode()

    try:
        with urlopen(req, body, timeout=10) as resp:
            data = json.loads(resp.read())
        # Convert string prices to float
        return {coin: float(price) for coin, price in data.items()}
    except Exception as e:
        logger.error(f"Failed to fetch mark prices: {e}")
        return {}
