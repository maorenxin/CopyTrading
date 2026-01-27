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
import { getLatestVaultLedgerUtcTime, upsertVaultLedger } from "./vault-repository";

// === 类型 ===
interface LedgerDelta {
  type?: string;
  usdc?: string;
  requestedUsd?: string;
  commission?: string;
}

interface LedgerEntry {
  time?: number;
  hash?: string;
  delta?: LedgerDelta | string;
  delta_type?: string;
  type?: string;
}

interface LedgerOutput {
  generatedAt: string;
  user: string;
  updates: LedgerEntry[];
}

// === CSV结构 ===
const LEDGER_COLUMNS = [
  "vault_address",
  "time",
  "hash",
  "ledge_type",
  "usdc",
  "commission",
];

// === 数据整理 ===
/**
 * 将账本更新转换为 CSV 行。
 * @param entries - 账本更新数组。
 * @param vaultAddress - vault 地址。
 * @returns CSV 行对象数组。
 */
function buildCsvRows(entries: LedgerEntry[], vaultAddress: string) {
  return entries.map((entry) => {
    const delta = parseJsonMaybe(entry?.delta) as LedgerDelta;
    const ledgeType = String(delta?.type ?? entry?.delta_type ?? entry?.type ?? "");
    const requestedUsd = delta?.requestedUsd ?? null;
    const usdcValue = ledgeType === "vaultWithdraw" ? requestedUsd : delta?.usdc ?? null;
    const signedUsdc =
      ledgeType === "vaultWithdraw" && usdcValue !== null
        ? typeof usdcValue === "number"
          ? -usdcValue
          : `-${usdcValue}`
        : usdcValue;
    return {
      vault_address: vaultAddress,
      time: entry?.time ?? null,
      hash: entry?.hash ?? null,
      ledge_type: ledgeType || null,
      usdc: signedUsdc ?? null,
      commission: delta?.commission ?? null,
    };
  });
}

/**
 * 归一化账本接口响应为数组。
 * @param result - 接口响应原始数据。
 * @returns 账本更新数组。
 */
function normalizeLedgerResponse(result: any): LedgerEntry[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.updates)) return result.updates;
  return [];
}

// === 抓取逻辑 ===
/**
 * 以时间窗拆分方式抓取非 funding 账本更新。
 * @param user - 用户地址。
 * @param options - 时间范围与窗口大小。
 * @returns 账本输出结果。
 */
export async function scrapeUserNonFundingLedgerHistory(
  user: string,
  options: { startTime: number; endTime: number; windowMs: number },
): Promise<LedgerOutput> {
  const client = new HyperliquidClient();
  const { startTime, endTime, windowMs } = options;
  const retry = Number(process.env.VAULT_LEDGER_RETRY ?? 2);
  const retryDelayMs = Number(process.env.VAULT_LEDGER_RETRY_DELAY_MS ?? 500);
  const delayMs = Number(process.env.VAULT_LEDGER_DELAY_MS ?? 200);
  const rateLimitDelayMs = Number(process.env.VAULT_LEDGER_RATE_LIMIT_DELAY_MS ?? 1500);
  const batchLimit = Number(process.env.VAULT_LEDGER_BATCH_LIMIT ?? 2000);
  const minWindowMs = Number(process.env.VAULT_LEDGER_MIN_WINDOW_MS ?? 60 * 1000);
  const maxSplitDepth = Number(process.env.VAULT_LEDGER_MAX_SPLIT_DEPTH ?? 8);

  /**
   * 获取时间窗内的账本更新。
   * @param windowStart - 窗口起始时间戳。
   * @param windowEnd - 窗口结束时间戳。
   * @returns 账本更新数组。
   */
  const fetchLedgerWindow = async (windowStart: number, windowEnd: number) => {
    const result = await client.fetchUserNonFundingLedgerUpdates(
      user,
      windowStart,
      windowEnd,
      true,
    );
    return normalizeLedgerResponse(result);
  };

  const updates = await scrapeByWindow<LedgerEntry>({
    startTime,
    endTime,
    windowMs,
    fetchWindow: fetchLedgerWindow,
    label: "ledger",
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
    updates,
  };
}

/**
 * 针对指定 vault 抓取非 funding 账本并写入 CSV。
 * @param vaultAddress - vault 地址。
 * @param options - 可选的时间与输出参数。
 * @returns 抓取完成的异步结果。
 */
export async function scrapeUserNonFundingLedgerForVault(
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
  const outputDir =
    options.outputDir || process.env.VAULT_NONFUNDING_OUTPUT_DIR || "vault_nonfunding_ledger";
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

  const latestDbTime = await getLatestVaultLedgerUtcTime(normalizedAddress);
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
      : Number(process.env.VAULT_LEDGER_WINDOW_MS ?? 7 * 24 * 60 * 60 * 1000);

  log("info", "user non-funding ledger scrape start", {
    vaultAddress: normalizedAddress,
    createTimeMillis: baseStartTime ?? null,
    resumeFromTime: latestDbTime ?? null,
  });

  const output = await scrapeUserNonFundingLedgerHistory(normalizedAddress, {
    startTime,
    endTime,
    windowMs,
  });
  const rows = buildCsvRows(output.updates, normalizedAddress);
  await appendCsvRows(csvPath, rows, { columns: LEDGER_COLUMNS });
  const dbRows = rows.map((row) => ({
    vaultAddress: normalizedAddress,
    utcTime: toIso(row.time),
    timestamp: toChinaTimestamp(row.time),
    txHash: row.hash ?? undefined,
    ledgerType: row.ledge_type ?? undefined,
    usdc: toNumber(row.usdc),
    commission: toNumber(row.commission),
  }));
  if (dbRows.length > 0) {
    await upsertVaultLedger(dbRows);
  }
  log("info", "user non-funding ledger written", {
    vaultAddress: normalizedAddress,
    csvPath,
    count: rows.length,
  });
}

// === 命令行入口 ===
/**
 * 从 VAULTS.csv 读取 vault 并抓取非 funding 账本数据。
 * @returns 抓取完成的异步结果。
 */
async function run() {
  const minTvl = Number(process.env.VAULTS_TVL_MIN ?? 1000);
  const limit = Number(process.env.VAULTS_LEDGER_LIMIT ?? -1);
  const relationshipType = process.env.VAULTS_RELATIONSHIP_TYPE ?? "normal";
  const outputDir = process.env.VAULT_NONFUNDING_OUTPUT_DIR || "vault_nonfunding_ledger";
  const dbTargets = await loadVaultAddressesFromDb(minTvl, limit, relationshipType);
  const targets = dbTargets.length
    ? dbTargets
    : await loadVaultAddressesFromCsv(minTvl, limit, relationshipType);
  if (targets.length === 0) {
    log("warn", "no vaults matched tvl filter", { minTvl, relationshipType });
    return;
  }

  for (const target of targets) {
    await scrapeUserNonFundingLedgerForVault(target.vaultAddress, {
      createTimeMillis: target.createTimeMillis,
      outputDir,
    });
  }
}

if (require.main === module) {
  run().catch((error) => {
    log("error", "user non-funding ledger failed", { message: (error as Error).message });
    process.exitCode = 1;
  });
}
