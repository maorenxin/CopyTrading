import * as fs from "fs/promises";
import * as path from "path";
import { spawn } from "child_process";
import { query } from "../db/postgres";
import { loadVaultAddressesFromCsv } from "../services/hyperliquid-utils";

interface VaultCounts {
  trades: number;
  funding: number;
  ledger: number;
}

interface VaultMismatch {
  vaultAddress: string;
  csv: VaultCounts;
  db: VaultCounts;
}

const TRADES_DIR = "vault_trades_data";
const FUNDING_DIR = "vault_funding_data";
const LEDGER_DIR = "vault_nonfunding_ledger";
const FIX_LIMIT = Number(process.env.RECONCILE_FIX_LIMIT || 0);

/**
 * 统计 CSV 文件行数（不含表头）。
 * @param filePath - CSV 路径。
 * @returns 行数。
 */
async function countCsvRows(filePath: string): Promise<number> {
  const text = await fs.readFile(filePath, "utf-8").catch(() => null);
  if (!text) return 0;
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length <= 1) return 0;
  return Math.max(0, lines.length - 1);
}

/**
 * 构建 DB 中按 vault 分组的计数映射。
 * @param table - 表名。
 * @returns vault_address 到 count 的映射。
 */
async function loadDbCounts(table: string): Promise<Map<string, number>> {
  const { rows } = await query(
    `select vault_address, count(*)::int as count from ${table} group by vault_address`,
  );
  const map = new Map<string, number>();
  rows.forEach((row) => {
    map.set(String(row.vault_address).toLowerCase(), Number(row.count ?? 0));
  });
  return map;
}

/**
 * 删除 vault 在 DB 中的交易/资金/账本数据。
 * @param vaultAddress - vault 地址。
 */
async function deleteVaultData(vaultAddress: string): Promise<void> {
  const address = vaultAddress.toLowerCase();
  await query(`delete from vault_trades where vault_address = '${address}'`);
  await query(`delete from vault_funding where vault_address = '${address}'`);
  await query(`delete from vault_nonfunding_ledger where vault_address = '${address}'`);
}

/**
 * 清理 vault 的 CSV 文件。
 * @param vaultAddress - vault 地址。
 */
async function removeVaultCsv(vaultAddress: string): Promise<void> {
  const address = vaultAddress.toLowerCase();
  await fs.rm(path.join(TRADES_DIR, `${address}.csv`), { force: true });
  await fs.rm(path.join(FUNDING_DIR, `${address}.csv`), { force: true });
  await fs.rm(path.join(LEDGER_DIR, `${address}.csv`), { force: true });
}

/**
 * 触发单个 vault 的 pipeline 重跑。
 * @param vaultAddress - vault 地址。
 */
async function runPipelineForVault(vaultAddress: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "npx",
      ["ts-node", "--transpile-only", "server/scripts/run-vault-pipeline.ts", vaultAddress],
      { stdio: "inherit", env: { ...process.env } },
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pipeline failed with code ${code ?? "null"}`));
    });
  });
}

/**
 * 执行 CSV/DB 对账并按需修复。
 */
async function run(): Promise<void> {
  const vaults = await loadVaultAddressesFromCsv(0);
  if (vaults.length === 0) {
    console.warn("[warn] no vaults found from VAULTS.csv");
    return;
  }

  const tradeMap = await loadDbCounts("vault_trades");
  const fundingMap = await loadDbCounts("vault_funding");
  const ledgerMap = await loadDbCounts("vault_nonfunding_ledger");

  const mismatches: VaultMismatch[] = [];

  for (const entry of vaults) {
    const address = entry.vaultAddress.toLowerCase();
    const csvTrades = await countCsvRows(path.join(TRADES_DIR, `${address}.csv`));
    const csvFunding = await countCsvRows(path.join(FUNDING_DIR, `${address}.csv`));
    const csvLedger = await countCsvRows(path.join(LEDGER_DIR, `${address}.csv`));
    const dbTrades = tradeMap.get(address) ?? 0;
    const dbFunding = fundingMap.get(address) ?? 0;
    const dbLedger = ledgerMap.get(address) ?? 0;
    if (csvTrades !== dbTrades || csvFunding !== dbFunding || csvLedger !== dbLedger) {
      mismatches.push({
        vaultAddress: address,
        csv: { trades: csvTrades, funding: csvFunding, ledger: csvLedger },
        db: { trades: dbTrades, funding: dbFunding, ledger: dbLedger },
      });
    }
  }

  console.log(`[reconcile] checked=${vaults.length} mismatches=${mismatches.length}`);

  if (mismatches.length === 0) {
    return;
  }

  let fixed = 0;
  for (const item of mismatches) {
    if (FIX_LIMIT > 0 && fixed >= FIX_LIMIT) break;
    console.log("[fix] reset vault", item.vaultAddress, item);
    await deleteVaultData(item.vaultAddress);
    await removeVaultCsv(item.vaultAddress);
    await runPipelineForVault(item.vaultAddress);
    fixed += 1;
  }

  console.log(`[fix] completed ${fixed}/${mismatches.length}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[error] reconcile failed: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
