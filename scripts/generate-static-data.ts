import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

// --- Utility functions (from server/api/traders.ts) ---

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const toNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function scoreFromReturn(rate?: number): number {
  if (typeof rate !== 'number') return 3;
  return clamp(rate / 20 + 1, 1, 5);
}

function scoreFromDrawdown(drawdown?: number): number {
  if (typeof drawdown !== 'number') return 3;
  return clamp(5 - drawdown / 10, 1, 5);
}

function scoreFromBalance(balance?: number): number {
  if (typeof balance !== 'number' || balance <= 0) return 3;
  return clamp(Math.log10(balance) / 2, 1, 5);
}

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

function buildPnlDataFromNavJson(navJson: unknown) {
  if (!navJson) return [];
  let raw: unknown;
  if (typeof navJson === 'string') {
    try { raw = JSON.parse(navJson); } catch { return []; }
  } else {
    raw = navJson;
  }
  if (!Array.isArray(raw)) return [];
  const points = raw
    .map((point: any) => {
      if (!point) return null;
      const timestamp = point.timestamp ?? point.time ?? point.date;
      const nav = point.nav ?? point.value ?? point.vault_equity;
      if (!timestamp || nav === undefined || nav === null) return null;
      const timeMs = new Date(String(timestamp)).getTime();
      if (!Number.isFinite(timeMs)) return null;
      return { timestamp: timeMs, pnl: Math.round(Number(nav) * 100) / 100 };
    })
    .filter(Boolean) as Array<{ timestamp: number; pnl: number }>;
  points.sort((a, b) => a.timestamp - b.timestamp);
  // Truncate to last 365 data points
  return points.slice(-365);
}

function buildFallbackPnlSeries(
  navStart?: number,
  navEnd?: number,
  lastTradeAt?: string,
) {
  const startValue = Number.isFinite(navStart) ? navStart! : navEnd ?? 0;
  const endValue = Number.isFinite(navEnd) ? navEnd! : startValue;
  const startTime = lastTradeAt
    ? new Date(lastTradeAt).getTime() - 7 * 24 * 60 * 60 * 1000
    : Date.now() - 7 * 24 * 60 * 60 * 1000;
  const endTime = lastTradeAt ? new Date(lastTradeAt).getTime() : Date.now();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return [];
  return [
    { timestamp: startTime, pnl: Number(startValue) },
    { timestamp: endTime, pnl: Number(endValue) },
  ];
}

// --- Main ---

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

    const metrics = {
      traderAge: scoreFromReturn(traderAgeDays / 30),
      annualReturn: scoreFromReturn(annualizedReturn),
      sharpe: clamp(sharpeRatio || 3, 1, 5),
      maxDrawdown: scoreFromDrawdown(drawdownPercent),
      balance: scoreFromBalance(balance),
    };

    const radarScore = calculateRadarArea([
      metrics.traderAge,
      metrics.annualReturn,
      metrics.sharpe,
      metrics.maxDrawdown,
      metrics.balance,
    ]);

    const navSeries = buildPnlDataFromNavJson(row.nav_json);
    const fallbackSeries = buildFallbackPnlSeries(navStart, navEnd, row.last_trade_at);

    return {
      id: row.vault_address,
      address: row.vault_address,
      rank: 0, // will be set after sorting
      metrics,
      pnlData: navSeries.length ? navSeries : fallbackSeries,
      aiStrategy: { en: '', cn: '' },
      aiTags: { en: [] as string[], cn: [] as string[] },
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
      hyperliquidUrl: `https://app.hyperliquid.xyz/vaults/${row.vault_address}?ref=COPYTRADING`,
    };
  });
}

const csvPath = path.resolve(__dirname, '..', 'vault_quantstat.csv');
const outPath = path.resolve(__dirname, '..', 'public', 'data', 'traders.json');

const csvContent = fs.readFileSync(csvPath, 'utf-8');
const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
const rows = parsed.data as Array<Record<string, any>>;

console.log(`Parsed ${rows.length} rows from CSV`);

const items = buildTraderItems(rows);

// Rank by radarScore descending
items.sort((a, b) => b.radarScore - a.radarScore);
items.forEach((item, index) => {
  item.rank = index + 1;
});

const output = {
  items,
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output));

const sizeMB = (Buffer.byteLength(JSON.stringify(output)) / 1024 / 1024).toFixed(2);
console.log(`Generated ${outPath} (${items.length} traders, ${sizeMB} MB)`);
