import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import {
  loadVaultAddressesFromCsv,
  loadVaultAddressesFromDb,
  findVaultEntryByAddressFromDb,
  toNumber,
} from "../services/hyperliquid-utils";
import { HyperliquidClient } from "../services/hyperliquid-client";
import { downloadCryptoPrices } from "../services/crypto-price-downloader";
import { scrapeVaultTradesForAddress } from "../services/hyperliquid-scrapeVaultInfoAndTrade";
import { scrapeUserNonFundingLedgerForVault } from "../services/hyperliquid-scrapeUserNonFundingLedger";
import { scrapeUserFundingForVault } from "../services/hyperliquid-scrapeUserFunding";
import {
  createVaultSyncRun,
  finalizeVaultSyncRun,
  upsertVaultAddresses,
} from "../services/vault-db-writer";
import { loadVaultQuantstatsToDb } from "../services/vault-quantstat-loader";
import { replaceVaultPositions, VaultPositionInput } from "../services/vault-repository";

// === 参数读取 ===
/**
 * 解析环境变量数值。
 * @param value - 环境变量原始值。
 * @param fallback - 默认值。
 * @returns 解析后的数值。
 */
function parseNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * 归一化持仓数据为 vault_positions 结构。
 * @param vaultAddress - Vault 地址。
 * @param raw - 原始持仓响应。
 * @returns 归一化后的持仓数组。
 */
function normalizePositions(vaultAddress: string, raw: any): VaultPositionInput[] {
  const items = raw?.positions ?? raw?.items ?? raw ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => ({
    vaultAddress,
    symbol: item?.symbol ?? item?.coin ?? item?.asset,
    side: item?.side ?? item?.dir ?? item?.type,
    leverage: toNumber(item?.leverage ?? item?.lev),
    quantity: toNumber(item?.quantity ?? item?.sz ?? item?.size),
    entryPrice: toNumber(item?.entryPrice ?? item?.entry_px ?? item?.entry),
    markPrice: toNumber(item?.markPrice ?? item?.mark_px ?? item?.mark),
    positionValue: toNumber(item?.positionValue ?? item?.position_value),
    roePercent: toNumber(item?.roePercent ?? item?.roe),
  }));
}

/**
 * 格式化时间戳为东八区时间。
 * @param timestampMs - 毫秒时间戳。
 * @returns 格式化后的时间字符串。
 */
function formatChinaTime(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return "N/A";
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return formatter.format(new Date(timestampMs));
}

/**
 * 统计 CSV 中的时间范围与条数。
 * @param filePath - CSV 文件路径。
 * @param timeField - 时间列字段名。
 * @param extraField - 可选的附加字段（例如 coin）。
 * @returns 统计结果。
 */
async function scanCsvStats(
  filePath: string,
  timeField: string,
  extraField?: string,
): Promise<{
  count: number;
  minTime?: number;
  maxTime?: number;
  extras?: string[];
}> {
  if (!fs.existsSync(filePath)) {
    return { count: 0 };
  }

  const fileStream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  let isHeader = true;
  let timeIndex = -1;
  let extraIndex = -1;
  let count = 0;
  let minTime: number | undefined;
  let maxTime: number | undefined;
  const extras = new Set<string>();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isHeader) {
      const header = trimmed.split(",");
      timeIndex = header.findIndex((item) => item.trim() === timeField);
      if (extraField) {
        extraIndex = header.findIndex((item) => item.trim() === extraField);
      }
      isHeader = false;
      continue;
    }

    if (timeIndex < 0) continue;
    const parts = trimmed.split(",");
    const timeValue = Number(parts[timeIndex]);
    if (!Number.isFinite(timeValue)) continue;
    count += 1;
    if (minTime === undefined || timeValue < minTime) minTime = timeValue;
    if (maxTime === undefined || timeValue > maxTime) maxTime = timeValue;
    if (extraIndex >= 0 && parts[extraIndex]) {
      extras.add(parts[extraIndex].trim());
    }
  }

  return {
    count,
    minTime,
    maxTime,
    extras: extraField ? Array.from(extras).filter(Boolean).sort() : undefined,
  };
}

/**
 * 输出单个 vault 的数据统计摘要。
 * @param vaultAddress - vault 地址。
 * @returns 输出完成的异步结果。
 */
