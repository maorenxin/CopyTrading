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
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BATCH_LIMIT = 2000;
const MIN_WINDOW_MS = 60 * 1000;
const MAX_SPLIT_DEPTH = 8;
const RETRY = 10;
const DELAY_MS = 200;
const RETRY_DELAY_MS = 500;
const RATE_LIMIT_DELAY_MS = 1500;
const VAULT_SLEEP_MS = Number(process.env.VAULT_SLEEP_MS || 500);

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

// === 类型 ===
interface TradeEntry {
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
  [key: string]: unknown;
}

// === 工具函数 ===
function isOldFormat(csvPath: string): boolean {
  if (!fs.existsSync(csvPath)) return false;
  const head = fs.readFileSync(csvPath, "utf-8").split("\n")[0] ?? "";
  return !head.includes("vault_address");
}

function dedupeTrades(trades: TradeEntry[]): TradeEntry[] {
  const seen = new Set<string>();
  const unique: TradeEntry[] = [];
  for (const trade of trades) {
    const key =
      trade?.tid ??
      trade?.hash ??
      `${trade?.time ?? ""}-${trade?.oid ?? ""}-${trade?.coin ?? ""}-${trade?.px ?? ""}-${trade?.sz ?? ""}`;
    if (seen.has(String(key))) continue;
    seen.add(String(key));
    unique.push(trade);
  }
  return unique;
}

function buildCsvRows(trades: TradeEntry[], vaultAddress: string) {
  return trades.map((t) => ({
    vault_address: vaultAddress,
    time: t?.time ?? null,
    coin: t?.coin ?? null,
    side: t?.side ?? null,
    dir: t?.dir ?? null,
    px: t?.px ?? null,
    sz: t?.sz ?? null,
    start_position: t?.startPosition ?? null,
    closed_pnl: t?.closedPnl ?? null,
    fee: t?.fee ?? null,
    fee_token: t?.feeToken ?? null,
    hash: t?.hash ?? null,
    oid: t?.oid ?? null,
    tid: t?.tid ?? null,
    crossed: t?.crossed ?? null,
    twap_id: t?.twapId ?? null,
  }));
}

// === 主逻辑 ===
async function scrapeVault(
  client: HyperliquidClient,
  vaultAddress: string,
  createTimeMillis: number | undefined,
  outDir: string,
): Promise<void> {
  const addr = vaultAddress.toLowerCase();
  const csvPath = path.join(outDir, `${addr}.csv`);

  // 检测旧格式 → 删除重爬
  if (isOldFormat(csvPath)) {
    log("warn", "old 7-col format detected, deleting for re-scrape", { vaultAddress: addr });
    fs.unlinkSync(csvPath);
  }

  // 确定起始时间
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

  log("info", "trade scrape start", {
    vaultAddress: addr,
    startTime,
    endTime,
    resumeFrom: latestTime ?? null,
  });

  const trades = await scrapeByWindow<TradeEntry>({
    startTime,
    endTime,
    windowMs: WINDOW_MS,
    fetchWindow: async (wStart, wEnd) => {
      const result = await client.fetchUserFillsByTime(addr, wStart, wEnd, false, true);
      return Array.isArray(result) ? result : [];
    },
    label: "trade",
    retry: RETRY,
    retryDelayMs: RETRY_DELAY_MS,
    delayMs: DELAY_MS,
    rateLimitDelayMs: RATE_LIMIT_DELAY_MS,
    batchLimit: BATCH_LIMIT,
    minWindowMs: MIN_WINDOW_MS,
    maxSplitDepth: MAX_SPLIT_DEPTH,
    logContext: { vaultAddress: addr },
  });

  const unique = dedupeTrades(trades);
  if (unique.length === 0) {
    log("info", "trade scrape done (no new trades)", { vaultAddress: addr });
    return;
  }

  const rows = buildCsvRows(unique, addr);
  await appendCsvRows(csvPath, rows, { columns: TRADE_COLUMNS });
  log("info", "trade scrape done", { vaultAddress: addr, count: unique.length });
}

async function main() {
  const minTvl = Number(process.env.VAULTS_TVL_MIN ?? 1000);
  const targets = await loadVaultAddressesFromCsv(minTvl, -1, "normal");
  if (targets.length === 0) {
    log("warn", "no vaults found", {});
    return;
  }

  const outDir = path.resolve("vault_trades_data");
  fs.mkdirSync(outDir, { recursive: true });

  const client = new HyperliquidClient();
  log("info", `scraping trades for ${targets.length} vaults`, {});

  for (const target of targets) {
    try {
      await scrapeVault(client, target.vaultAddress, target.createTimeMillis, outDir);
    } catch (err: any) {
      log("error", "trade scrape failed", {
        vaultAddress: target.vaultAddress,
        message: err.message,
      });
    }
    await sleep(VAULT_SLEEP_MS);
  }

  log("info", "all trades done", {});
}

main().catch((err) => {
  log("error", "scrape-trades fatal", { message: (err as Error).message });
  process.exitCode = 1;
});
