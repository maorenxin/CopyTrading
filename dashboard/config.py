"""Dashboard strategy configuration — parameters from RESULTS.md"""

# Portfolio
INITIAL_CAPITAL = 20_000
N_LONG = 7
N_SHORT = 15
LEVERAGE = 0.21

# Signal
MOMENTUM_WINDOW = 14  # days

# Costs
FEE_BPS = 1.4  # blended 85% maker + 15% taker

# Universe filter
EXCLUDE_COINS = ["BTC", "HYPE", "UNI", "SUSHI", "DYDX", "GMX"]
MIN_HISTORY_DAYS = 365

# Scheduling
REBALANCE_HOUR_UTC = 0  # rebalance at UTC 00:00

# Mode
MODE = "paper"  # "paper" | "live"

# Data paths (relative to project root)
CRYPTO_DATA_DIR = "crypto_data"
DB_PATH = "dashboard/paper_trading.db"

# Load persisted overrides written by the settings UI (POST /api/config).
# JSON keys are lowercase (e.g. "leverage") and map to the uppercase module
# constants above. Parse errors are intentionally left to propagate.
import json as _json
from pathlib import Path as _Path

_CONFIG_FILE = _Path(__file__).with_name("config.json")
_EDITABLE_KEYS = {
    "INITIAL_CAPITAL", "N_LONG", "N_SHORT", "LEVERAGE",
    "MOMENTUM_WINDOW", "FEE_BPS", "REBALANCE_HOUR_UTC",
}

if _CONFIG_FILE.exists():
    for _k, _v in _json.loads(_CONFIG_FILE.read_text()).items():
        _key = _k.upper()
        if _key in _EDITABLE_KEYS:
            globals()[_key] = _v
