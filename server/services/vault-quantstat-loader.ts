import { promises as fs } from "fs";
import Papa from "papaparse";
import { query } from "../db/postgres";
import { log } from "./logger";
import { upsertVaultQuantstatsIntoVaultsInfo, upsertVaultRadarStatsIntoVaultsInfo } from "./vault-repository";

const DEFAULT_CSV_PATH = process.env.VAULT_QUANTSTAT_CSV_OUTPUT || "vault_quantstat.csv";
const BATCH_SIZE = Number(process.env.VAULT_QUANTSTAT_BATCH_SIZE ?? 200);

const AI_TAG_POOL = {
  en: [
    "Trend Following",
    "Low Drawdown",
    "High Sharpe",
    "Risk Managed",
    "Swing Trading",
    "Mean Reversion",
    "Multi-Asset",
    "Low Volatility",
    "Momentum Bias",
    "Stable Returns",
    "High Win Rate",
    "Long Horizon",
  ],
  cn: [
    "趋势跟随",
    "低回撤",
    "高夏普",
    "风控稳健",
    "波段交易",
    "均值回归",
    "多币种",
    "低波动",
    "动量偏好",
    "稳健收益",
    "高胜率",
    "长周期",
  ],
};

interface QuantstatCsvRow {
  vault_address?: string;
  nav_start?: string | number;
  nav_end?: string | number;
  balance?: string | number;
  annualized_return?: string | number;
  sharpe?: string | number;
  mdd?: string | number;
  win_rate?: string | number;
  time_in_market?: string | number;
  avg_hold_days?: string | number;
  trader_age_hours?: string | number;
  follower_count?: string | number;
  avg_depositor_hold_days?: string | number;
  avg_trades_per_day?: string | number;
  freq?: string;
  metrics_mode?: string;
  metrics_window?: string;
  last_trade_at?: string | number;
  nav_json?: string;
}

interface VaultQuantstatUpsertInput {
  vaultAddress: string;
  navStart?: number;
  navEnd?: number;
  balance?: number;
  annualizedReturn?: number;
  sharpe?: number;
  mdd?: number;
  winRate?: number;
  timeInMarket?: number;
  avgHoldDays?: number;
  traderAgeHours?: number;
  followerCount?: number;
  avgDepositorHoldDays?: number;
  avgTradesPerDay?: number;
  freq: string;
  metricsMode: string;
  metricsWindow: string;
  lastTradeAt?: string;
  navJson?: string;
}

const toNumber = (value?: string | number | null) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInteger = (value?: string | number) => {
  const parsed = toNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
};

const toIso = (value?: string | number) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) {
    const date = new Date(parsed);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const normalizeNavJson = (value?: string | unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? JSON.stringify(value) : null;
  }
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  return null;
};

/**
 * 根据排名计算 1-5 分值。
 * @param items - vault 地址与指标值。
 * @param descending - 是否按降序排名（大值更优）。
 * @returns vault 地址到评分的映射。
 */
function buildRankScoreMap(
  items: Array<{ vaultAddress: string; value: number | null }>,
  descending: boolean,
): Map<string, number> {
  const valid = items
    .filter((item) => typeof item.value === "number" && Number.isFinite(item.value))
    .map((item) => ({ vaultAddress: item.vaultAddress, value: item.value as number }));
  valid.sort((a, b) => (descending ? b.value - a.value : a.value - b.value));
  const total = valid.length;
  const result = new Map<string, number>();
  valid.forEach((item, index) => {
    const ratio = total <= 1 ? 1 : 1 - index / (total - 1);
    const score = 1 + ratio * 4;
    result.set(item.vaultAddress, Math.max(1, Math.min(5, score)));
  });
  return result;
}

/**
 * 计算五边形雷达面积（半径按 1-5 归一到 0-1）。
 * @param scores - 五维评分数组。
 * @returns 雷达面积数值。
 */
