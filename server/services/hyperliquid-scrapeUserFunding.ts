import { HyperliquidClient } from "./hyperliquid-client";
import { log } from "./logger";
import * as path from "path";
import {
  appendCsvRows,
  toChinaTimestamp,
  toIso,
  toNumber,
  findVaultEntryByAddress,
  findVaultEntryByAddressFromDb,
  loadVaultAddressesFromCsv,
  loadVaultAddressesFromDb,
  parseJsonMaybe,
  scrapeByWindow,
} from "./hyperliquid-utils";
import { getLatestVaultFundingUtcTime, upsertVaultFunding } from "./vault-repository";

// === 类型 ===
interface FundingDelta {
  type?: string;
  coin?: string;
  usdc?: string;
  szi?: string;
  fundingRate?: string;
  nSamples?: number;
}

interface FundingEntry {
  time?: number;
  hash?: string;
  delta?: FundingDelta | string;
  type?: string;
}

interface FundingOutput {
  generatedAt: string;
  user: string;
  funding: FundingEntry[];
}

// === CSV结构 ===
const FUNDING_COLUMNS = [
  "vault_address",
  "time",
  "type",
  "coin",
  "usdc",
  "szi",
  "fundingRate",
  "nSamples",
];

// === 数据整理 ===
/**
 * 将 funding 明细转换为 CSV 行。
 * @param entries - funding 明细数组。
 * @param vaultAddress - vault 地址。
 * @returns CSV 行对象数组。
 */
function buildCsvRows(entries: FundingEntry[], vaultAddress: string) {
  return entries.map((entry) => {
    const delta = parseJsonMaybe(entry?.delta) as FundingDelta;
    return {
      vault_address: vaultAddress,
      time: entry?.time ?? null,
      type: delta?.type ?? entry?.type ?? null,
      coin: delta?.coin ?? null,
      usdc: delta?.usdc ?? null,
      szi: delta?.szi ?? null,
      fundingRate: delta?.fundingRate ?? null,
      nSamples: delta?.nSamples ?? null,
    };
  });
}

/**
 * 归一化 funding 接口响应为数组。
 * @param result - 接口响应原始数据。
 * @returns funding 明细数组。
 */
function normalizeFundingResponse(result: any): FundingEntry[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.funding)) return result.funding;
  return [];
}

// === 抓取逻辑 ===
/**
 * 以时间窗拆分方式抓取 funding 历史。
 * @param user - 用户地址。
 * @param options - 时间范围与窗口大小。
 * @returns funding 输出结果。
 */
export async function scrapeUserFundingHistory(
  user: string,
  options: { startTime: number; endTime: number; windowMs: number },
): Promise<FundingOutput> {
  const client = new HyperliquidClient();
  const { startTime, endTime, windowMs } = options;
  const retry = Number(process.env.VAULT_FUNDING_RETRY ?? 10);
  const retryDelayMs = Number(process.env.VAULT_FUNDING_RETRY_DELAY_MS ?? 500);
  const delayMs = Number(process.env.VAULT_FUNDING_DELAY_MS ?? 200);
  const rateLimitDelayMs = Number(process.env.VAULT_FUNDING_RATE_LIMIT_DELAY_MS ?? 1500);
  const batchLimit = Number(process.env.VAULT_FUNDING_BATCH_LIMIT ?? 500);
  const minWindowMs = Number(process.env.VAULT_FUNDING_MIN_WINDOW_MS ?? 60 * 1000);
  const maxSplitDepth = Number(process.env.VAULT_FUNDING_MAX_SPLIT_DEPTH ?? 8);

  /**
   * 获取时间窗内的 funding 明细。
   * @param windowStart - 窗口起始时间戳。
   * @param windowEnd - 窗口结束时间戳。
   * @returns funding 明细数组。
   */
  const fetchFundingWindow = async (windowStart: number, windowEnd: number) => {
    const result = await client.fetchUserFunding(user, windowStart, windowEnd, true);
    return normalizeFundingResponse(result);
  };

  const funding = await scrapeByWindow<FundingEntry>({
    startTime,
    endTime,
    windowMs,
    fetchWindow: fetchFundingWindow,
    label: "funding",
    retry,
    retryDelayMs,
    delayMs,
    rateLimitDelayMs,
    batchLimit,
    minWindowMs,
    maxSplitDepth,
    logContext: { user },
  });

  return {
    generatedAt: new Date().toISOString(),
    user,
    funding,
  };
}

