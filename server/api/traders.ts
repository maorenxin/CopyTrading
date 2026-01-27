import type { RouteDefinition } from './router';
import { query } from '../db/postgres';

type SortKey =
  | 'radarScore'
  | 'sharpe'
  | 'allTimeReturn'
  | 'maxDrawdown'
  | 'winRate'
  | 'traderAge'
  | 'followerCount';

/**
 * 将数值限制在指定范围内。
 * @param value - 原始数值。
 * @param min - 最小值。
 * @param max - 最大值。
 * @returns 截断后的数值。
 */
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/**
 * 将输入转换为数值。
 * @param value - 输入值。
 * @param fallback - 无效时的默认值。
 * @returns 转换后的数值。
 */
const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * 解析评分字段。
 * @param value - 原始字段值。
 * @returns 评分值或 null。
 */
const parseScore = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed > 0 ? parsed : null;
};

/**
 * 解析 AI 标签字段。
 * @param value - 原始字段值。
 * @returns 中英文标签数组。
 */
function parseAiTags(value: unknown) {
  if (!value) return { en: [], cn: [] };
  const raw = typeof value === 'string' ? safeParseJson(value) : value;
  const en = Array.isArray((raw as any)?.en) ? (raw as any).en : [];
  const cn = Array.isArray((raw as any)?.cn) ? (raw as any).cn : [];
  return {
    en: en.filter((item: unknown) => typeof item === 'string'),
    cn: cn.filter((item: unknown) => typeof item === 'string'),
  };
}

/**
 * 将 nav_json 转换为前端曲线点。
 * @param navJson - nav_json 字段。
 * @returns 曲线点数组。
 */