function calculateRadarArea(scores: number[]): number {
  const sides = 5;
  const angleOffset = -Math.PI / 2;
  const points = scores.map((score, index) => {
    const radius = Math.max(1, Math.min(5, score)) / 5;
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
 * 计算并写入 vault 雷达评分与面积。
 * @returns 写入条数。
 */
export async function recomputeVaultRadarStats(): Promise<number> {
  const { rows } = await query<{
    vault_address: string;
    balance: string | number | null;
    tvl_usdc: string | number | null;
    annualized_return: string | number | null;
    sharpe: string | number | null;
    mdd: string | number | null;
    trader_age_hours: string | number | null;
  }>(
    `select vault_address, balance, tvl_usdc, annualized_return, sharpe, mdd, trader_age_hours
     from vault_info`,
  );
  if (rows.length === 0) return 0;

  const balanceScores = buildRankScoreMap(
    rows.map((row) => ({
      vaultAddress: String(row.vault_address).toLowerCase(),
      value: toNumber(row.balance != null ? row.balance : row.tvl_usdc),
    })),
    true,
  );
  const returnScores = buildRankScoreMap(
    rows.map((row) => ({
      vaultAddress: String(row.vault_address).toLowerCase(),
      value: toNumber(row.annualized_return),
    })),
    true,
  );
  const sharpeScores = buildRankScoreMap(
    rows.map((row) => ({
      vaultAddress: String(row.vault_address).toLowerCase(),
      value: toNumber(row.sharpe),
    })),
    true,
  );
  const mddScores = buildRankScoreMap(
    rows.map((row) => {
      const raw = toNumber(row.mdd);
      return {
        vaultAddress: String(row.vault_address).toLowerCase(),
        value: raw === null ? null : Math.abs(raw),
      };
    }),
    false,
  );
  const ageScores = buildRankScoreMap(
    rows.map((row) => ({
      vaultAddress: String(row.vault_address).toLowerCase(),
      value: toNumber(row.trader_age_hours),
    })),
    true,
  );

  const updates = rows.map((row) => {
    const vaultAddress = String(row.vault_address).toLowerCase();
    const radarBalanceScore = balanceScores.get(vaultAddress) ?? 1;
    const radarReturnScore = returnScores.get(vaultAddress) ?? 1;
    const radarSharpeScore = sharpeScores.get(vaultAddress) ?? 1;
    const radarMddScore = mddScores.get(vaultAddress) ?? 1;
    const radarAgeScore = ageScores.get(vaultAddress) ?? 1;
    const radarArea = calculateRadarArea([
      radarAgeScore,
      radarReturnScore,
      radarSharpeScore,
      radarMddScore,
      radarBalanceScore,
    ]);
    return {
      vaultAddress,
      radarBalanceScore,
      radarReturnScore,
      radarSharpeScore,
      radarMddScore,
      radarAgeScore,
      radarArea,
    };
  });

  return upsertVaultRadarStatsIntoVaultsInfo(updates);
}

/**
 * 为尚未写入的 vault 填充随机 AI 标签。
 * @returns 写入条数。
 */
export async function seedVaultAiTags(): Promise<number> {
  const { rows } = await query<{ vault_address: string }>(
    "select vault_address from vault_info where ai_tags is null",
  );
  if (rows.length === 0) return 0;
  const now = new Date().toISOString();
  const updates = rows.map((row) => {
    const picks = pickRandomTags();
    return {
      vault_address: String(row.vault_address).toLowerCase(),
      ai_tags: JSON.stringify(picks),
      updated_at: now,
    };
  });
  const columns = ["vault_address", "ai_tags", "updated_at"];
  let inserted = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_info", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address) do update set
      ai_tags = excluded.ai_tags,
      updated_at = excluded.updated_at`;
    await query(upsertSql, values);
    inserted += batch.length;
  }
  return inserted;
}

/**
 * 随机抽取 AI 标签组合。
 * @returns 中英文标签集合。
 */
function pickRandomTags() {
  const count = 3 + Math.floor(Math.random() * 3);
  const indices = new Set<number>();
  while (indices.size < count) {
    indices.add(Math.floor(Math.random() * AI_TAG_POOL.en.length));
  }
  const selected = Array.from(indices);
  return {
    en: selected.map((index) => AI_TAG_POOL.en[index]),
    cn: selected.map((index) => AI_TAG_POOL.cn[index]),
  };
}

function buildInsert(table: string, columns: string[], rows: Record<string, any>[]) {
  const values: any[] = [];
  const placeholders = rows.map((row) => {
    const startIndex = values.length;
    columns.forEach((column) => values.push(row[column]));
    const params = columns.map((_, index) => `$${startIndex + index + 1}`);
    return `(${params.join(",")})`;
  });
  const sql = `insert into ${table} (${columns.join(",")}) values ${placeholders.join(",")}`;
  return { sql, values };
}

export async function loadVaultQuantstatsToDb(options?: {
  csvPath?: string;
  syncRunId?: string;
  vaultAddresses?: string[];
  source?: string;
  formulaVersion?: string;
  window?: string;
}): Promise<number> {
  const csvPath = options?.csvPath ?? DEFAULT_CSV_PATH;
  const content = await fs.readFile(csvPath, "utf-8").catch(() => "");
  if (!content.trim()) {
    log("warn", "vault quantstat csv empty", { csvPath });
    return 0;
  }

  const parsed = Papa.parse<QuantstatCsvRow>(content, {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data ?? [];
  if (rows.length === 0) {
    log("warn", "vault quantstat csv has no rows", { csvPath });
    return 0;
  }

  const filterSet =
    options?.vaultAddresses && options.vaultAddresses.length > 0
      ? new Set(options.vaultAddresses.map((addr) => addr.toLowerCase()))
      : null;
  const targetRows = rows.filter((row) => {
    const address = row.vault_address?.toLowerCase();
    if (!address) return false;
    if (filterSet && !filterSet.has(address)) return false;
    return true;
  });

  if (targetRows.length === 0) {
    log("warn", "vault quantstat csv filtered to empty", { csvPath });
    return 0;
  }

  const addresses = Array.from(
    new Set(targetRows.map((row) => String(row.vault_address).toLowerCase()))
  );
  const { rows: vaultRows } = await query<{ vault_address: string }>(
    "select vault_address from vault_info where lower(vault_address) = any($1)",
    [addresses]
  );
  const vaultSet = new Set<string>();
  vaultRows.forEach((row: { vault_address: string }) => {
    vaultSet.add(row.vault_address.toLowerCase());
  });

  const infoPayload = targetRows
    .map((row) => {
      const address = row.vault_address?.toLowerCase();
      if (!address) return null;
      if (!vaultSet.has(address)) return null;
      const metricsWindow =
        row.metrics_window ?? (row as Record<string, any>).metricsWindow ?? "";
      return {
        vaultAddress: address,
        navStart: toNumber(row.nav_start) ?? undefined,
        navEnd: toNumber(row.nav_end) ?? undefined,
        balance: toNumber(row.balance) ?? undefined,
        annualizedReturn: toNumber(row.annualized_return) ?? undefined,
        sharpe: toNumber(row.sharpe) ?? undefined,
        mdd: toNumber(row.mdd) ?? undefined,
        winRate: toNumber(row.win_rate) ?? undefined,
        timeInMarket: toNumber(row.time_in_market) ?? undefined,
        avgHoldDays: toNumber(row.avg_hold_days) ?? undefined,
        traderAgeHours: toNumber(row.trader_age_hours) ?? undefined,
        followerCount: toInteger(row.follower_count) ?? undefined,
        avgDepositorHoldDays: toNumber(row.avg_depositor_hold_days) ?? undefined,
        avgTradesPerDay: toNumber(row.avg_trades_per_day) ?? undefined,
        freq: row.freq ?? "",
        metricsMode: row.metrics_mode ?? "",
        metricsWindow: metricsWindow === null || metricsWindow === undefined ? "" : String(metricsWindow),
        lastTradeAt: toIso(row.last_trade_at) ?? undefined,
        navJson: normalizeNavJson(row.nav_json) ?? undefined,
      };
    })
    .filter(Boolean) as VaultQuantstatUpsertInput[];

  if (infoPayload.length === 0) {
    log("warn", "vault quantstat rows have no matching vaults", { count: targetRows.length });
    return 0;
  }

  const inserted = await upsertVaultQuantstatsIntoVaultsInfo(infoPayload);
  await Promise.all([recomputeVaultRadarStats(), seedVaultAiTags()]);

  return inserted;
}
