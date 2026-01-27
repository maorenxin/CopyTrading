import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { query } from "../db/postgres";
import { log } from "./logger";

const DEFAULT_VAULTS_CSV = process.env.VAULTS_CSV_PATH || "VAULTS.csv";
const DEFAULT_TRADES_DIR = process.env.VAULT_TX_OUTPUT_DIR || "vault_trades_data";

async function countCsvRows(filePath: string): Promise<number> {
  if (!fs.existsSync(filePath)) return 0;
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let isHeader = true;
  let count = 0;
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (isHeader) {
      isHeader = false;
      continue;
    }
    count += 1;
  }
  return count;
}

async function countCsvRowsInDir(dirPath: string): Promise<number> {
  if (!fs.existsSync(dirPath)) return 0;
  const entries = await fs.promises.readdir(dirPath);
  const csvFiles = entries.filter((file) => file.endsWith(".csv"));
  let total = 0;
  for (const file of csvFiles) {
    total += await countCsvRows(path.join(dirPath, file));
  }
  return total;
}

async function resolveLatestSyncRunId(): Promise<string | null> {
  const { rows } = await query<{ id: string }>(
    "select id from sync_runs order by started_at desc limit 1"
  );
  return rows?.[0]?.id ?? null;
}

export interface ReconcileSummary {
  id: string;
  sync_run_id: string;
  csv_vaults_count: number | null;
  db_vaults_count: number | null;
  csv_trades_count: number | null;
  db_trades_count: number | null;
  csv_positions_count: number | null;
  db_positions_count: number | null;
  csv_depositors_count: number | null;
  db_depositors_count: number | null;
  diff_vaults_count: number | null;
  diff_trades_count: number | null;
  diff_positions_count: number | null;
  diff_depositors_count: number | null;
}

const diffCount = (left: number | null, right: number | null): number | null => {
  if (left === null || right === null) return null;
  return Math.abs(left - right);
};

export async function buildReconcileSummary(options?: {
  syncRunId?: string;
  vaultsCsvPath?: string;
  tradesDir?: string;
}): Promise<ReconcileSummary | null> {
  const syncRunId = options?.syncRunId ?? (await resolveLatestSyncRunId());
  if (!syncRunId) {
    log("warn", "reconcile summary skipped: no sync run id");
    return null;
  }

  const csvVaultsCount = await countCsvRows(options?.vaultsCsvPath ?? DEFAULT_VAULTS_CSV);
  const csvTradesCount = await countCsvRowsInDir(options?.tradesDir ?? DEFAULT_TRADES_DIR);

  const { rows: vaultRows } = await query<{ count: string }>(
    "select count(*)::text as count from vault_info where last_sync_run_id = $1",
    [syncRunId]
  );
  const { rows: tradeRows } = await query<{ count: string }>(
    "select count(*)::text as count from vault_trades where sync_run_id = $1",
    [syncRunId]
  );
  const { rows: positionRows } = await query<{ count: string }>(
    "select count(*)::text as count from vault_positions where sync_run_id = $1",
    [syncRunId]
  );
  const { rows: depositorRows } = await query<{ count: string }>(
    "select count(*)::text as count from vault_depositors where sync_run_id = $1",
    [syncRunId]
  );

  const dbVaultsCount = Number(vaultRows?.[0]?.count ?? 0);
  const dbTradesCount = Number(tradeRows?.[0]?.count ?? 0);
  const dbPositionsCount = Number(positionRows?.[0]?.count ?? 0);
  const dbDepositorsCount = Number(depositorRows?.[0]?.count ?? 0);

  return {
    id: randomUUID(),
    sync_run_id: syncRunId,
    csv_vaults_count: csvVaultsCount,
    db_vaults_count: dbVaultsCount,
    csv_trades_count: csvTradesCount,
    db_trades_count: dbTradesCount,
    csv_positions_count: null,
    db_positions_count: dbPositionsCount,
    csv_depositors_count: null,
    db_depositors_count: dbDepositorsCount,
    diff_vaults_count: diffCount(csvVaultsCount, dbVaultsCount),
    diff_trades_count: diffCount(csvTradesCount, dbTradesCount),
    diff_positions_count: diffCount(null, dbPositionsCount),
    diff_depositors_count: diffCount(null, dbDepositorsCount),
  };
}

export async function upsertReconcileSummary(summary: ReconcileSummary): Promise<void> {
  const columns = [
    "id",
    "sync_run_id",
    "csv_vaults_count",
    "db_vaults_count",
    "csv_trades_count",
    "db_trades_count",
    "csv_positions_count",
    "db_positions_count",
    "csv_depositors_count",
    "db_depositors_count",
    "diff_vaults_count",
    "diff_trades_count",
    "diff_positions_count",
    "diff_depositors_count",
  ];
  const values = columns.map((column) => (summary as any)[column]);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
  const sql = `insert into reconcile_summaries (${columns.join(",")}) values (${placeholders})
    on conflict (sync_run_id) do update set
      csv_vaults_count = excluded.csv_vaults_count,
      db_vaults_count = excluded.db_vaults_count,
      csv_trades_count = excluded.csv_trades_count,
      db_trades_count = excluded.db_trades_count,
      csv_positions_count = excluded.csv_positions_count,
      db_positions_count = excluded.db_positions_count,
      csv_depositors_count = excluded.csv_depositors_count,
      db_depositors_count = excluded.db_depositors_count,
      diff_vaults_count = excluded.diff_vaults_count,
      diff_trades_count = excluded.diff_trades_count,
      diff_positions_count = excluded.diff_positions_count,
      diff_depositors_count = excluded.diff_depositors_count`;
  await query(sql, values);
}