/**
 * 针对指定 vault 抓取 funding 并写入 CSV。
 * @param vaultAddress - vault 地址。
 * @param options - 可选的时间与输出参数。
 * @returns 抓取完成的异步结果。
 */
export async function scrapeUserFundingForVault(
  vaultAddress: string,
  options: {
    startTime?: number;
    endTime?: number;
    windowMs?: number;
    createTimeMillis?: number;
    outputDir?: string;
  } = {},
): Promise<void> {
  const normalizedAddress = vaultAddress.toLowerCase();
  const outputDir = options.outputDir || process.env.VAULT_FUNDING_OUTPUT_DIR || "vault_funding_data";
  const csvPath = path.join(outputDir, `${normalizedAddress}.csv`);
  let baseStartTime = options.createTimeMillis;
  if (typeof baseStartTime !== "number" || !Number.isFinite(baseStartTime)) {
    const entry =
      (await findVaultEntryByAddressFromDb(normalizedAddress)) ??
      (await findVaultEntryByAddress(normalizedAddress));
    baseStartTime = entry?.createTimeMillis;
  }
  if (typeof baseStartTime !== "number" || !Number.isFinite(baseStartTime)) {
    baseStartTime = Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;
  }

  const latestDbTime = await getLatestVaultFundingUtcTime(normalizedAddress);
  const startTime =
    typeof options.startTime === "number"
      ? options.startTime
      : typeof latestDbTime === "number" && latestDbTime >= baseStartTime
        ? latestDbTime + 1
        : baseStartTime;
  const endTime = typeof options.endTime === "number" ? options.endTime : Number(Date.now());
  const windowMs =
    typeof options.windowMs === "number"
      ? options.windowMs
      : Number(process.env.VAULT_FUNDING_WINDOW_MS ?? 7 * 24 * 60 * 60 * 1000);

  log("info", "user funding scrape start", {
    vaultAddress: normalizedAddress,
    createTimeMillis: baseStartTime ?? null,
    resumeFromTime: latestDbTime ?? null,
  });

  const output = await scrapeUserFundingHistory(normalizedAddress, { startTime, endTime, windowMs });
  const rows = buildCsvRows(output.funding, normalizedAddress);
  await appendCsvRows(csvPath, rows, { columns: FUNDING_COLUMNS });
  const dbRows = rows.map((row) => ({
    vaultAddress: normalizedAddress,
    utcTime: toIso(row.time),
    timestamp: toChinaTimestamp(row.time),
    entryType: row.type ?? undefined,
    coin: row.coin ?? undefined,
    usdc: toNumber(row.usdc),
    szi: toNumber(row.szi),
    fundingRate: toNumber(row.fundingRate),
    nSamples: toNumber(row.nSamples),
  }));
  if (dbRows.length > 0) {
    await upsertVaultFunding(dbRows);
  }
  log("info", "user funding written", { vaultAddress: normalizedAddress, csvPath, count: rows.length });
}

// === 命令行入口 ===
/**
 * 从 VAULTS.csv 读取 vault 并抓取 funding 数据。
 * @returns 抓取完成的异步结果。
 */
async function run() {
  const minTvl = Number(process.env.VAULTS_TVL_MIN ?? 1000);
  const limit = Number(process.env.VAULTS_FUNDING_LIMIT ?? -1);
  const relationshipType = process.env.VAULTS_RELATIONSHIP_TYPE ?? "normal";
  const outputDir = process.env.VAULT_FUNDING_OUTPUT_DIR || "vault_funding_data";
  const dbTargets = await loadVaultAddressesFromDb(minTvl, limit, relationshipType);
  const targets = dbTargets.length
    ? dbTargets
    : await loadVaultAddressesFromCsv(minTvl, limit, relationshipType);
  if (targets.length === 0) {
    log("warn", "no vaults matched tvl filter", { minTvl, relationshipType });
    return;
  }

  for (const target of targets) {
    await scrapeUserFundingForVault(target.vaultAddress, {
      createTimeMillis: target.createTimeMillis,
      outputDir,
    });
  }
}

if (require.main === module) {
  run().catch((error) => {
    log("error", "user funding failed", { message: (error as Error).message });
    process.exitCode = 1;
  });
}
