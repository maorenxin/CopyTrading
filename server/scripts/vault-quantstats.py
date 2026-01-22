#!/usr/bin/env python3
import math
import os
from pathlib import Path

import pandas as pd
import quantstats as qs


# === 基础配置 ===
_TIME_KEYS = {"time", "timestamp", "timems", "timemillis", "time_ms", "ts"}
_RESAMPLE_TZ = os.getenv("VAULT_RESAMPLE_TZ", "Asia/Shanghai")
_COIN_SYMBOL_OVERRIDES = {
    "KSHIB": "1000SHIBUSDT",
}


# === 通用工具 ===
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
def load_vault_addresses(vaults_csv: Path) -> list[str]:
    """
    读取 VAULTS.csv 中的 vault 地址。
    参数:
        vaults_csv: VAULTS.csv 路径。
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
    for name in ["vaultAddress", "vault_address", "vault"]:
        if name in df.columns:
            addr_col = name
            break
    if not addr_col:
        return []
    addrs = (
        df[addr_col]
        .dropna()
        .astype(str)
        .str.strip()
        .str.lower()
        .tolist()
    )
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
    return price_dir / f"{symbol.lower()}_{suffix}.csv"


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
    out["time"] = _to_resample_time_from_ms(time_ms.loc[out.index])
    out["price"] = prices.loc[out.index]
    series = out.set_index("time")["price"].sort_index()
    series = series.resample("h").ffill()
    return series


# === NAV 计算 ===
def build_nav_series(
    trades_df: pd.DataFrame,
    funding_df: pd.DataFrame,
    ledger_df: pd.DataFrame,
    price_dir: Path,
    price_interval: str,
) -> pd.DataFrame:
    """
    构建逐小时 NAV 及过程数据。
    参数:
        trades_df: 成交明细。
        funding_df: funding 现金流。
        ledger_df: 充值/提现现金流。
        price_dir: 价格数据目录。
        price_interval: 价格周期。
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
        print(f"[warn] missing price data for coins: {', '.join(missing)}")
        return pd.DataFrame()

    price_df = pd.concat(price_map, axis=1).sort_index().ffill()
    if price_df.empty:
        return pd.DataFrame()
    start_time = price_df.apply(lambda s: s.first_valid_index()).max()
    if start_time is None or pd.isna(start_time):
        return pd.DataFrame()
    price_df = price_df.loc[price_df.index >= start_time]
    price_df.index = _ensure_resample_tz(price_df.index)
    index = price_df.index

    trade_rows = trades_df.to_dict("records")
    fund_rows = funding_df.to_dict("records") if not funding_df.empty else []
    ledger_rows = ledger_df.to_dict("records") if not ledger_df.empty else []

    trade_idx = 0
    fund_idx = 0
    ledger_idx = 0
    cash = 0.0
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
            cost_basis[coin] = cost_basis.get(coin, 0.0) + px * signed_size + closed_pnl
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

        while ledger_idx < len(ledger_rows) and ledger_rows[ledger_idx]["time"] <= ts:
            row = ledger_rows[ledger_idx]
            ledger_idx += 1
            if prev_ts is not None and row["time"] <= prev_ts:
                continue
            amount = float(row["amount"])
            cash += amount
            ledger_sum += amount

        unrealized = 0.0
        for coin in coins:
            size = positions.get(coin, 0.0)
            if size == 0:
                continue
            avg_entry = cost_basis.get(coin, 0.0) / size
            mark_price = price_df.at[ts, coin]
            if pd.isna(mark_price):
                continue
            unrealized += size * (float(mark_price) - avg_entry)

        nav_rows.append(
            {
                "time": ts,
                "nav": cash + unrealized,
                "cash": cash,
                "deposit_withdraw": ledger_sum,
                "funding": funding_sum,
                "closed_pnl": closed_pnl_sum,
                "fee": fee_sum,
                "unrealized_pnl": unrealized,
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


# === 验证用样本数据 ===
_B150_SAMPLE_NAV = {
    "2025-10-01": 0.00,
    "2025-10-02": 616090.05,
    "2025-10-03": 799747.27,
    "2025-10-04": 843627.78,
    "2025-10-05": 921015.90,
    "2025-10-06": 936666.90,
    "2025-10-07": 941019.35,
    "2025-10-08": 1055026.59,
    "2025-10-09": 1215882.09,
    "2025-10-10": 1296719.34,
    "2025-10-11": 1344127.58,
    "2025-10-12": 1366148.36,
    "2025-10-13": 1565677.76,
    "2025-10-14": 1481774.31,
    "2025-10-15": 1427940.35,
    "2025-10-16": 1461057.11,
    "2025-10-17": 1499373.15,
    "2025-10-18": 1498236.92,
    "2025-10-19": 1465269.99,
    "2025-10-20": 1434167.35,
    "2025-10-21": 1411089.75,
    "2025-10-22": 1470905.61,
    "2025-10-23": 1444073.10,
    "2025-10-24": 1434496.81,
    "2025-10-25": 1438333.48,
    "2025-10-26": 1410401.19,
    "2025-10-27": 1386277.92,
    "2025-10-28": 1347177.02,
    "2025-10-29": 1398629.43,
    "2025-10-30": 1435814.18,
    "2025-10-31": 1427595.67,
    "2025-11-01": 1414312.33,
    "2025-11-02": 1424000.75,
    "2025-11-03": 1466772.71,
    "2025-11-04": 1538008.26,
    "2025-11-05": 1509381.42,
    "2025-11-06": 1568568.43,
    "2025-11-07": 1563790.87,
    "2025-11-08": 1555132.87,
    "2025-11-09": 1524798.32,
    "2025-11-10": 1508182.74,
    "2025-11-11": 1536548.88,
    "2025-11-12": 1567834.59,
    "2025-11-13": 1598723.27,
    "2025-11-14": 1645744.53,
    "2025-11-15": 1640957.82,
    "2025-11-16": 1755345.62,
    "2025-11-17": 1766896.91,
    "2025-11-18": 1958580.83,
    "2025-11-19": 2066871.98,
    "2025-11-20": 2076449.24,
    "2025-11-21": 2117003.28,
    "2025-11-22": 2145033.00,
    "2025-11-23": 2117082.54,
    "2025-11-24": 2140655.31,
    "2025-11-25": 2160180.38,
    "2025-11-26": 2178358.34,
    "2025-11-27": 2114288.09,
    "2025-11-28": 2148669.48,
    "2025-11-29": 2170045.34,
    "2025-11-30": 2159662.25,
    "2025-12-01": 2385237.91,
    "2025-12-02": 2232356.83,
    "2025-12-03": 2180303.87,
    "2025-12-04": 2179857.01,
    "2025-12-05": 2274650.34,
    "2025-12-06": 2249276.57,
    "2025-12-07": 2237383.62,
    "2025-12-08": 2238859.91,
    "2025-12-09": 2125207.84,
    "2025-12-10": 2193656.99,
    "2025-12-11": 2271183.96,
    "2025-12-12": 2257832.93,
    "2025-12-13": 2268121.30,
    "2025-12-14": 2283972.01,
    "2025-12-15": 2355873.78,
    "2025-12-16": 2346708.61,
    "2025-12-17": 2383040.18,
    "2025-12-18": 2440299.14,
    "2025-12-19": 2455132.20,
    "2025-12-20": 2465845.42,
    "2025-12-21": 2474540.68,
    "2025-12-22": 2520194.39,
    "2025-12-23": 2638461.19,
    "2025-12-24": 2767143.16,
    "2025-12-25": 2829908.39,
    "2025-12-26": 2886931.84,
    "2025-12-27": 3015476.67,
    "2025-12-28": 3000654.87,
    "2025-12-29": 3006814.86,
    "2025-12-30": 2972520.36,
    "2025-12-31": 3008215.90,
    "2026-01-01": 2981139.87,
    "2026-01-02": 2901978.64,
    "2026-01-03": 2945034.72,
    "2026-01-04": 3065964.25,
    "2026-01-05": 3280147.66,
    "2026-01-06": 3342106.14,
    "2026-01-07": 3370711.46,
    "2026-01-08": 3339036.37,
    "2026-01-09": 3405061.92,
    "2026-01-10": 3321625.48,
    "2026-01-11": 3370530.00,
    "2026-01-12": 3460623.66,
    "2026-01-13": 3569231.76,
    "2026-01-14": 3899318.53,
    "2026-01-15": 3850354.69,
    "2026-01-16": 3696625.67,
    "2026-01-17": 3733167.29,
}


def validate_b150(nav_series: pd.Series, freq: str):
    """
    用 b150 样本 NAV 做校验。
    参数:
        nav_series: 计算得到的 NAV 序列。
        freq: 汇总频率。
    返回:
        无。
    """
    if nav_series.empty:
        return
    if _normalize_freq(freq) != "d":
        return
    nav_local = nav_series.copy()
    if nav_local.index.tz is not None:
        nav_local.index = nav_local.index.tz_localize(None)
    nav_by_date = nav_local.groupby(nav_local.index.date).last()
    if nav_by_date.empty:
        return

    sample = pd.Series(_B150_SAMPLE_NAV)
    sample.index = pd.to_datetime(sample.index, errors="coerce")
    sample = sample.dropna()
    if sample.empty:
        return

    merged = pd.DataFrame(
        {
            "calc": nav_by_date.reindex(sample.index.date).values,
            "sample": sample.values,
        },
        index=sample.index,
    ).dropna()
    if merged.empty:
        return

    diff = (merged["calc"] - merged["sample"]).abs()
    print(
        f"[info] b150 nav validation count={len(merged)} "
        f"avg_abs_diff={diff.mean():.2f} max_abs_diff={diff.max():.2f}"
    )
    sample_nav = sample.copy()
    sample_nav.index = pd.to_datetime(sample_nav.index, errors="coerce")
    sample_nav = sample_nav.dropna()
    sample_returns = compute_returns(sample_nav)
    sample_sharpe_daily = compute_sharpe(sample_returns, "d", False)
    sample_sharpe_annual = compute_sharpe(sample_returns, "d", True)
    sample_mdd = compute_mdd(sample_nav)
    print(
        f"[info] b150 sample sharpe_daily={sample_sharpe_daily:.3f} "
        f"sharpe_annual={sample_sharpe_annual:.3f} mdd={sample_mdd:.2%}"
    )


# === 主流程 ===
# === 主流程 ===
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
    target_vault = os.getenv("VAULT_TARGET_ADDRESS", "").strip().lower()
    freq = os.getenv("VAULT_QUANTSTAT_FREQ", "D")
    freq = str(freq).strip().upper() or "D"
    annualize_sharpe = str(os.getenv("VAULT_SHARPE_ANNUALIZE", "1")).lower() in {
        "1",
        "true",
        "yes",
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    vault_addresses = load_vault_addresses(vaults_csv)
    create_time_map = load_vault_create_time_map(vaults_csv)
    if target_vault:
        vault_addresses = [addr for addr in vault_addresses if addr == target_vault]
    if not vault_addresses:
        print("[warn] no vaults to process")
        return

    summary_rows = []

    vault_addresses = ['0xb1505ad1a4c7755e0eb236aa2f4327bfc3474768']

    for vault_address in vault_addresses:
        trade_path = trades_dir / f"{vault_address}.csv"
        trades_df = load_trades(trade_path)
        if trades_df.empty:
            print(f"[warn] skip {vault_address}, empty trades")
            summary_rows.append({"vault_address": vault_address})
            continue

        funding_path = funding_dir / f"{vault_address}.csv"
        ledger_path = ledger_dir / f"{vault_address}.csv"
        funding_df = load_cashflows(funding_path)
        ledger_df = load_cashflows(ledger_path)

        nav_hourly = build_nav_series(
            trades_df, funding_df, ledger_df, price_dir, price_interval
        )
        if nav_hourly.empty:
            print(f"[warn] skip {vault_address}, empty nav")
            summary_rows.append({"vault_address": vault_address})
            continue

        create_time_ms = create_time_map.get(vault_address)
        if create_time_ms:
            create_time = pd.to_datetime(create_time_ms, unit="ms", utc=True).tz_convert(
                _RESAMPLE_TZ
            )
            nav_hourly = nav_hourly.loc[nav_hourly.index >= create_time]

        nav_hourly = nav_hourly.dropna()
        if nav_hourly.empty:
            print(f"[warn] skip {vault_address}, empty nav after trim")
            summary_rows.append({"vault_address": vault_address})
            continue

        nav_frame = resample_nav_frame(nav_hourly, freq)
        nav_frame = nav_frame.dropna()
        if nav_frame.empty:
            print(f"[warn] skip {vault_address}, empty nav after resample")
            summary_rows.append({"vault_address": vault_address})
            continue

        nav_series = nav_frame["nav"]
        returns = compute_returns(nav_series)
        sharpe = compute_sharpe(returns, freq, annualize_sharpe)
        mdd = compute_mdd(nav_series)

        nav_output = out_dir / f"{vault_address}.nav.csv"
        returns_output = out_dir / f"{vault_address}.returns.csv"
        html_output = out_dir / f"{vault_address}.html"

        nav_out = nav_frame.copy()
        if nav_out.index.tz is not None:
            nav_out.index = nav_out.index.tz_localize(None)
        nav_out.reset_index().to_csv(nav_output, index=False)

        returns_out = returns.copy()
        if returns_out.index.tz is not None:
            returns_out.index = returns_out.index.tz_localize(None)
        returns_out.to_frame("return").reset_index().to_csv(returns_output, index=False)

        periods_per_year = 365 if _normalize_freq(freq) == "d" else 24 * 365
        try:
            qs.reports.html(
                returns,
                output=str(html_output),
                title=f"Vault NAV {vault_address}",
                periods_per_year=periods_per_year,
            )
        except Exception as exc:
            print(f"[warn] report failed for {vault_address}: {exc}")

        summary_rows.append(
            {
                "vault_address": vault_address,
                "nav_start": float(nav_series.iloc[0]),
                "nav_end": float(nav_series.iloc[-1]),
                "sharpe": sharpe,
                "mdd": mdd,
                "freq": freq,
            }
        )

        print(
            f"[info] {vault_address} sharpe={sharpe:.3f} mdd={mdd:.2%} "
            f"nav_csv={nav_output} returns_csv={returns_output} html={html_output}"
        )

        if vault_address.lower() == "0xb1505ad1a4c7755e0eb236aa2f4327bfc3474768":
            validate_b150(nav_series, freq)

    summary_path = root_dir / "vault_quantstat.csv"
    if summary_rows:
        pd.DataFrame(summary_rows).to_csv(summary_path, index=False)
        print(f"[info] summary saved to {summary_path}")


if __name__ == "__main__":
    main()
