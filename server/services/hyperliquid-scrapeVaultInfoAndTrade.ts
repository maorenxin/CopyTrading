import { log } from "./logger";
import * as Papa from "papaparse";
import { HyperliquidClient } from "./hyperliquid-client";
import * as path from "path";
import {
  appendCsvRows,
  findVaultEntryByAddress,
  loadVaultAddressesFromCsv,
  readLatestTimeFromCsv,
  scrapeByWindow,
} from "./hyperliquid-utils";

// === 类型 ===
interface VaultInfoEntry {
  vaultAddress: string;
  leader?: string;
  details: any | null;
  error?: string;
}

interface VaultInfoOutput {
  generatedAt: string;
  vaults: VaultInfoEntry[];
}

interface VaultTradeEntry {
  time?: number;
  coin?: string;
  side?: string;
  dir?: string;
  px?: string;
  sz?: string;
  startPosition?: string;
  closedPnl?: string;
  fee?: string;
  feeToken?: string;
  hash?: string;
  oid?: string;
  tid?: string;
  crossed?: boolean;
  twapId?: string;
}

interface VaultTradeOutput {
  generatedAt: string;
  vaultAddress: string;
  trades: VaultTradeEntry[];
}

// === 客户端工具 ===
/**
 * 创建 Hyperliquid 客户端实例。
 * @returns 客户端实例。
 */
function createClient() {
  return new HyperliquidClient();
}

// === Vault 信息抓取 ===
/**
 * 将 vault 信息转换为 CSV 行。
 * @param entries - vault 信息列表。
 * @returns CSV 行对象数组。
 */
function buildCsvRows(entries: VaultInfoEntry[]) {
  return entries.map((entry) => {
    const details = entry.details ?? {};
    return {
      vault_address: entry.vaultAddress,
      vault_name: details?.name ?? null,
      leader: entry.leader ?? details?.leader ?? null,
      description: details?.description ?? null,
    };
  });
}

/**
 * 批量抓取 vault 详情信息。
 * @param addresses - vault 地址列表。
 * @returns vault 信息输出。
 */
export async function scrapeVaultInfos(addresses: string[]): Promise<VaultInfoOutput> {
  const client = createClient();
  const concurrency = Number(process.env.VAULT_INFO_CONCURRENCY ?? 4);
  const results: VaultInfoEntry[] = new Array(addresses.length);
  let index = 0;

  /**
   * 循环拉取 vault 详情的工作函数。
   * @returns 工作函数完成的异步结果。
   */
  const worker = async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= addresses.length) break;
      const vaultAddress = addresses[current];
      try {
        const details = await client.fetchVaultDetails(vaultAddress, true);
        const leader =
          details && typeof details === "object" && "leader" in details
            ? (details.leader as string | undefined)
            : undefined;
        results[current] = { vaultAddress, leader, details };
        if ((current + 1) % 50 === 0 || current === addresses.length - 1) {
          log("info", "vault info progress", { current: current + 1, total: addresses.length });
        }
      } catch (error) {
        const message = (error as Error).message;
        results[current] = { vaultAddress, details: null, error: message };
        log("warn", "vault info failed", { vaultAddress, message });
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);

  return {
    generatedAt: new Date().toISOString(),
    vaults: results.filter(Boolean),
  };
}

/**
 * 从 stats 接口拉取全部 vault 并抓取详情信息。
 * @returns vault 信息输出。
 */
export async function scrapeAllVaultInfos(): Promise<VaultInfoOutput> {
  const client = createClient();
  const stats = await client.fetchVaultsFromStats();
  const vaults = Array.isArray(stats.vaults) ? stats.vaults : [];
  const addresses = vaults
    .map(
      (item: any) =>
        item?.vaultAddress ?? item?.vault_address ?? item?.address ?? item?.summary?.vaultAddress,
    )
    .filter(Boolean);
  const uniqueAddresses = Array.from(new Set(addresses));
  const limit = Number(process.env.VAULT_INFO_LIMIT ?? 0);
  const target = limit > 0 ? uniqueAddresses.slice(0, limit) : uniqueAddresses;
  return scrapeVaultInfos(target);
}

// === Vault 信息输出 ===
/**
 * 输出 vault 信息到 JSON 和 CSV。
 * @param output - vault 信息输出。
 * @returns 写入完成的异步结果。
 */
