#!/usr/bin/env python3
import argparse
import json
import math
import os
import subprocess
from pathlib import Path

import pandas as pd
import quantstats as qs


# === 基础配置 ===
_TIME_KEYS = {"time", "timestamp", "timems", "timemillis", "time_ms", "ts"}
_RESAMPLE_TZ = os.getenv("VAULT_RESAMPLE_TZ", "Asia/Shanghai")
_COIN_SYMBOL_OVERRIDES = {
    "KPEPE": "kPEPEUSDT",
    "KBONK": "kBONKUSDT",
    "KSHIB": "kSHIBUSDT",
    "KFLOKI": "kFLOKIUSDT",
    "KLUNC": "kLUNCUSDT",
    "KNEIRO": "kNEIROUSDT",
}


# === 通用工具 ===
def sync_quantstats_to_db(root_dir: Path) -> None:
    """
    调用 Node 脚本将 quantstats CSV 写入数据库。
    参数:
        root_dir: 项目根目录。
    返回:
        无。
    """
    script_path = root_dir / "server" / "scripts" / "vault-quantstats-sync.js"
    if not script_path.exists():
        print(f"[warn] quantstats db sync script not found: {script_path}")
        return
    env = os.environ.copy()
    try:
        node_bin = env.get("NODE_BIN")
        if not node_bin:
            candidate = Path("/opt/homebrew/opt/node@20/bin/node")
            node_bin = str(candidate) if candidate.exists() else "node"
        subprocess.run([node_bin, str(script_path)], check=True, env=env)
    except Exception as exc:
        print(f"[warn] quantstats db sync failed: {exc}")


def _normalize_column(name: str) -> str:
    """
    规范化字段名，便于模糊匹配。
    参数:
        name: 原始字段名。
    返回:
        仅保留字母与数字的小写字符串。
    """
    return "".join(ch for ch in str(name).lower() if ch.isalnum())


def _normalize_freq(freq: str | None) -> str:
    """
    规范化 resample 频率。
    参数:
        freq: 原始频率字符串。
    返回:
        小写频率字符串，默认 d。
    """
    if not freq:
        return "d"
    return str(freq).strip().lower()


def _to_resample_time_from_ms(series: pd.Series) -> pd.Series:
    """
    将毫秒时间戳序列转换为东八区时间。
    参数:
        series: 毫秒时间戳序列。
    返回:
        带时区的时间序列。
    """
    return pd.to_datetime(series, unit="ms", errors="coerce", utc=True).dt.tz_convert(
        _RESAMPLE_TZ
    )