async function printVaultCsvSummary(vaultAddress: string): Promise<void> {
  const tradesDir = process.env.VAULT_TX_OUTPUT_DIR || "vault_trades_data";
  const ledgerDir = process.env.VAULT_NONFUNDING_OUTPUT_DIR || "vault_nonfunding_ledger";
  const fundingDir = process.env.VAULT_FUNDING_OUTPUT_DIR || "vault_funding_data";

  const tradePath = path.join(tradesDir, `${vaultAddress}.csv`);
  const ledgerPath = path.join(ledgerDir, `${vaultAddress}.csv`);
  const fundingPath = path.join(fundingDir, `${vaultAddress}.csv`);

  const tradeStats = await scanCsvStats(tradePath, "time", "coin");
  const ledgerStats = await scanCsvStats(ledgerPath, "time");
  const fundingStats = await scanCsvStats(fundingPath, "time");

  const tradeStart = tradeStats.minTime ? formatChinaTime(tradeStats.minTime) : "N/A";
  const tradeEnd = tradeStats.maxTime ? formatChinaTime(tradeStats.maxTime) : "N/A";
  const ledgerStart = ledgerStats.minTime ? formatChinaTime(ledgerStats.minTime) : "N/A";
  const ledgerEnd = ledgerStats.maxTime ? formatChinaTime(ledgerStats.maxTime) : "N/A";
  const fundingStart = fundingStats.minTime ? formatChinaTime(fundingStats.minTime) : "N/A";
  const fundingEnd = fundingStats.maxTime ? formatChinaTime(fundingStats.maxTime) : "N/A";
  const coins = tradeStats.extras && tradeStats.extras.length > 0 ? tradeStats.extras.join("|") : "N/A";

  console.log(`[info] vault data summary ${vaultAddress}`);
  console.log(
    `[info] trades count=${tradeStats.count} start=${tradeStart} end=${tradeEnd} coins=${coins}`,
  );
  console.log(
    `[info] ledger count=${ledgerStats.count} start=${ledgerStart} end=${ledgerEnd}`,
  );
  console.log(
    `[info] funding count=${fundingStats.count} start=${fundingStart} end=${fundingEnd}`,
  );
}

/**
 * 根据交易 CSV 中的币种触发价格下载。
 * @param vaultAddress - vault 地址。
 * @returns 下载完成的异步结果。
 */
async function downloadPricesForVault(vaultAddress: string): Promise<void> {
  const tradesDir = process.env.VAULT_TX_OUTPUT_DIR || "vault_trades_data";
  const tradePath = path.join(tradesDir, `${vaultAddress}.csv`);
  const tradeStats = await scanCsvStats(tradePath, "time", "coin");
  const coins = tradeStats.extras ?? [];
  if (coins.length === 0) {
    console.warn(`[warn] no trade coins for ${vaultAddress}`);
    return;
  }

  const priceDir = process.env.VAULT_PRICE_DIR || process.env.CRYPTO_DATA_DIR;
  const interval = process.env.VAULT_PRICE_INTERVAL || process.env.CRYPTO_INTERVAL || "1h";
  const startEnv = process.env.CRYPTO_DATA_START_TIME;
  const forceStart = String(process.env.CRYPTO_FORCE_START_TIME ?? "0") === "1";
  const endEnv = process.env.CRYPTO_DATA_END_TIME;
  const delayEnv = process.env.CRYPTO_DATA_DELAY_MS;

  await downloadCryptoPrices({
    coins,
    outputDir: priceDir,
    interval,
    startTimeMs: forceStart && startEnv ? Number(startEnv) : undefined,
    endTimeMs: endEnv ? Number(endEnv) : undefined,
    delayMs: delayEnv ? Number(delayEnv) : undefined,
  });
}

/**
 * 执行 quantstats 计算。
 * @param vaultAddress - vault 地址。
 * @returns 执行完成的异步结果。
 */
function runQuantstats(vaultAddress: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("python", ["server/scripts/vault-quantstats.py", vaultAddress], {
      stdio: "inherit",
      env: {
        ...process.env,
      },
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`quantstats failed with code ${code ?? "null"}`));
      }
    });
    child.on("error", (error) => reject(error));
  });
}

// === 主流程 ===
/**
 * 依次抓取数据并计算量化指标。
 * @returns 执行完成的异步结果。
 */
