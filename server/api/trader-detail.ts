import type { RouteDefinition } from './router';
import { query } from '../db/postgres';
import { loadLocalVaultTrades } from '../services/local-vault-data';

/**
 * 规范化时间窗口参数。
 * @param value - 原始窗口值。
 * @returns 标准化窗口字符串。
 */
const normalizeWindow = (value?: string) => {
  if (!value) return 'all';
  const lower = value.toLowerCase();
  if (['7d', '30d', '90d', 'all'].includes(lower)) return lower;
  return 'all';
};

/**
 * 将输入转换为数值。
 * @param value - 输入值。
 * @param fallback - 无效时的默认值。
 * @returns 转换后的数值。
 */
const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * 根据成交记录构建净值曲线。
 * @param trades - 成交记录列表。
 * @returns 净值点数组。
 */
function buildEquitySeries(trades: Array<{ timestamp: string; pnl: number }>) {
  const points: Array<{ timestamp: string; vault_equity: number; btc_equity: number }> = [];
  let cumulative = 0;

  // 按时间排序计算累计 PnL
  const sorted = trades
    .filter((trade) => trade.timestamp)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  sorted.forEach((trade) => {
    cumulative += toNumber(trade.pnl, 0);
    points.push({
      timestamp: trade.timestamp,
      vault_equity: Math.round(cumulative * 100) / 100,
      btc_equity: 0,
    });
  });

  return points;
}

/**
 * 将 nav_json 转换为净值曲线点。
 * @param navJson - 数据库存储的 nav JSON。
 * @returns 净值点数组。
 */
function buildNavSeries(navJson: unknown) {
  if (!navJson) return [];
  const raw = typeof navJson === 'string' ? safeParseJson(navJson) : navJson;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point) => {
      if (!point) return null;
      const timestamp = point.timestamp ?? point.time ?? point.date;
      const nav = point.nav ?? point.value ?? point.vault_equity;
      if (!timestamp || nav === undefined || nav === null) return null;
      return {
        timestamp: String(timestamp),
        vault_equity: Number(nav),
        btc_equity: 0,
      };
    })
    .filter(Boolean) as Array<{ timestamp: string; vault_equity: number; btc_equity: number }>;
}

/**
 * 安全解析 JSON 字符串。
 * @param value - 原始 JSON 字符串。
 * @returns 解析结果或 null。
 */
function safeParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * 读取 crypto_data_1h 表字段信息。
 * @returns 字段映射或 null。
 */
async function getCryptoDataColumns(): Promise<{
  timeColumn: string;
  timeIsNumeric: boolean;
  priceColumn: string;
  symbolColumn?: string;
} | null> {
  const { rows } = await query(
    `select column_name, data_type
     from information_schema.columns
     where table_name = 'crypto_data_1h' and table_schema = 'public'`,
  );
  if (!rows || rows.length === 0) return null;

  const columnSet = new Map<string, string>();
  rows.forEach((row: any) => {
    if (row?.column_name) {
      columnSet.set(String(row.column_name), String(row.data_type ?? ''));
    }
  });

  const pickColumn = (candidates: string[]) => candidates.find((name) => columnSet.has(name));

  const timeColumn = pickColumn(['time', 'timestamp', 'utc_time', 'datetime']) ?? '';
  const priceColumn = pickColumn(['close', 'price', 'close_price', 'c']) ?? '';
  if (!timeColumn || !priceColumn) return null;

  const dataType = columnSet.get(timeColumn) ?? '';
  const timeIsNumeric = ['integer', 'bigint', 'numeric', 'double precision', 'real'].includes(dataType);
  const symbolColumn = pickColumn(['symbol', 'coin', 'asset']);

  return {
    timeColumn,
    timeIsNumeric,
    priceColumn,
    symbolColumn: symbolColumn ?? undefined,
  };
}

/**
 * 获取 BTC 小时级别价格序列。
 * @param from - 起始时间（毫秒）。
 * @param to - 结束时间（毫秒）。
 * @returns 价格点数组。
 */