export async function writeVaultInfoOutputs(output: VaultInfoOutput): Promise<void> {
  const jsonPath = process.env.VAULT_INFO_OUTPUT || "vault-info.json";
  const csvPath = process.env.VAULT_INFO_CSV_OUTPUT || "vault-info.csv";
  const allTimeAccountPath =
    process.env.VAULT_INFO_ACCOUNT_VALUE_CSV_OUTPUT ||
    "vaults.details.portfolio.allTime.accountValueHistory.csv";
  const allTimePnlPath =
    process.env.VAULT_INFO_PNL_CSV_OUTPUT || "vaults.details.portfolio.allTime.pnlHistory.csv";
  const fs = await import("fs/promises");
  await fs.writeFile(jsonPath, JSON.stringify(output, null, 2), "utf-8");
  const csvRows = buildCsvRows(output.vaults);
  const csv = Papa.unparse(csvRows);
  await fs.writeFile(csvPath, csv, "utf-8");

  const accountValueRows: Array<{ vault_address: string; timestamp: number; value: string }> = [];
  const pnlRows: Array<{ vault_address: string; timestamp: number; value: string }> = [];

  output.vaults.forEach((entry) => {
    const details = entry.details ?? {};
    const portfolio = Array.isArray(details?.portfolio) ? details.portfolio : [];
    const allTime = portfolio.find((item: any) => Array.isArray(item) && item[0] === "allTime");
    const data = allTime?.[1] ?? {};
    const accountHistory = Array.isArray(data?.accountValueHistory) ? data.accountValueHistory : [];
    const pnlHistory = Array.isArray(data?.pnlHistory) ? data.pnlHistory : [];

    accountHistory.forEach((point: any) => {
      if (!Array.isArray(point) || point.length < 2) return;
      accountValueRows.push({
        vault_address: entry.vaultAddress,
        timestamp: Number(point[0]),
        value: String(point[1]),
      });
    });

    pnlHistory.forEach((point: any) => {
      if (!Array.isArray(point) || point.length < 2) return;
      pnlRows.push({
        vault_address: entry.vaultAddress,
        timestamp: Number(point[0]),
        value: String(point[1]),
      });
    });
  });

  const accountCsv = Papa.unparse(accountValueRows);
  const pnlCsv = Papa.unparse(pnlRows);
  await fs.writeFile(allTimeAccountPath, accountCsv, "utf-8");
  await fs.writeFile(allTimePnlPath, pnlCsv, "utf-8");

  log("info", "vault info outputs written", {
    jsonPath,
    csvPath,
    allTimeAccountPath,
    allTimePnlPath,
    count: output.vaults.length,
  });
}

// === 交易抓取 ===
const TRADE_COLUMNS = [
  "vault_address",
  "time",
  "coin",
  "side",
  "dir",
  "px",
  "sz",
  "start_position",
  "closed_pnl",
  "fee",
  "fee_token",
  "hash",
  "oid",
  "tid",
  "crossed",
  "twap_id",
];

/**
 * 基于 tid/hash/组合键去重交易。
 * @param trades - 原始交易数组。
 * @returns 去重后的交易数组。
 */
function dedupeTrades(trades: VaultTradeEntry[]) {
  const seen = new Set<string>();
  const unique: VaultTradeEntry[] = [];
  trades.forEach((trade) => {
    const key =
      trade?.tid ??
      trade?.hash ??
      `${trade?.time ?? ""}-${trade?.oid ?? ""}-${trade?.coin ?? ""}-${trade?.px ?? ""}-${trade?.sz ?? ""}`;
    if (seen.has(String(key))) return;
    seen.add(String(key));
    unique.push(trade);
  });
  return unique;
}

/**
 * 获取 vault 交易 CSV 路径。
 * @param vaultAddress - vault 地址。
 * @returns CSV 路径。
 */
function resolveVaultTradeCsvPath(vaultAddress: string) {
  const outputDir = process.env.VAULT_TX_OUTPUT_DIR || "vault_trades_data";
  const csvPath = process.env.VAULT_TX_CSV_OUTPUT || path.join(outputDir, `${vaultAddress}.csv`);
  return csvPath;
}

/**
 * 以时间窗方式抓取 vault 交易历史。
 * @param vaultAddress - vault 地址。
 * @param options - 时间范围与窗口大小。
 * @returns 交易历史输出。
 */
export async function scrapeVaultTradeHistory(
  vaultAddress: string,
  options: { startTime: number; endTime: number; windowMs: number },
): Promise<VaultTradeOutput> {
  const client = createClient();
  const { startTime, endTime, windowMs } = options;
  const retry = Number(process.env.VAULT_TX_RETRY ?? 10);
  const retryDelayMs = Number(process.env.VAULT_TX_RETRY_DELAY_MS ?? 500);
  const delayMs = Number(process.env.VAULT_TX_DELAY_MS ?? 200);
  const rateLimitDelayMs = Number(process.env.VAULT_TX_RATE_LIMIT_DELAY_MS ?? 1500);
  const batchLimit = Number(process.env.VAULT_TX_BATCH_LIMIT ?? 2000);
  const minWindowMs = Number(process.env.VAULT_TX_MIN_WINDOW_MS ?? 60 * 1000);
  const maxSplitDepth = Number(process.env.VAULT_TX_MAX_SPLIT_DEPTH ?? 8);

  /**
   * 获取时间窗内的交易明细。
   * @param windowStart - 窗口起始时间戳。
   * @param windowEnd - 窗口结束时间戳。
   * @returns 交易明细数组。
   */
  const fetchTradeWindow = async (windowStart: number, windowEnd: number) => {
    const result = await client.fetchUserFillsByTime(vaultAddress, windowStart, windowEnd, false, true);
    return Array.isArray(result) ? (result as VaultTradeEntry[]) : [];
  };

  const trades = await scrapeByWindow<VaultTradeEntry>({
    startTime,
    endTime,
    windowMs,
    fetchWindow: fetchTradeWindow,
    label: "trade",
    retry,
    retryDelayMs,
    delayMs,
    rateLimitDelayMs,
    batchLimit,
    minWindowMs,
    maxSplitDepth,
    logContext: { vaultAddress },
  });

  const unique = dedupeTrades(trades);
  return {
    generatedAt: new Date().toISOString(),
    vaultAddress,
    trades: unique,
  };
}