function buildPnlDataFromNavJson(navJson: unknown) {
  if (!navJson) return [];
  const raw = typeof navJson === 'string' ? safeParseJson(navJson) : navJson;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((point) => {
      if (!point) return null;
      const timestamp = (point as any).timestamp ?? (point as any).time ?? (point as any).date;
      const nav = (point as any).nav ?? (point as any).value ?? (point as any).vault_equity;
      if (!timestamp || nav === undefined || nav === null) return null;
      const timeMs = new Date(String(timestamp)).getTime();
      if (!Number.isFinite(timeMs)) return null;
      return { timestamp: timeMs, pnl: Number(nav) };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.timestamp - b.timestamp) as Array<{ timestamp: number; pnl: number }>;
}

/**
 * 安全解析 JSON 字符串。
 * @param value - JSON 字符串。
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
 * 根据收益率计算评分。
 * @param rate - 收益率。
 * @returns 1-5 评分。
 */
function scoreFromReturn(rate?: number): number {
  if (typeof rate !== 'number') return 3;
  return clamp(rate / 20 + 1, 1, 5);
}

/**
 * 根据回撤计算评分。
 * @param drawdown - 回撤百分比。
 * @returns 1-5 评分。
 */
function scoreFromDrawdown(drawdown?: number): number {
  if (typeof drawdown !== 'number') return 3;
  return clamp(5 - drawdown / 10, 1, 5);
}

/**
 * 根据余额计算评分。
 * @param balance - 余额。
 * @returns 1-5 评分。
 */
function scoreFromBalance(balance?: number): number {
  if (typeof balance !== 'number' || balance <= 0) return 3;
  return clamp(Math.log10(balance) / 2, 1, 5);
}

/**
 * 计算雷达图面积。
 * @param scores - 五维评分数组。
 * @returns 雷达面积。
 */
function calculateRadarArea(scores: number[]): number {
  const sides = 5;
  const angleOffset = -Math.PI / 2;
  const points = scores.map((score, index) => {
    const radius = clamp(score, 1, 5) / 5;
    const angle = angleOffset + (index * 2 * Math.PI) / sides;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const next = (i + 1) % points.length;
    sum += points[i].x * points[next].y - points[next].x * points[i].y;
  }
  return Math.abs(sum) / 2;
}

/**
 * 构建交易员列表返回值。
 * @param rows - 数据库行。
 * @returns 交易员列表。
 */
function buildTraderItems(rows: Array<Record<string, any>>) {
  return rows.map((row) => {
    const balance = toNumber(row.balance ?? row.tvl_usdc ?? 0);
    const annualizedReturn = toNumber(row.annualized_return, 0);
    const allTimeReturn = toNumber(row.all_time_return, 0);
    const navStart = toNumber(row.nav_start, 0);
    const navEnd = toNumber(row.nav_end, 0);
    const computedReturn =
      navStart > 0 && navEnd > 0 ? ((navEnd - navStart) / navStart) * 100 : 0;
    const drawdownValue = toNumber(row.mdd ?? row.max_drawdown ?? 0, 0);
    const absDrawdown = Math.abs(drawdownValue);
    const drawdownPercent = absDrawdown <= 1 ? absDrawdown * 100 : absDrawdown;
    const winRateValue = toNumber(row.win_rate ?? 0, 0);
    const winRatePercent = winRateValue > 0 && winRateValue <= 1 ? winRateValue * 100 : winRateValue;
    const timeInMarketValue = toNumber(row.time_in_market ?? 0, 0);
    const timeInMarketPercent =
      timeInMarketValue > 0 && timeInMarketValue <= 1
        ? timeInMarketValue * 100
        : timeInMarketValue;
    const traderAgeHours = toNumber(row.trader_age_hours ?? 0, 0);
    const traderAgeDays = traderAgeHours > 0 ? traderAgeHours / 24 : 0;
    const sharpeRatio = toNumber(row.sharpe ?? 0, 0);
    const radarBalanceScore = parseScore(row.radar_balance_score);
    const radarReturnScore = parseScore(row.radar_return_score);
    const radarSharpeScore = parseScore(row.radar_sharpe_score);
    const radarMddScore = parseScore(row.radar_mdd_score);
    const radarAgeScore = parseScore(row.radar_age_score);

    const metrics = {
      traderAge: radarAgeScore !== null
        ? clamp(radarAgeScore, 1, 5)
        : scoreFromReturn(traderAgeDays / 30),
      annualReturn: radarReturnScore !== null
        ? clamp(radarReturnScore, 1, 5)
        : scoreFromReturn(annualizedReturn),
      sharpe: radarSharpeScore !== null ? clamp(radarSharpeScore, 1, 5) : clamp(sharpeRatio || 3, 1, 5),
      maxDrawdown: radarMddScore !== null ? clamp(radarMddScore, 1, 5) : scoreFromDrawdown(drawdownPercent),
      balance: radarBalanceScore !== null ? clamp(radarBalanceScore, 1, 5) : scoreFromBalance(balance),
    };

    const radarAreaValue = parseScore(row.radar_area);
    const radarScore = radarAreaValue !== null
      ? radarAreaValue
      : calculateRadarArea([
          metrics.traderAge,
          metrics.annualReturn,
          metrics.sharpe,
          metrics.maxDrawdown,
          metrics.balance,
        ]);

    return {
      id: row.vault_address,
      address: row.vault_address,
      rank: toNumber(row.rank, 0),
      metrics,
      pnlData: buildPnlDataFromNavJson(row.nav_json),
      aiStrategy: {
        en: '',
        cn: '',
      },
      aiTags: parseAiTags(row.ai_tags),
      traderAgeDays,
      followerCount: Math.max(0, Math.trunc(toNumber(row.follower_count ?? 0, 0))),
      allTimeReturn: allTimeReturn || computedReturn,
      annualizedReturn,
      sharpeRatio,
      maxDrawdownPercent: drawdownPercent,
      winRatePercent,
      avgTradesPerDay: toNumber(row.avg_trades_per_day ?? 0, 0),
      lastTradeTimestamp: row.last_trade_at ? new Date(row.last_trade_at).getTime() : 0,
      trades: [],
      balance,
      timeInMarketPercent,
      avgHoldDays: toNumber(row.avg_hold_days ?? 0, 0),
      radarScore,
    };
  });
}

/**
 * 获取交易员列表。
 * @param request - 路由请求对象。
 * @returns 交易员列表响应。
 */
async function handleTraders(request: unknown) {
  const queryParams = (request as any)?.query ?? {};
  const sort: SortKey = queryParams.sort ?? 'radarScore';
  const order: 'asc' | 'desc' = queryParams.order === 'asc' ? 'asc' : 'desc';

  // 拉取 vault_info 作为交易员列表数据源
  const { rows } = await query(
    `select
        vault_address,
        name,
        tvl_usdc,
        balance,
        annualized_return,
        all_time_return,
        sharpe,
        max_drawdown,
        mdd,
        win_rate,
        time_in_market,
        avg_hold_days,
        follower_count,
        avg_trades_per_day,
        trader_age_hours,
        nav_json,
        ai_tags,
        radar_balance_score,
        radar_mdd_score,
        radar_sharpe_score,
        radar_return_score,
        radar_age_score,
        radar_area,
        nav_start,
        nav_end,
        last_trade_at,
        row_number() over (order by annualized_return desc nulls last, vault_address asc) as rank
     from vault_info
     limit 200`,
  );

  // 组装响应数据
  const items = buildTraderItems(rows as Array<Record<string, any>>);

  // 排序
  const sortValue = (item: any) => {
    switch (sort) {
      case 'radarScore':
        return item.radarScore;
      case 'sharpe':
        return item.sharpeRatio;
      case 'maxDrawdown':
        return item.maxDrawdownPercent;
      case 'winRate':
        return item.winRatePercent;
      case 'traderAge':
        return item.traderAgeDays;
      case 'followerCount':
        return item.followerCount;
      case 'allTimeReturn':
      default:
        return item.allTimeReturn;
    }
  };

  items.sort((a, b) => {
    const aValue = sortValue(a);
    const bValue = sortValue(b);
    return order === 'asc' ? aValue - bValue : bValue - aValue;
  });

  const rankedByRadar = [...items].sort((a, b) => b.radarScore - a.radarScore);
  rankedByRadar.forEach((item, index) => {
    item.rank = index + 1;
  });

  return { items };
}

export const tradersRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/traders',
    handler: handleTraders,
  },
];