async function fetchBtcSeries(from: number, to: number) {
  const columns = await getCryptoDataColumns();
  if (!columns) return [] as Array<{ timestamp: number; price: number }>;

  const { timeColumn, timeIsNumeric, priceColumn, symbolColumn } = columns;
  const whereParts: string[] = [];
  const params: Array<string | number | Date | string[]> = [];

  if (symbolColumn) {
    params.push(['btc', 'btcusdt', 'btc-perp', 'btc_usdt', 'btc/usdt']);
    whereParts.push(`lower(${symbolColumn}) = any($${params.length})`);
  }

  if (Number.isFinite(from) && Number.isFinite(to)) {
    if (timeIsNumeric) {
      params.push(from, to);
      whereParts.push(`${timeColumn} between $${params.length - 1} and $${params.length}`);
    } else {
      params.push(new Date(from), new Date(to));
      whereParts.push(`${timeColumn} between $${params.length - 1} and $${params.length}`);
    }
  }

  const whereSql = whereParts.length ? `where ${whereParts.join(' and ')}` : '';
  const sql = `select ${timeColumn} as ts, ${priceColumn} as price from crypto_data_1h ${whereSql} order by ${timeColumn} asc`;
  const { rows } = await query(sql, params);

  return (rows ?? [])
    .map((row: any) => {
      const rawTime = row?.ts;
      const rawPrice = row?.price;
      const price = Number(rawPrice);
      let timestamp = timeIsNumeric
        ? Number(rawTime)
        : new Date(String(rawTime)).getTime();
      if (timeIsNumeric && Number.isFinite(timestamp) && timestamp > 0 && timestamp < 1e12) {
        timestamp *= 1000;
      }
      if (!Number.isFinite(timestamp) || !Number.isFinite(price)) return null;
      return { timestamp, price };
    })
    .filter(Boolean) as Array<{ timestamp: number; price: number }>;
}

/**
 * 将 BTC 价格对齐到净值时间点。
 * @param points - 净值点。
 * @param btcSeries - BTC 价格序列。
 * @returns 对齐后的净值点。
 */
function attachBtcSeries(
  points: Array<{ timestamp: string; vault_equity: number; btc_equity: number }>,
  btcSeries: Array<{ timestamp: number; price: number }>,
) {
  if (!points.length || !btcSeries.length) return points;
  const sortedBtc = [...btcSeries].sort((a, b) => a.timestamp - b.timestamp);
  let idx = 0;
  return points.map((point) => {
    const time = new Date(point.timestamp).getTime();
    while (idx < sortedBtc.length - 1 && sortedBtc[idx + 1].timestamp <= time) {
      idx += 1;
    }
    const matched = sortedBtc[idx];
    return {
      ...point,
      btc_equity: Number.isFinite(matched?.price) ? matched.price : point.btc_equity,
    };
  });
}

/**
 * 按窗口过滤净值数据。
 * @param points - 净值点数组。
 * @param window - 时间窗口。
 * @returns 过滤后的净值点数组。
 */
function filterPointsByWindow(
  points: Array<{ timestamp: string; vault_equity: number; btc_equity: number }>,
  window: string,
) {
  const windowDaysMap: Record<string, number> = {
    '7d': 7,
    '30d': 30,
    '90d': 90,
  };
  const days = windowDaysMap[window];
  if (!days) return points;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return points.filter((point) => {
    const time = new Date(point.timestamp).getTime();
    return Number.isFinite(time) && time >= cutoff;
  });
}

/**
 * 查询交易员基础信息。
 * @param traderId - 交易员 ID。
 * @returns 交易员基础信息。
 */
async function getTraderDetail(traderId: string) {
  const { rows } = await query(
    'select id, vault_address, display_name from traders where id = $1',
    [traderId],
  );
  return rows[0] as { id: string; vault_address: string; display_name?: string } | undefined;
}

/**
 * 查询交易员指标数据。
 * @param traderId - 交易员 ID。
 * @param window - 时间窗口。
 * @returns 指标记录。
 */
async function getTraderMetrics(traderId: string, window: string) {
  const { rows } = await query(
    'select * from performance_metrics where trader_id = $1 and window = $2',
    [traderId, window],
  );
  return rows[0] as Record<string, any> | undefined;
}

/**
 * 查询交易员成交记录。
 * @param traderId - 交易员 ID。
 * @param limit - 返回数量。
 * @returns 成交记录列表。
 */