/**
 * 追加写入交易 CSV。
 * @param output - 交易输出数据。
 * @returns 写入完成的异步结果。
 */
export async function writeVaultTradeOutputs(output: VaultTradeOutput): Promise<void> {
  const csvPath = resolveVaultTradeCsvPath(output.vaultAddress);
  const rows = output.trades.map((trade) => ({
    vault_address: output.vaultAddress,
    time: trade?.time ?? null,
    coin: trade?.coin ?? null,
    side: trade?.side ?? null,
    dir: trade?.dir ?? null,
    px: trade?.px ?? null,
    sz: trade?.sz ?? null,
    start_position: trade?.startPosition ?? null,
    closed_pnl: trade?.closedPnl ?? null,
    fee: trade?.fee ?? null,
    fee_token: trade?.feeToken ?? null,
    hash: trade?.hash ?? null,
    oid: trade?.oid ?? null,
    tid: trade?.tid ?? null,
    crossed: trade?.crossed ?? null,
    twap_id: trade?.twapId ?? null,
  }));
  await appendCsvRows(csvPath, rows, { columns: TRADE_COLUMNS });
  log("info", "vault trade outputs written", { csvPath, count: output.trades.length });
}

/**
 * 针对指定 vault 抓取交易并写入 CSV。
 * @param vaultAddress - vault 地址。
 * @param options - 可选的时间与输出参数。
 * @returns 抓取完成的异步结果。
 */
export async function scrapeVaultTradesForAddress(
  vaultAddress: string,
  options: {
    startTime?: number;
    endTime?: number;
    windowMs?: number;
    createTimeMillis?: number;
    csvPath?: string;
  } = {},
): Promise<void> {
  const normalizedAddress = vaultAddress.toLowerCase();
  const csvPath = options.csvPath || resolveVaultTradeCsvPath(normalizedAddress);
  let baseStartTime = options.createTimeMillis;
  if (typeof baseStartTime !== "number" || !Number.isFinite(baseStartTime)) {
    const entry = await findVaultEntryByAddress(normalizedAddress);
    baseStartTime = entry?.createTimeMillis;
  }
  if (typeof baseStartTime !== "number" || !Number.isFinite(baseStartTime)) {
    baseStartTime = Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;
  }

  const latestTradeTime = await readLatestTimeFromCsv(csvPath, "time");
  const startTime =
    typeof options.startTime === "number"
      ? options.startTime
      : typeof latestTradeTime === "number" && latestTradeTime >= baseStartTime
        ? latestTradeTime + 1
        : baseStartTime;
  const endTime = typeof options.endTime === "number" ? options.endTime : Number(Date.now());
  const windowMs =
    typeof options.windowMs === "number" ? options.windowMs : Number(7 * 24 * 60 * 60 * 1000);

  log("info", "vault trade scrape start", {
    vaultAddress: normalizedAddress,
    createTimeMillis: baseStartTime ?? null,
    resumeFromTime: latestTradeTime ?? null,
  });

  const trades = await scrapeVaultTradeHistory(normalizedAddress, { startTime, endTime, windowMs });
  await writeVaultTradeOutputs(trades);
}

// === 命令行入口 ===
/**
 * 从 VAULTS.csv 读取 vault 并抓取交易数据。
 * @returns 抓取完成的异步结果。
 */
async function run() {
  const minTvl = Number(process.env.VAULTS_TVL_MIN ?? 5000);
  const limit = Number(process.env.VAULTS_TRADE_LIMIT ?? -1);
  const relationshipType = process.env.VAULTS_RELATIONSHIP_TYPE ?? "normal";
  const targets = await loadVaultAddressesFromCsv(minTvl, limit, relationshipType);
  if (targets.length === 0) {
    log("warn", "no vaults matched tvl filter", { minTvl, relationshipType });
    return;
  }

  for (const target of targets) {
    await scrapeVaultTradesForAddress(target.vaultAddress, {
      createTimeMillis: target.createTimeMillis,
    });
  }
}

if (require.main === module) {
  run().catch((error) => {
    log("error", "vault info scrape failed", { message: (error as Error).message });
    process.exitCode = 1;
  });
}