async function run(): Promise<void> {
  // 检查命令行参数来确定要处理的vault地址
  const args = process.argv.slice(2);
  const vaultArg = args.length > 0 ? args[0]?.toLowerCase() : null;

  const minTvl = parseNumber(process.env.VAULTS_TVL_MIN, 5000);
  const limit = parseNumber(process.env.VAULTS_LIMIT, -1);
  const randomLimit = parseNumber(process.env.VAULTS_RANDOM_LIMIT, 0);
  const relationshipType = process.env.VAULTS_RELATIONSHIP_TYPE ?? "normal";
  const sleepMs = parseNumber(process.env.PIPELINE_SLEEP_MS, 0);

  let targets: Array<{ vaultAddress: string; createTimeMillis?: number }> = [];

  // 优先使用命令行参数指定的vault地址
  if (vaultArg) {
    const entry = await findVaultEntryByAddressFromDb(vaultArg);
    targets = [{
      vaultAddress: vaultArg,
      createTimeMillis: entry?.createTimeMillis,
    }];
  } else {
    const targetEnv = process.env.VAULTS_TARGETS ?? "";
    const targetList = targetEnv
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);

    if (targetList.length > 0) {
      const resolved = await Promise.all(
        targetList.map(async (vaultAddress) => {
          const entry = await findVaultEntryByAddressFromDb(vaultAddress);
          return {
            vaultAddress,
            createTimeMillis: entry?.createTimeMillis,
          };
        }),
      );
      targets = resolved;
    } else {
      const useRandom = randomLimit > 0;
      const dbTargets = await loadVaultAddressesFromDb(
        minTvl,
        useRandom ? randomLimit : limit,
        relationshipType,
        useRandom,
      );
      targets = dbTargets.length
        ? dbTargets
        : await loadVaultAddressesFromCsv(minTvl, limit, relationshipType);
    }
  }
  if (targets.length === 0) {
    console.warn("[warn] no vaults matched filters");
    return;
  }

  const syncRun = await createVaultSyncRun("pipeline", targets.length);
  await upsertVaultAddresses(
    targets.map((target) => target.vaultAddress),
    syncRun.id
  );

  const client = new HyperliquidClient();
  const failedVaults: string[] = [];
  let successCount = 0;

  for (const target of targets) {
    const vaultAddress = target.vaultAddress.toLowerCase();
    console.log(`[info] pipeline start ${vaultAddress}`);
    let vaultOk = true;

    try {
      await scrapeVaultTradesForAddress(vaultAddress, {
        createTimeMillis: target.createTimeMillis,
      });
    } catch (error) {
      console.warn(`[warn] trade scrape failed ${vaultAddress}: ${(error as Error).message}`);
    }

    try {
      await scrapeUserNonFundingLedgerForVault(vaultAddress, {
        createTimeMillis: target.createTimeMillis,
      });
    } catch (error) {
      console.warn(`[warn] ledger scrape failed ${vaultAddress}: ${(error as Error).message}`);
    }

    try {
      await scrapeUserFundingForVault(vaultAddress, {
        createTimeMillis: target.createTimeMillis,
      });
    } catch (error) {
      console.warn(`[warn] funding scrape failed ${vaultAddress}: ${(error as Error).message}`);
    }

    try {
      const positionData = await client.fetchVaultPositions(vaultAddress);
      const positions = normalizePositions(vaultAddress, positionData).map((position) => ({
        ...position,
        syncRunId: syncRun.id,
      }));
      await replaceVaultPositions(vaultAddress, positions, syncRun.id);
    } catch (error) {
      console.warn(`[warn] positions fetch failed ${vaultAddress}: ${(error as Error).message}`);
    }

    try {
      await downloadPricesForVault(vaultAddress);
    } catch (error) {
      console.warn(`[warn] price download failed ${vaultAddress}: ${(error as Error).message}`);
    }

    try {
      await printVaultCsvSummary(vaultAddress);
    } catch (error) {
      console.warn(`[warn] vault summary failed ${vaultAddress}: ${(error as Error).message}`);
    }

    try {
      await runQuantstats(vaultAddress);
    } catch (error) {
      console.warn(`[warn] quantstats failed ${vaultAddress}: ${(error as Error).message}`);
      vaultOk = false;
    }

    if (vaultOk) {
      try {
        await loadVaultQuantstatsToDb({
          vaultAddresses: [vaultAddress],
          syncRunId: syncRun.id,
        });
        successCount += 1;
      } catch (error) {
        console.warn(
          `[warn] quantstat db load failed ${vaultAddress}: ${(error as Error).message}`
        );
        vaultOk = false;
      }
    }

    if (sleepMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }

    if (!vaultOk) {
      failedVaults.push(vaultAddress);
    }

    console.log(`[info] pipeline done ${vaultAddress}`);
  }

  const status =
    failedVaults.length === 0 ? "success" : successCount > 0 ? "partial" : "failed";
  await finalizeVaultSyncRun(syncRun.id, {
    status,
    successCount,
    failedVaults,
    note: `vaults:${targets.length}, success:${successCount}, failed:${failedVaults.length}`,
  });
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[error] pipeline failed: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
