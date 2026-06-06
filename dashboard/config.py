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