async function getTraderTrades(traderId: string, limit: number) {
  const { rows } = await query(
    `select
        tx_hash as id,
        tx_hash,
        coin,
        side,
        size,
        price,
        pnl,
        coalesce(utc_time, timestamp) as timestamp
     from vault_trades
     where lower(vault_address) = $1
     order by coalesce(utc_time, timestamp) desc nulls last
     limit $2`,
    [String(traderId ?? '').toLowerCase(), limit],
  );
  return rows as Array<Record<string, any>>;
}

/**
 * 处理交易员详情接口。
 * @param request - 路由请求对象。
 * @returns 交易员详情响应。
 */
async function handleTraderDetail(request: unknown) {
  const params = (request as any)?.params ?? {};
  const traderId = params.traderId;

  // 查询基础信息
  const detail = await getTraderDetail(traderId);
  if (!detail) {
    return { id: traderId, address: '', display_name: '', metrics: {}, risk_notice: '' };
  }

  return {
    id: detail.id,
    address: detail.vault_address,
    display_name: detail.display_name ?? '',
    metrics: {},
    risk_notice: '',
  };
}

/**
 * 处理交易员指标接口。
 * @param request - 路由请求对象。
 * @returns 指标响应。
 */
async function handleTraderMetrics(request: unknown) {
  const params = (request as any)?.params ?? {};
  const queryParams = (request as any)?.query ?? {};
  const traderId = params.traderId;
  const window = normalizeWindow(queryParams.window);

  // 查询指标数据
  const metric = await getTraderMetrics(traderId, window);
  if (!metric) {
    return { window };
  }

  return {
    window,
    return_rate: toNumber(metric.return_rate),
    annual_return_rate: toNumber(metric.annual_return_rate),
    sharpe: toNumber(metric.sharpe),
    win_rate: toNumber(metric.win_rate),
    max_drawdown: toNumber(metric.max_drawdown),
    pnl: toNumber(metric.pnl),
  };
}

/**
 * 处理交易员成交记录接口。
 * @param request - 路由请求对象。
 * @returns 成交记录响应。
 */
async function handleTraderTrades(request: unknown) {
  const params = (request as any)?.params ?? {};
  const queryParams = (request as any)?.query ?? {};
  const traderId = params.traderId;
  const limit = Math.min(Number(queryParams.limit ?? 50), 200);

  // 查询成交记录
  const rows = await getTraderTrades(traderId, limit);
  if (rows.length > 0) {
    return { items: rows };
  }
  const localRows = await loadLocalVaultTrades(String(traderId ?? ''), limit);
  return { items: localRows };
}

/**
 * 处理交易员净值曲线接口。
 * @param request - 路由请求对象。
 * @returns 净值曲线响应。
 */
async function handleTraderEquity(request: unknown) {
  const params = (request as any)?.params ?? {};
  const queryParams = (request as any)?.query ?? {};
  const traderId = params.traderId;
  const window = normalizeWindow(queryParams.window);

  // 基于 vault_info.nav_json 输出净值曲线
  const { rows } = await query(
    'select nav_json from vault_info where lower(vault_address) = $1',
    [String(traderId ?? '').toLowerCase()],
  );
  const navJson = rows?.[0]?.nav_json ?? null;
  const points = filterPointsByWindow(buildNavSeries(navJson), window);
  if (points.length === 0) {
    return { window, points };
  }

  const timestamps = points
    .map((point) => new Date(point.timestamp).getTime())
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) {
    return { window, points };
  }
  const from = Math.min(...timestamps);
  const to = Math.max(...timestamps);
  const btcSeries = await fetchBtcSeries(from, to);
  const merged = attachBtcSeries(points, btcSeries);
  return { window, points: merged };
}

export const traderDetailRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/traders/:traderId',
    handler: handleTraderDetail,
  },
  {
    method: 'GET',
    path: '/traders/:traderId/metrics',
    handler: handleTraderMetrics,
  },
  {
    method: 'GET',
    path: '/traders/:traderId/trades',
    handler: handleTraderTrades,
  },
  {
    method: 'GET',
    path: '/traders/:traderId/equity',
    handler: handleTraderEquity,
  },
];
