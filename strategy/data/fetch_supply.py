"""Fetch token supply data from CoinGecko for inflation scoring."""
import json
import os
import time
import urllib.request
from pathlib import Path

import pandas as pd

OUTPUT_FILE = Path(__file__).resolve().parents[2] / "strategy" / "data" / "supply_data.csv"

# Map HL symbols to CoinGecko IDs
HL_TO_COINGECKO = {
    "BTC": "bitcoin", "ETH": "ethereum", "SOL": "solana",
    "ARB": "arbitrum", "OP": "optimism", "WLD": "worldcoin-wld",
    "SUI": "sui", "APT": "aptos", "STRK": "starknet",
    "ZRO": "layerzero", "DOT": "polkadot", "AVAX": "avalanche-2",
    "LINK": "chainlink", "UNI": "uniswap", "AAVE": "aave",
    "ATOM": "cosmos", "NEAR": "near", "INJ": "injective-protocol",
    "DOGE": "dogecoin", "XRP": "ripple", "ADA": "cardano",
    "BNB": "binancecoin", "TIA": "celestia", "SEI": "sei-network",
    "ONDO": "ondo-finance", "PENDLE": "pendle", "RENDER": "render-token",
    "FIL": "filecoin", "LDO": "lido-dao", "BERA": "berachain-bera",
    "GALA": "gala", "SAND": "the-sandbox", "MINA": "mina-protocol",
    "DYDX": "dydx-chain", "JUP": "jupiter-exchange-solana",
    "POL": "polygon-ecosystem-token", "BLUR": "blur",
    "W": "wormhole", "PYTH": "pyth-network",
    "ENA": "ethena", "EIGEN": "eigenlayer",
    "ZEC": "zcash", "TAO": "bittensor",
    "TRUMP": "official-trump", "IP": "story-protocol",
    "HYPE": "hyperliquid", "CRV": "curve-dao-token",
    "SNX": "havven", "GMX": "gmx", "STX": "blockstack",
    "ORDI": "ordinals", "TRX": "tron", "TON": "the-open-network",
    "FET": "artificial-superintelligence-alliance",
    "XLM": "stellar", "ALGO": "algorand", "VET": "vechain",
    "MANA": "decentraland", "AXS": "axie-infinity",
    "HBAR": "hedera-hashgraph", "NEO": "neo",
    "ICP": "internet-computer", "GRT": "the-graph",
}

PROXY = os.getenv("HTTPS_PROXY") or os.getenv("HTTP_PROXY")


def _request(url: str) -> dict:
    if PROXY:
        handler = urllib.request.ProxyHandler({"https": PROXY, "http": PROXY})
        opener = urllib.request.build_opener(handler)
    else:
        opener = urllib.request.build_opener()

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(3):
        try:
            with opener.open(req, timeout=15) as resp:
                return json.loads(resp.read())
        except urllib.request.HTTPError as e:
            if e.code == 429:
                wait = 60 if attempt < 2 else 120
                print(f"  Rate limited, waiting {wait}s...")
                time.sleep(wait)
            else:
                raise
        except Exception as e:
            if attempt < 2:
                time.sleep(5)
            else:
                raise


def fetch_supply_data(symbols: list[str]) -> pd.DataFrame:
    """Fetch supply/FDV data for given HL symbols."""
    rows = []

    for i, symbol in enumerate(symbols):
        cg_id = HL_TO_COINGECKO.get(symbol)
        if not cg_id:
            continue

        print(f"[{i+1}/{len(symbols)}] Fetching {symbol} ({cg_id})...")
        try:
            url = f"https://api.coingecko.com/api/v3/coins/{cg_id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false"
            data = _request(url)
            md = data.get("market_data", {})

            circ = md.get("circulating_supply") or 0
            total = md.get("total_supply") or 0
            max_supply = md.get("max_supply")
            mcap = (md.get("market_cap") or {}).get("usd", 0)
            fdv = (md.get("fully_diluted_valuation") or {}).get("usd", 0)

            rows.append({
                "symbol": symbol,
                "coingecko_id": cg_id,
                "circulating_supply": circ,
                "total_supply": total,
                "max_supply": max_supply,
                "market_cap_usd": mcap,
                "fdv_usd": fdv,
                "circ_total_ratio": circ / total if total > 0 else 1.0,
                "mcap_fdv_ratio": mcap / fdv if fdv > 0 else 1.0,
            })
            print(f"  MCap/FDV: {mcap/fdv:.2%}" if fdv > 0 else "  No FDV data")
        except Exception as e:
            print(f"  Error: {e}")

        time.sleep(2.5)  # CoinGecko free tier: ~30 req/min

    df = pd.DataFrame(rows)
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"\nSaved {len(df)} coins to {OUTPUT_FILE}")
    return df


if __name__ == "__main__":
    symbols = sorted(HL_TO_COINGECKO.keys())
    print(f"Fetching supply data for {len(symbols)} coins...")
    df = fetch_supply_data(symbols)
    print(f"\nLowest MCap/FDV (highest inflation pressure):")
    df_sorted = df.sort_values("mcap_fdv_ratio")
    print(df_sorted[["symbol", "mcap_fdv_ratio", "fdv_usd"]].head(15).to_string(index=False))