def _ensure_resample_tz(index: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """
    统一索引时区为东八区。
    参数:
        index: 时间索引。
    返回:
        统一时区后的索引。
    """
    if index.tz is None:
        return index.tz_localize(_RESAMPLE_TZ)
    return index.tz_convert(_RESAMPLE_TZ)


# === 读取 VAULTS.csv ===
def load_vault_addresses(vaults_csv: Path, relationship_type: str | None = None) -> list[str]:
    """
    读取 VAULTS.csv 中的 vault 地址。
    参数:
        vaults_csv: VAULTS.csv 路径。
        relationship_type: 需要筛选的 relationshipType。
    返回:
        vault 地址列表。
    """
    if not vaults_csv.exists():
        return []
    try:
        df = pd.read_csv(vaults_csv)
    except Exception as exc:
        print(f"[warn] failed reading {vaults_csv}: {exc}")
        return []
    if df.empty:
        return []
    addr_col = None
    relation_col = None
    for name in ["vaultAddress", "vault_address", "vault"]:
        if name in df.columns:
            addr_col = name
            break
    for name in ["relationshipType", "relationshiptype", "relationship_type"]:
        if name in df.columns:
            relation_col = name
            break
    if not addr_col:
        return []
    if relationship_type and relation_col:
        df = df[df[relation_col].astype(str).str.lower() == relationship_type.lower()]
    addrs = df[addr_col].dropna().astype(str).str.strip().str.lower().tolist()
    return [addr for addr in addrs if addr]


def load_vault_create_time_map(vaults_csv: Path) -> dict[str, int]:
    """
    读取 VAULTS.csv 中的 createTimeMillis。
    参数:
        vaults_csv: VAULTS.csv 路径。
    返回:
        vault 地址 -> createTimeMillis 的映射。
    """
    if not vaults_csv.exists():
        return {}
    try:
        df = pd.read_csv(vaults_csv)
    except Exception as exc:
        print(f"[warn] failed reading {vaults_csv}: {exc}")
        return {}
    if df.empty:
        return {}
    addr_col = None
    time_col = None
    for name in ["vaultAddress", "vault_address", "vault"]:
        if name in df.columns:
            addr_col = name
            break
    for name in ["createTimeMillis", "create_time_millis", "create_time_ms"]:
        if name in df.columns:
            time_col = name
            break
    if not addr_col or not time_col:
        return {}
    mapping: dict[str, int] = {}
    for _, row in df.iterrows():
        addr = str(row.get(addr_col, "")).strip().lower()
        if not addr:
            continue
        try:
            time_ms = int(row.get(time_col))
        except Exception:
            continue
        mapping[addr] = time_ms
    return mapping


# === 交易与现金流解析 ===
def _resolve_time_value_columns(df: pd.DataFrame, value_keys: set[str]):
    """
    解析时间列与数值列。
    参数:
        df: 原始 DataFrame。
        value_keys: 数值列候选字段集合。
    返回:
        (时间列名, 数值列名)。
    """
    time_col = None
    value_col = None
    for col in df.columns:
        key = _normalize_column(col)
        if key in _TIME_KEYS and time_col is None:
            time_col = col
        if key in value_keys and value_col is None:
            value_col = col
    return time_col, value_col


def _resolve_trade_columns(df: pd.DataFrame):
    """
    解析成交数据字段。
    参数:
        df: 成交数据 DataFrame。
    返回:
        (time, coin, dir, px, sz, closed_pnl, fee) 对应列名。
    """
    time_col = None
    coin_col = None
    dir_col = None
    px_col = None
    sz_col = None
    pnl_col = None
    fee_col = None
    for col in df.columns:
        key = _normalize_column(col)
        if key in _TIME_KEYS and time_col is None:
            time_col = col
        if key in {"coin", "symbol", "asset"} and coin_col is None:
            coin_col = col
        if key in {"dir", "direction"} and dir_col is None:
            dir_col = col
        if key in {"px", "price", "fillprice", "tradeprice"} and px_col is None:
            px_col = col
        if key in {"sz", "size", "qty", "quantity"} and sz_col is None:
            sz_col = col
        if key in {"closedpnl", "closedpnlusd", "closepnl", "pnl"} and pnl_col is None:
            pnl_col = col
        if key in {"fee", "fees", "tradingfee"} and fee_col is None:
            fee_col = col
    return time_col, coin_col, dir_col, px_col, sz_col, pnl_col, fee_col


def _resolve_signed_size(dir_value: str | None, size: float) -> float:
    """
    根据 dir 规则生成带符号的成交 size。
    参数:
        dir_value: 成交方向字段。
        size: 原始成交数量。
    返回:
        带方向的 size（多为正，空为负）。
    """
    if size == 0 or not pd.notna(size):
        return 0.0
    direction = str(dir_value or "").strip().lower()
    if "open long" in direction:
        return size
    if "close long" in direction:
        return -size
    if "open short" in direction:
        return -size
    if "close short" in direction:
        return size
    if "long > short" in direction:
        return -size
    if "short > long" in direction:
        return size
    return 0.0


def load_trades(trades_path: Path) -> pd.DataFrame:
    """
    读取交易 CSV 并标准化字段。
    参数:
        trades_path: 交易 CSV 路径。
    返回:
        标准化后的交易 DataFrame。
    """
    if not trades_path.exists():
        return pd.DataFrame()
    try:
        df = pd.read_csv(trades_path)
    except Exception as exc:
        print(f"[warn] failed reading {trades_path.name}: {exc}")
        return pd.DataFrame()
    if df.empty:
        return pd.DataFrame()

    time_col, coin_col, dir_col, px_col, sz_col, pnl_col, fee_col = _resolve_trade_columns(
        df
    )
    if not time_col or not coin_col or not dir_col or not px_col or not sz_col:
        print(f"[warn] missing trade columns in {trades_path.name}")
        return pd.DataFrame()

    out = pd.DataFrame(
        {
            "time": pd.to_numeric(df[time_col], errors="coerce"),
            "coin": df[coin_col].astype(str).str.strip().str.upper(),
            "dir": df[dir_col].astype(str),
            "px": pd.to_numeric(df[px_col], errors="coerce"),
            "sz": pd.to_numeric(df[sz_col], errors="coerce"),
            "closed_pnl": pd.to_numeric(df.get(pnl_col), errors="coerce").fillna(0.0),
            "fee": pd.to_numeric(df.get(fee_col), errors="coerce").fillna(0.0)
            if fee_col
            else 0.0,
        }
    )
    out = out[out["time"].notna() & out["coin"].ne("")]
    if out.empty:
        return pd.DataFrame()
    out["time"] = _to_resample_time_from_ms(out["time"])
    out = out.sort_values("time")
    return out


def load_cashflows(csv_path: Path) -> pd.DataFrame:
    """
    读取现金流 CSV（funding 或 ledger）。
    参数:
        csv_path: CSV 路径。
    返回:
        包含 time 与 amount 的 DataFrame。
    """
    if not csv_path.exists():
        return pd.DataFrame(columns=["time", "amount"])
    try:
        df = pd.read_csv(csv_path)
    except Exception as exc:
        print(f"[warn] failed reading {csv_path.name}: {exc}")
        return pd.DataFrame(columns=["time", "amount"])
    if df.empty:
        return pd.DataFrame(columns=["time", "amount"])
    time_col, value_col = _resolve_time_value_columns(df, {"usdc"})
    if not time_col or not value_col:
        return pd.DataFrame(columns=["time", "amount"])
    time_ms = pd.to_numeric(df[time_col], errors="coerce")
    values = pd.to_numeric(df[value_col], errors="coerce").fillna(0.0)
    out = df.loc[time_ms.notna()].copy()
    if out.empty:
        return pd.DataFrame(columns=["time", "amount"])
    out["time"] = _to_resample_time_from_ms(time_ms.loc[out.index])
    out["amount"] = values.loc[out.index]
    out = out[["time", "amount"]].dropna().sort_values("time")
    return out


def load_ledger_events(csv_path: Path) -> pd.DataFrame:
    """
    读取账本 CSV，提取时间与类型信息。
    参数:
        csv_path: CSV 路径。
    返回:
        包含 time 与 ledge_type 的 DataFrame。
    """
    if not csv_path.exists():
        return pd.DataFrame(columns=["time", "ledge_type"])
    try:
        df = pd.read_csv(csv_path)
    except Exception as exc:
        print(f"[warn] failed reading ledger {csv_path.name}: {exc}")
        return pd.DataFrame(columns=["time", "ledge_type"])
    if df.empty:
        return pd.DataFrame(columns=["time", "ledge_type"])

    time_col = None
    type_col = None
    for col in df.columns:
        key = _normalize_column(col)
        if key in _TIME_KEYS and time_col is None:
            time_col = col
        if key in {"ledgetype", "ledger", "ledgertype", "type"} and type_col is None:
            type_col = col
    if not time_col or not type_col:
        return pd.DataFrame(columns=["time", "ledge_type"])

    time_ms = pd.to_numeric(df[time_col], errors="coerce")
    out = df.loc[time_ms.notna()].copy()
    if out.empty:
        return pd.DataFrame(columns=["time", "ledge_type"])
    out["time"] = _to_resample_time_from_ms(time_ms.loc[out.index])
    out["ledge_type"] = out[type_col].astype(str)
    return out[["time", "ledge_type"]].dropna().sort_values("time")


def compute_follower_stats(ledger_events: pd.DataFrame) -> tuple[int, float]:
    """
    基于账本的 deposit/withdraw 事件估算跟单人数与人均持仓时长。
    参数:
        ledger_events: 账本事件 DataFrame。
    返回:
        (当前跟单人数, 平均持仓时长_天)。
    """
    if ledger_events is None or ledger_events.empty:
        return 0, 0.0
    events = ledger_events.copy()
    events["ledge_type"] = events["ledge_type"].astype(str).str.lower()
    events = events[events["ledge_type"].str.contains("deposit|withdraw", na=False)]
    if events.empty:
        return 0, 0.0
    events = events.sort_values("time")
    pending: list[pd.Timestamp] = []
    durations: list[float] = []
    for _, row in events.iterrows():
        ledge_type = row["ledge_type"]
        event_time = row["time"]
        if pd.isna(event_time):
            continue
        if "deposit" in ledge_type:
            pending.append(event_time)
            continue
        if "withdraw" in ledge_type and pending:
            start_time = pending.pop(0)
            durations.append((event_time - start_time).total_seconds())
    now = pd.Timestamp.now(tz=_RESAMPLE_TZ)
    for start_time in pending:
        durations.append((now - start_time).total_seconds())
    avg_days = float(sum(durations) / len(durations) / 86400.0) if durations else 0.0
    return len(pending), avg_days


def compute_avg_trades_per_day(trades_df: pd.DataFrame) -> float:
    """
    根据成交记录计算日均交易次数。
    参数:
        trades_df: 成交 DataFrame。
    返回:
        日均交易次数。
    """
    if trades_df is None or trades_df.empty:
        return 0.0
    min_time = trades_df["time"].min()
    max_time = trades_df["time"].max()
    if pd.isna(min_time) or pd.isna(max_time):
        return 0.0
    span_days = max((max_time - min_time).total_seconds() / 86400.0, 1.0)
    return float(len(trades_df) / span_days)


def to_iso_utc(timestamp: pd.Timestamp | None) -> str | None:
    """
    将时间戳转换为 UTC ISO 字符串。
    参数:
        timestamp: 时间戳。
    返回:
        ISO 时间字符串。
    """
    if timestamp is None or pd.isna(timestamp):
        return None
    ts = timestamp
    if ts.tz is None:
        ts = ts.tz_localize(_RESAMPLE_TZ)
    return ts.tz_convert("UTC").isoformat()


# === 价格数据 ===
def _resolve_price_path(price_dir: Path, coin: str, price_interval: str) -> Path:
    """
    构造币种价格 CSV 路径。
    参数:
        price_dir: 价格文件夹路径。
        coin: 币种名称。
        price_interval: 价格周期（如 1h）。
    返回:
        价格 CSV 路径。
    """
    upper = str(coin).strip().upper()
    symbol = _COIN_SYMBOL_OVERRIDES.get(upper, upper)
    if not symbol.endswith("USDT"):
        symbol = f"{symbol}USDT"
    suffix = price_interval.lower()
    base = f"{symbol.lower()}_{suffix}"
    hyper_path = price_dir / f"{base}_hyperliquid.csv"
    if hyper_path.exists():
        return hyper_path
    return price_dir / f"{base}.csv"


def load_hourly_price_series(csv_path: Path) -> pd.Series:
    """
    读取价格 CSV 并构造小时级序列。
    参数:
        csv_path: 价格 CSV 路径。
    返回:
        小时级价格序列。
    """
    if not csv_path.exists():
        return pd.Series(dtype=float)
    try:
        df = pd.read_csv(csv_path)
    except Exception as exc:
        print(f"[warn] failed reading price {csv_path.name}: {exc}")
        return pd.Series(dtype=float)
    if df.empty:
        return pd.Series(dtype=float)

    time_col, price_col = _resolve_time_value_columns(df, {"close", "price"})
    if not time_col or not price_col:
        print(f"[warn] missing time/price columns in {csv_path.name}")
        return pd.Series(dtype=float)

    time_ms = pd.to_numeric(df[time_col], errors="coerce")
    prices = pd.to_numeric(df[price_col], errors="coerce")
    out = df.loc[time_ms.notna()].copy()
    if out.empty:
        return pd.Series(dtype=float)
    out["time"] = _to_resample_time_from_ms(time_ms.loc[out.index]).dt.floor("h")
    out["price"] = prices.loc[out.index]
    series = out.groupby("time")["price"].last().sort_index()
    series = series.resample("h").ffill()
    return series


# === 下载价格数据 ===
def download_crypto_prices(
    coins: list[str],
    price_dir: Path,
    price_interval: str,
    start_time_ms: int | None,
) -> bool:
    """
    触发币种价格下载流程。
    参数:
        coins: 需要下载的币种列表。
        price_dir: 价格数据目录。
        price_interval: 价格周期。
        start_time_ms: 起始毫秒时间戳。
    返回:
        是否执行成功。
    """
    if not coins:
        return True
    # Price download is now handled by scripts/download-prices.py
    # This function is kept as a no-op for compatibility
    print(f"[info] skipping in-process price download (use scripts/download-prices.py)")
    return True


def ensure_price_data(
    coins: list[str],
    price_dir: Path,
    price_interval: str,
    start_time_ms: int | None,
) -> None:
    """
    确保币种价格文件存在，不存在则触发下载。
    参数:
        coins: 需要检查的币种列表。
        price_dir: 价格数据目录。
        price_interval: 价格周期。
        start_time_ms: 起始毫秒时间戳。
    返回:
        无。
    """
    missing = []
    for coin in coins:
        upper = str(coin).strip().upper()
        symbol = _COIN_SYMBOL_OVERRIDES.get(upper, upper)
        if not symbol.endswith("USDT"):
            symbol = f"{symbol}USDT"
        suffix = price_interval.lower()
        binance_path = price_dir / f"{symbol.lower()}_{suffix}_binance.csv"
        hyper_path = price_dir / f"{symbol.lower()}_{suffix}_hyperliquid.csv"
        if binance_path.exists() and not load_hourly_price_series(binance_path).empty:
            continue
        if hyper_path.exists() and not load_hourly_price_series(hyper_path).empty:
            continue
        missing.append(coin)
    if missing:
        print(f"[info] missing price files, start download: {', '.join(missing)}")
        download_crypto_prices(missing, price_dir, price_interval, start_time_ms)


# === 基准收益率 ===
def build_benchmark_returns(
    price_dir: Path, price_interval: str, freq: str, target_index: pd.DatetimeIndex | None = None
) -> pd.Series:
    """
    构造 BTCUSDT 买入持有的基准收益率序列。
    参数:
        price_dir: 价格数据目录。
        price_interval: 价格周期（如 1h）。
        freq: 汇总频率（h 或 d）。
        target_index: 对齐目标索引（可选）。
    返回:
        基准收益率序列。
    """
    price_path = _resolve_price_path(price_dir, "BTC", price_interval)
    price_series = load_hourly_price_series(price_path)
    if price_series.empty:
        return pd.Series(dtype=float)
    price_series.index = _ensure_resample_tz(price_series.index)
    resample_freq = _normalize_freq(freq)
    if resample_freq != "h":
        price_series = price_series.resample(resample_freq).last().ffill()
    returns = price_series / price_series.shift(1) - 1
    returns = returns.replace([math.inf, -math.inf], 0.0).fillna(0.0)
    if target_index is not None and len(target_index) > 0:
        target_index = pd.DatetimeIndex(target_index)
        if target_index.tz is not None:
            target_index = target_index.tz_localize(None)
        if returns.index.tz is not None:
            returns.index = returns.index.tz_localize(None)
        returns = returns.reindex(target_index, fill_value=0.0)
    return returns


# === NAV 计算 ===
def build_nav_series(
    trades_df: pd.DataFrame,
    funding_df: pd.DataFrame,
    ledger_df: pd.DataFrame,
    price_dir: Path,
    price_interval: str,
    start_time: pd.Timestamp | None = None,
) -> pd.DataFrame:
    """
    构建逐小时 NAV 及过程数据。
    参数:
        trades_df: 成交明细。
        funding_df: funding 现金流。
        ledger_df: 充值/提现现金流。
        price_dir: 价格数据目录。
        price_interval: 价格周期。
        start_time: 计算起点时间（时区需与配置一致）。
    返回:
        包含 nav、现金流与 pnl 的 DataFrame。
    """
    if trades_df.empty:
        return pd.DataFrame()

    coins = sorted(trades_df["coin"].dropna().unique().tolist())
    price_map: dict[str, pd.Series] = {}
    missing = []
    for coin in coins:
        price_path = _resolve_price_path(price_dir, coin, price_interval)
        series = load_hourly_price_series(price_path)
        if series.empty:
            missing.append(coin)
        else:
            price_map[coin] = series
    if missing:
        print(f"[warn] missing price data for coins: {', '.join(missing)}, skipping them")
    if not price_map:
        print(f"[warn] no price data available for any coin")
        return pd.DataFrame()
    # Filter trades to only coins with price data
    coins = sorted(price_map.keys())
    trades_df = trades_df[trades_df["coin"].isin(coins)]
    if trades_df.empty:
        return pd.DataFrame()

    price_df = pd.concat(price_map, axis=1).sort_index()
    if price_df.empty:
        return pd.DataFrame()
    price_df.index = _ensure_resample_tz(price_df.index)
    price_start = price_df.index.min()
    price_end = price_df.index.max()
    if price_start is None or pd.isna(price_start) or price_end is None or pd.isna(price_end):
        return pd.DataFrame()
    if start_time is not None and pd.notna(start_time):
        start_time = _ensure_resample_tz(pd.DatetimeIndex([start_time]))[0]
        aligned_start = start_time.ceil("h")
        range_start = max(price_start, aligned_start)
    else:
        range_start = price_start
    if range_start > price_end:
        return pd.DataFrame()
    index = pd.date_range(start=range_start, end=price_end, freq="h", tz=_RESAMPLE_TZ)
    price_df = price_df.reindex(index).ffill()

    trade_rows = trades_df.to_dict("records")
    fund_rows = funding_df.to_dict("records") if not funding_df.empty else []
    ledger_rows = ledger_df.to_dict("records") if not ledger_df.empty else []

    trade_idx = 0
    fund_idx = 0
    ledger_idx = 0
    cash = 0.0
    total_shares = 0.0
    last_positive_unit_nav = 1.0
    positions = {coin: 0.0 for coin in coins}
    cost_basis = {coin: 0.0 for coin in coins}
    nav_rows = []
    prev_ts = None

    for ts in index:
        closed_pnl_sum = 0.0
        fee_sum = 0.0
        funding_sum = 0.0
        ledger_sum = 0.0

        while trade_idx < len(trade_rows) and trade_rows[trade_idx]["time"] <= ts:
            row = trade_rows[trade_idx]
            trade_idx += 1
            if prev_ts is not None and row["time"] <= prev_ts:
                continue
            coin = row["coin"]
            signed_size = _resolve_signed_size(row["dir"], float(row["sz"]))
            if signed_size == 0:
                continue
            px = float(row["px"]) if pd.notna(row["px"]) else 0.0
            closed_pnl = float(row["closed_pnl"]) if pd.notna(row["closed_pnl"]) else 0.0
            fee = float(row["fee"]) if pd.notna(row["fee"]) else 0.0

            positions[coin] = positions.get(coin, 0.0) + signed_size
            cost_basis[coin] = cost_basis.get(coin, 0.0) + px * signed_size
            if abs(positions[coin]) < 1e-12:
                positions[coin] = 0.0
                cost_basis[coin] = 0.0

            cash += closed_pnl - fee
            closed_pnl_sum += closed_pnl
            fee_sum += fee

        while fund_idx < len(fund_rows) and fund_rows[fund_idx]["time"] <= ts:
            row = fund_rows[fund_idx]
            fund_idx += 1
            if prev_ts is not None and row["time"] <= prev_ts:
                continue
            amount = float(row["amount"])
            cash += amount
            funding_sum += amount

        # Collect ledger (deposit/withdraw) events for this hour
        ledger_events_this_hour: list[float] = []
        while ledger_idx < len(ledger_rows) and ledger_rows[ledger_idx]["time"] <= ts:
            row = ledger_rows[ledger_idx]
            ledger_idx += 1
            if prev_ts is not None and row["time"] <= prev_ts:
                continue
            amount = float(row["amount"])
            ledger_events_this_hour.append(amount)

        # Calculate unrealized PnL before processing deposits
        unrealized = 0.0
        has_position = False
        for coin in coins:
            size = positions.get(coin, 0.0)
            if size == 0:
                continue
            has_position = True
            avg_entry = cost_basis.get(coin, 0.0) / size
            price_ts = ts.floor("h")
            if price_ts in price_df.index:
                mark_price = price_df.at[price_ts, coin]
            else:
                mark_price = price_df[coin].asof(price_ts)
            if pd.isna(mark_price):
                continue
            unrealized += size * (float(mark_price) - avg_entry)

        # Process deposits/withdrawals using share-based method
        for amount in ledger_events_this_hour:
            total_asset_before = cash + unrealized
            if total_shares > 0 and total_asset_before > 1e-6:
                current_unit_nav = total_asset_before / total_shares
                if current_unit_nav > 1e-9:
                    last_positive_unit_nav = current_unit_nav
                share_delta = amount / current_unit_nav
            elif total_shares > 0 and total_asset_before <= 1e-6:
                # NAV is zero or negative — use last known positive unit_nav
                share_delta = amount / last_positive_unit_nav
            else:
                # First deposit: 1 share = 1 USDC
                share_delta = amount
            total_shares += share_delta
            if total_shares < 1e-6:
                total_shares = 0.0
            cash += amount
            ledger_sum += amount

        # Recalculate total asset value after deposits
        total_nav = cash + unrealized
        if total_shares > 0:
            unit_nav = max(total_nav / total_shares, 0.0)
            if unit_nav > 1e-9:
                last_positive_unit_nav = unit_nav
        else:
            unit_nav = 0.0

        nav_rows.append(
            {
                "time": ts,
                "nav": total_nav,
                "unit_nav": unit_nav,
                "total_shares": total_shares,
                "cash": cash,
                "deposit_withdraw": ledger_sum,
                "funding": funding_sum,
                "closed_pnl": closed_pnl_sum,
                "fee": fee_sum,
                "unrealized_pnl": unrealized,
                "in_market": 1 if has_position else 0,
            }
        )
        prev_ts = ts

    return pd.DataFrame(nav_rows).set_index("time")


def resample_nav_frame(nav_df: pd.DataFrame, freq: str) -> pd.DataFrame:
    """
    按频率汇总 NAV 明细。
    参数:
        nav_df: 逐小时 NAV 明细。
        freq: 汇总频率。
    返回:
        汇总后的 NAV 明细。
    """
    if nav_df.empty:
        return nav_df
    resample_freq = _normalize_freq(freq)
    if resample_freq == "h":
        return nav_df
    agg_map = {
        "nav": "last",
        "unit_nav": "last",
        "total_shares": "last",
        "cash": "last",
        "unrealized_pnl": "last",
        "deposit_withdraw": "sum",
        "funding": "sum",
        "closed_pnl": "sum",
        "fee": "sum",
    }
    return nav_df.resample(resample_freq).agg(agg_map).dropna()


def _trim_leading_zero(nav_series: pd.Series) -> pd.Series:
    """
    移除前置零净值，避免影响回撤。
    参数:
        nav_series: NAV 序列。
    返回:
        修剪后的 NAV 序列。
    """
    if nav_series.empty:
        return nav_series
    positive = nav_series[nav_series > 0]
    if positive.empty:
        return nav_series
    start_time = positive.index[0]
    return nav_series.loc[nav_series.index >= start_time]


def compute_returns(nav_series: pd.Series) -> pd.Series:
    """
    由 NAV 计算收益率序列。
    参数:
        nav_series: NAV 序列。
    返回:
        收益率序列。
    """
    nav_series = nav_series.copy()
    prev = nav_series.shift(1)
    returns = nav_series / prev - 1
    returns = returns.replace([math.inf, -math.inf], 0.0).fillna(0.0)
    if len(returns) > 1:
        returns = returns.iloc[1:]
    return returns


def compute_sharpe(returns: pd.Series, freq: str, annualize: bool) -> float:
    """
    计算 Sharpe Ratio。
    参数:
        returns: 收益率序列。
        freq: 汇总频率。
        annualize: 是否年化。
    返回:
        Sharpe 值。
    """
    if returns is None or returns.empty or len(returns) < 2:
        return 0.0
    std = returns.std(ddof=1)
    if std == 0 or not math.isfinite(std):
        return 0.0
    mean = returns.mean()
    if not annualize:
        return float(mean / std)
    resample_freq = _normalize_freq(freq)
    if resample_freq == "h":
        scale = math.sqrt(24 * 365)
    else:
        scale = math.sqrt(365)
    return float(mean / std * scale)


def compute_mdd(nav_series: pd.Series) -> float:
    """
    计算最大回撤。
    参数:
        nav_series: NAV 序列。
    返回:
        最大回撤。
    """
    nav_series = _trim_leading_zero(nav_series)
    if nav_series.empty:
        return 0.0
    cummax = nav_series.cummax()
    drawdown = (nav_series - cummax) / cummax
    return float(drawdown.min())


def compute_avg_hold_days(nav_df: pd.DataFrame) -> float:
    """
    计算平均持仓天数（按连续有仓位区间）。
    参数:
        nav_df: 逐小时 NAV 明细。
    返回:
        平均持仓天数。
    """
    if nav_df is None or nav_df.empty or "in_market" not in nav_df.columns:
        return 0.0
    series = nav_df["in_market"].fillna(0).astype(int)
    if series.empty:
        return 0.0
    durations = []
    in_pos = False
    start_time = None
    for ts, flag in series.items():
        if flag and not in_pos:
            in_pos = True
            start_time = ts
        elif not flag and in_pos:
            if start_time is not None:
                durations.append((ts - start_time).total_seconds())
            in_pos = False
            start_time = None
    if in_pos and start_time is not None:
        durations.append((series.index[-1] - start_time).total_seconds())
    if not durations:
        return 0.0
    return float(sum(durations) / len(durations) / 86400.0)


def _extract_metrics_value(metrics_df: pd.DataFrame, keys: set[str]) -> float | None:
    """
    从 quantstats 指标表中提取指定指标数值。
    参数:
        metrics_df: quantstats 输出的指标表。
        keys: 目标指标的规范化名称集合。
    返回:
        指标数值，找不到返回 None。
    """
    if metrics_df is None or metrics_df.empty:
        return None
    for idx in metrics_df.index:
        if _normalize_column(idx) in keys:
            try:
                return float(metrics_df.loc[idx].iloc[0])
            except Exception:
                return None
    return None


def upsert_summary_row(summary_path: Path, row: dict) -> None:
    """
    写入单条汇总数据，存在则覆盖。
    参数:
        summary_path: 汇总 CSV 路径。
        row: 当前 vault 的汇总数据。
    返回:
        无。
    """
    if summary_path.exists():
        try:
            existing = pd.read_csv(summary_path)
        except Exception:
            existing = pd.DataFrame()
    else:
        existing = pd.DataFrame()
    if not existing.empty and "vault_address" in existing.columns:
        existing = existing[existing["vault_address"] != row.get("vault_address")]
    updated = pd.concat([existing, pd.DataFrame([row])], ignore_index=True)
    updated.to_csv(summary_path, index=False)



# === 主流程 ===
def parse_args() -> argparse.Namespace:
    """
    解析命令行参数。
    参数:
        无。
    返回:
        参数命名空间。
    """
    parser = argparse.ArgumentParser(description="vault quantstats 计算工具")
    parser.add_argument("vault_address", nargs="?", default="", help="可选 vault 地址，空则全量处理")
    parser.add_argument(
        "--no-download-prices",
        action="store_true",
        help="缺少价格数据时不自动下载",
    )
    return parser.parse_args()


def main() -> None:
    """
    主流程入口，生成 NAV、收益率与量化指标。
    参数:
        无。
    返回:
        无。
    """
    root_dir = Path(__file__).resolve().parents[2]
    trades_dir = Path(os.getenv("VAULT_TRADES_DIR", root_dir / "vault_trades_data"))
    funding_dir = Path(os.getenv("VAULT_FUNDING_DIR", root_dir / "vault_funding_data"))
    ledger_dir = Path(os.getenv("VAULT_LEDGER_DIR", root_dir / "vault_nonfunding_ledger"))
    price_dir = Path(os.getenv("VAULT_PRICE_DIR", root_dir / "crypto_data"))
    price_interval = os.getenv("VAULT_PRICE_INTERVAL", "1h")
    out_dir = Path(os.getenv("VAULT_QUANTSTAT_DIR", root_dir / "vault_quantstat"))
    vaults_csv = Path(os.getenv("VAULTS_CSV_PATH", root_dir / "VAULTS.csv"))
    args = parse_args()
    target_vault = str(args.vault_address or "").strip().lower()
    download_prices = not bool(args.no_download_prices)
    freq = os.getenv("VAULT_QUANTSTAT_FREQ", "D")
    freq = str(freq).strip().upper() or "D"
    metrics_window = os.getenv("VAULT_QUANTSTAT_WINDOW", "all").strip().lower() or "all"
    out_dir.mkdir(parents=True, exist_ok=True)
    vault_addresses = load_vault_addresses(vaults_csv, "normal")
    create_time_map = load_vault_create_time_map(vaults_csv)

    # Load HL official data from VAULTS.csv (apr/tvl) and vault_hl_pnl/
    hl_pnl_dir = root_dir / "vault_hl_pnl"
    hl_vault_meta: dict[str, dict] = {}
    try:
        vaults_df = pd.read_csv(vaults_csv)
        for _, row in vaults_df.iterrows():
            addr = str(row.get("vaultAddress", "")).strip().lower()
            if not addr:
                continue
            hl_vault_meta[addr] = {
                "apr": row.get("apr") if pd.notna(row.get("apr")) else None,
                "tvl": row.get("tvl") if pd.notna(row.get("tvl")) else None,
            }
    except Exception as exc:
        print(f"[warn] failed reading VAULTS.csv for HL meta: {exc}")

    def _load_hl_pnl(vault_addr: str) -> dict:
        """Load HL official pnl data for a vault."""
        result = {"pnl": None, "account_value": None, "nav_json": None}
        hl_csv = hl_pnl_dir / f"{vault_addr}.csv"
        if not hl_csv.exists():
            return result
        try:
            df = pd.read_csv(hl_csv)
        except Exception:
            return result
        if df.empty:
            return result
        last = df.iloc[-1]
        result["account_value"] = float(last.get("accountValue", 0))
        result["pnl"] = float(last.get("pnl", 0))
        # Build nav_json from accountValueHistory
        nav_points = []
        for _, r in df.iterrows():
            ts = r.get("timestamp")
            av = r.get("accountValue")
            if pd.notna(ts) and pd.notna(av):
                nav_points.append({"timestamp": int(ts), "nav": float(av)})
        if nav_points:
            result["nav_json"] = json.dumps(nav_points, ensure_ascii=True)
        return result

    if target_vault:
        vault_addresses = [addr for addr in vault_addresses if addr == target_vault]
    if not vault_addresses:
        print("[warn] no vaults to process")
        return

    summary_path = root_dir / "vault_quantstat.csv"

    for vault_address in vault_addresses:
        vault_address = str(vault_address).strip().lower()
        trade_path = trades_dir / f"{vault_address}.csv"
        trades_df = load_trades(trade_path)
        if trades_df.empty:
            print(f"[warn] skip {vault_address}, empty trades")
            continue

        funding_path = funding_dir / f"{vault_address}.csv"
        ledger_path = ledger_dir / f"{vault_address}.csv"
        funding_df = load_cashflows(funding_path)
        ledger_df = load_cashflows(ledger_path)
        ledger_events = load_ledger_events(ledger_path)
        follower_count, avg_depositor_hold_days = compute_follower_stats(ledger_events)
        avg_trades_per_day = compute_avg_trades_per_day(trades_df)
        last_trade_at = to_iso_utc(trades_df["time"].max())

        coins = sorted(trades_df["coin"].dropna().unique().tolist())
        create_time = None
        create_time_ms = create_time_map.get(vault_address)
        if create_time_ms:
            create_time = pd.to_datetime(create_time_ms, unit="ms", utc=True).tz_convert(
                _RESAMPLE_TZ
            )

        download_start_ms = None
        if create_time_ms:
            download_start_ms = int(create_time_ms)
        else:
            min_trade_time = trades_df["time"].min()
            if pd.notna(min_trade_time):
                download_start_ms = int(min_trade_time.tz_convert("UTC").timestamp() * 1000)

        if download_prices:
            ensure_price_data(coins, price_dir, price_interval, download_start_ms)

        nav_hourly = build_nav_series(
            trades_df,
            funding_df,
            ledger_df,
            price_dir,
            price_interval,
            create_time,
        )
        if nav_hourly.empty:
            print(f"[warn] skip {vault_address}, empty nav")
            continue

        if create_time is not None:
            nav_hourly = nav_hourly.loc[nav_hourly.index >= create_time]

        nav_hourly = nav_hourly.dropna()
        if nav_hourly.empty:
            print(f"[warn] skip {vault_address}, empty nav after trim")
            continue

        nav_frame = resample_nav_frame(nav_hourly, freq)
        nav_frame = nav_frame.dropna()
        if nav_frame.empty:
            print(f"[warn] skip {vault_address}, empty nav after resample")
            continue

        nav_series = nav_frame["unit_nav"]
        balance_series = nav_frame["nav"]
        returns = compute_returns(nav_series)

        returns_for_metrics = returns.copy()
        if returns_for_metrics.index.tz is not None:
            returns_for_metrics.index = returns_for_metrics.index.tz_localize(None)

        benchmark_returns = build_benchmark_returns(
            price_dir, price_interval, freq, returns_for_metrics.index
        )

        periods_per_year = 365 if _normalize_freq(freq) == "d" else 24 * 365
        metrics_mode = os.getenv("VAULT_QS_METRICS_MODE", "full").strip().lower() or "full"
        try:
            qs.reports.metrics(
                returns_for_metrics,
                display=True,
                mode=metrics_mode,
                periods_per_year=periods_per_year,
            )
        except Exception as exc:
            print(f"[warn] metrics display failed for {vault_address}: {exc}")

        metrics_df = qs.reports.metrics(
            returns_for_metrics,
            display=False,
            mode=metrics_mode,
            periods_per_year=periods_per_year,
        )

        annualized_return = _extract_metrics_value(metrics_df, {"cagr"})
        sharpe = _extract_metrics_value(metrics_df, {"sharpe"})
        mdd = _extract_metrics_value(metrics_df, {"maxdrawdown"})
        win_rate = _extract_metrics_value(metrics_df, {"windays"})
        time_in_market = _extract_metrics_value(metrics_df, {"timeinmarket"})

        if annualized_return is None:
            try:
                annualized_return = float(
                    qs.stats.cagr(returns_for_metrics, periods=periods_per_year)
                )
            except Exception:
                annualized_return = 0.0
        if sharpe is None:
            try:
                sharpe = float(
                    qs.stats.sharpe(
                        returns_for_metrics, periods=periods_per_year, annualize=True
                    )
                )
            except Exception:
                sharpe = 0.0
        if mdd is None:
            mdd = compute_mdd(nav_series)
        if win_rate is None:
            try:
                win_rate = float(qs.stats.win_rate(returns_for_metrics))
            except Exception:
                win_rate = 0.0
        if time_in_market is None:
            time_in_market = 0.0

        avg_hold_days = compute_avg_hold_days(nav_hourly)
        trader_age_hours = 0.0
        if create_time is not None:
            trader_age_hours = (
                pd.Timestamp.now(tz=_RESAMPLE_TZ) - create_time
            ).total_seconds() / 3600.0
        balance = float(balance_series.iloc[-1]) if not balance_series.empty else 0.0

        nav_output = out_dir / f"{vault_address}.nav.csv"
        returns_output = out_dir / f"{vault_address}.returns.csv"
        html_output = out_dir / f"{vault_address}.html"

        nav_out = nav_frame.copy()
        if nav_out.index.tz is not None:
            nav_out.index = nav_out.index.tz_localize(None)
        nav_out.reset_index().to_csv(nav_output, index=False)

        nav_points = []
        for ts, nav_value in nav_out["unit_nav"].items():
            if pd.isna(nav_value):
                continue
            timestamp = ts.to_pydatetime().isoformat()
            nav_points.append({"timestamp": timestamp, "nav": float(nav_value)})
        nav_json = json.dumps(nav_points, ensure_ascii=True)

        returns_out = returns.copy()
        if returns_out.index.tz is not None:
            returns_out.index = returns_out.index.tz_localize(None)
        returns_out.to_frame("return").reset_index().to_csv(returns_output, index=False)

        try:
            bm = benchmark_returns if not benchmark_returns.empty else None
            qs.reports.html(
                returns_for_metrics,
                benchmark=bm,
                output=str(html_output),
                title=f"Vault NAV {vault_address}",
                periods_per_year=periods_per_year,
                match_dates=False,
            )
        except Exception as exc:
            print(f"[warn] html report failed for {vault_address}: {exc}")

        summary_row = {
            "vault_address": vault_address,
            "nav_start": float(nav_series.iloc[0]),
            "nav_end": float(nav_series.iloc[-1]),
            "balance": balance,
            "annualized_return": annualized_return,
            "sharpe": sharpe,
            "mdd": mdd,
            "win_rate": win_rate,
            "time_in_market": time_in_market,
            "avg_hold_days": avg_hold_days,
            "trader_age_hours": trader_age_hours,
            "follower_count": follower_count,
            "avg_depositor_hold_days": avg_depositor_hold_days,
            "avg_trades_per_day": avg_trades_per_day,
            "freq": freq,
            "metrics_mode": metrics_mode,
            "metrics_window": metrics_window,
            "last_trade_at": last_trade_at,
            "nav_json": nav_json,
        }

        # Add HL official metrics
        meta = hl_vault_meta.get(vault_address, {})
        hl_pnl_data = _load_hl_pnl(vault_address)
        summary_row["hl_apr"] = meta.get("apr")
        summary_row["hl_tvl"] = meta.get("tvl")
        summary_row["hl_all_time_pnl"] = hl_pnl_data["pnl"]
        summary_row["hl_nav_json"] = hl_pnl_data["nav_json"]

        upsert_summary_row(summary_path, summary_row)

        print(
            f"[info] {vault_address} sharpe={sharpe:.3f} mdd={mdd:.2%} "
            f"nav_csv={nav_output} returns_csv={returns_output} html={html_output}"
        )

    print(f"[info] summary saved to {summary_path}")


if __name__ == "__main__":
    main()
