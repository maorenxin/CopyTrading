import * as fs from "fs";
import * as path from "path";
import { HyperliquidClient } from "../server/services/hyperliquid-client";
import {
  loadVaultAddressesFromCsv,
  readLatestTimeFromCsv,
  appendCsvRows,
  scrapeByWindow,
  sleep,
  parseJsonMaybe,
} from "../server/services/hyperliquid-utils";
import { log } from "../server/services/logger";

// === 常量 ===
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const BATCH_LIMIT = 500;
const MIN_WINDOW_MS = 60 * 1000;
const MAX_SPLIT_DEPTH = 8;
const RETRY = 10;
const DELAY_MS = 200;
const RETRY_DELAY_MS = 500;
const RATE_LIMIT_DELAY_MS = 1500;
const VAULT_SLEEP_MS = Number(process.env.VAULT_SLEEP_MS || 500);

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

const LEDGER_COLUMNS = [
  "vault_address",
  "time",
  "hash",
  "ledge_type",
  "usdc",
  "commission",
];

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
  [key: string]: unknown;
}

interface LedgerDelta {
  type?: string;
  usdc?: string;
}

interface LedgerEntry {
  time?: number;
  hash?: string;
  delta?: LedgerDelta | string;
  [key: string]: unknown;
}

// === 工具函数 ===
function isOldFundingFormat(csvPath: string): boolean {
  if (!fs.existsSync(csvPath)) return false;
  const head = fs.readFileSync(csvPath, "utf-8").split("\n")[0] ?? "";
  // 旧格式: "time,USDC" (2列，无 vault_address)
  return !head.includes("vault_address");
}

function isOldLedgerFormat(csvPath: string): boolean {
  if (!fs.existsSync(csvPath)) return false;
  const head = fs.readFileSync(csvPath, "utf-8").split("\n")[0] ?? "";
  // 旧格式: "time,ledgerType,USDC" (3列，无 vault_address)
  return !head.includes("vault_address");
}

function normalizeFundingResponse(result: any): FundingEntry[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.funding)) return result.funding;
  return [];
}

// === Funding 抓取 ===
async function scrapeFunding(
  client: HyperliquidClient,
  vaultAddress: string,
  createTimeMillis: number | undefined,
  outDir: string,
): Promise<void> {
  const addr = vaultAddress.toLowerCase();
  const csvPath = path.join(outDir, `${addr}.csv`);

  if (isOldFundingFormat(csvPath)) {
    log("warn", "old funding format detected, deleting for re-scrape", { vaultAddress: addr });
    fs.unlinkSync(csvPath);
  }

  let baseStartTime = createTimeMillis;
  if (typeof baseStartTime !== "number" || !Number.isFinite(baseStartTime)) {
    baseStartTime = Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;
  }

  const latestTime = await readLatestTimeFromCsv(csvPath, "time");
  const startTime =
    typeof latestTime === "number" && latestTime >= baseStartTime
      ? latestTime + 1
      : baseStartTime;
  const endTime = Date.now();

  if (startTime >= endTime) return;

  log("info", "funding scrape start", { vaultAddress: addr, startTime, endTime });

  const entries = await scrapeByWindow<FundingEntry>({
    startTime,
    endTime,
    windowMs: WINDOW_MS,
    fetchWindow: async (wStart, wEnd) => {
      const result = await client.fetchUserFunding(addr, wStart, wEnd, true);
      return normalizeFundingResponse(result);
    },
    label: "funding",
    retry: RETRY,
    retryDelayMs: RETRY_DELAY_MS,
    delayMs: DELAY_MS,
    rateLimitDelayMs: RATE_LIMIT_DELAY_MS,
    batchLimit: BATCH_LIMIT,
    minWindowMs: MIN_WINDOW_MS,
    maxSplitDepth: MAX_SPLIT_DEPTH,
    logContext: { vaultAddress: addr },
  });

  if (entries.length === 0) {
    log("info", "funding scrape done (no new data)", { vaultAddress: addr });
    return;
  }

  const rows = entries.map((entry) => {
    const delta = parseJsonMaybe(entry?.delta) as FundingDelta;
    return {
      vault_address: addr,
      time: entry?.time ?? null,
      type: delta?.type ?? entry?.type ?? null,
      coin: delta?.coin ?? null,
      usdc: delta?.usdc ?? null,
      szi: delta?.szi ?? null,
      fundingRate: delta?.fundingRate ?? null,
      nSamples: delta?.nSamples ?? null,
    };
  });

  await appendCsvRows(csvPath, rows, { columns: FUNDING_COLUMNS });
  log("info", "funding scrape done", { vaultAddress: addr, count: rows.length });
}

