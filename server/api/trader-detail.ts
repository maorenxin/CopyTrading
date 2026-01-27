import type { RouteDefinition } from './router';
import { query } from '../db/postgres';

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
  return { items: rows };
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
  return { window, points };
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