// === Ledger 抓取 ===
async function scrapeLedger(
  client: HyperliquidClient,
  vaultAddress: string,
  createTimeMillis: number | undefined,
  outDir: string,
): Promise<void> {
  const addr = vaultAddress.toLowerCase();
  const csvPath = path.join(outDir, `${addr}.csv`);

  if (isOldLedgerFormat(csvPath)) {
    log("warn", "old ledger format detected, deleting for re-scrape", { vaultAddress: addr });
    fs.unlinkSync(csvPath);
  }

  let baseStartTime = createTimeMillis;
  if (typeof baseStartTime !== "number" || !Number.isFinite(baseStartTime)) {
    baseStartTime = Date.now() - 3 * 365 * 24 * 60 * 60 * 1000;
  }

  const latestTime = await readLatestTimeFromCsv(csvPath, "time");
  const startTime =
    typeof latestTime === "number" && latestTime >= baseStartTime
      ? latestTime + 1
      : baseStartTime;
  const endTime = Date.now();

  if (startTime >= endTime) return;

  log("info", "ledger scrape start", { vaultAddress: addr, startTime, endTime });

  const entries = await scrapeByWindow<LedgerEntry>({
    startTime,
    endTime,
    windowMs: WINDOW_MS,
    fetchWindow: async (wStart, wEnd) => {
      const result = await client.fetchUserNonFundingLedgerUpdates(addr, wStart, wEnd, true);
      return Array.isArray(result) ? result : [];
    },
    label: "ledger",
    retry: RETRY,
    retryDelayMs: RETRY_DELAY_MS,
    delayMs: DELAY_MS,
    rateLimitDelayMs: RATE_LIMIT_DELAY_MS,
    batchLimit: BATCH_LIMIT,
    minWindowMs: MIN_WINDOW_MS,
    maxSplitDepth: MAX_SPLIT_DEPTH,
    logContext: { vaultAddress: addr },
  });

  if (entries.length === 0) {
    log("info", "ledger scrape done (no new data)", { vaultAddress: addr });
    return;
  }

  const rows = entries.map((entry) => {
    const delta = parseJsonMaybe(entry?.delta) as LedgerDelta;
    return {
      vault_address: addr,
      time: entry?.time ?? null,
      hash: entry?.hash ?? null,
      ledge_type: delta?.type ?? null,
      usdc: delta?.usdc ?? null,
      commission: null,
    };
  });

  await appendCsvRows(csvPath, rows, { columns: LEDGER_COLUMNS });
  log("info", "ledger scrape done", { vaultAddress: addr, count: rows.length });
}

// === 主逻辑 ===
async function main() {
  const minTvl = Number(process.env.VAULTS_TVL_MIN ?? 1000);
  const targets = await loadVaultAddressesFromCsv(minTvl, -1, "normal");
  if (targets.length === 0) {
    log("warn", "no vaults found", {});
    return;
  }

  const fundingDir = path.resolve("vault_funding_data");
  const ledgerDir = path.resolve("vault_nonfunding_ledger");
  fs.mkdirSync(fundingDir, { recursive: true });
  fs.mkdirSync(ledgerDir, { recursive: true });

  const client = new HyperliquidClient();
  log("info", `scraping cashflows for ${targets.length} vaults`, {});

  for (const target of targets) {
    try {
      await scrapeFunding(client, target.vaultAddress, target.createTimeMillis, fundingDir);
    } catch (err: any) {
      log("error", "funding scrape failed", {
        vaultAddress: target.vaultAddress,
        message: err.message,
      });
    }
    try {
      await scrapeLedger(client, target.vaultAddress, target.createTimeMillis, ledgerDir);
    } catch (err: any) {
      log("error", "ledger scrape failed", {
        vaultAddress: target.vaultAddress,
        message: err.message,
      });
    }
    await sleep(VAULT_SLEEP_MS);
  }

  log("info", "all cashflows done", {});
}

main().catch((err) => {
  log("error", "scrape-cashflows fatal", { message: (err as Error).message });
  process.exitCode = 1;
});
