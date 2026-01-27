import { randomUUID } from "crypto";
import { query } from "../db/postgres";
import { log } from "./logger";

export interface SyncRunRecord {
  id: string;
  source: string;
  started_at: string;
  finished_at?: string | null;
  status: string;
  vault_count?: number | null;
  success_count?: number | null;
  failed_vaults?: string[] | null;
  websocket_vaults?: string[] | null;
  note?: string | null;
}

export async function createSyncRun(source: string, vaultCount: number): Promise<SyncRunRecord> {
  const record: SyncRunRecord = {
    id: randomUUID(),
    source,
    started_at: new Date().toISOString(),
    status: "running",
    vault_count: vaultCount,
    success_count: 0,
    failed_vaults: [],
    websocket_vaults: [],
    note: null,
  };

  try {
    await query(
      "insert into sync_runs (id, source, started_at, status, vault_count, success_count, failed_vaults, websocket_vaults, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        record.id,
        record.source,
        record.started_at,
        record.status,
        record.vault_count,
        record.success_count,
        record.failed_vaults,
        record.websocket_vaults,
        record.note,
      ]
    );
  } catch (error) {
    log("error", "sync run insert failed", { message: (error as Error).message });
    throw error;
  }

  return record;
}

export async function completeSyncRun(
  id: string,
  updates: Partial<SyncRunRecord>
): Promise<void> {
  const finishedAt = updates.finished_at ?? new Date().toISOString();
  const fields: string[] = ["finished_at"]; 
  const values: any[] = [finishedAt];

  const assign = (key: keyof SyncRunRecord, value: unknown) => {
    if (value === undefined) return;
    fields.push(String(key));
    values.push(value);
  };

  assign("status", updates.status);
  assign("source", updates.source);
  assign("vault_count", updates.vault_count);
  assign("success_count", updates.success_count);
  assign("failed_vaults", updates.failed_vaults);
  assign("websocket_vaults", updates.websocket_vaults);
  assign("note", updates.note);

  const setClause = fields
    .map((field, index) => `${field} = $${index + 2}`)
    .join(", ");

  try {
    await query(`update sync_runs set ${setClause} where id = $1`, [id, ...values]);
  } catch (error) {
    log("error", "sync run update failed", { message: (error as Error).message, id });
    throw error;
  }
}

export async function attachWebsocketVaults(vaultAddresses: string[]): Promise<void> {
  if (vaultAddresses.length === 0) return;
  try {
    const { rows } = await query("select id from sync_runs order by started_at desc limit 1");
    const latest = rows?.[0]?.id as string | undefined;
    if (!latest) return;
    await query("update sync_runs set websocket_vaults = $2 where id = $1", [latest, vaultAddresses]);
  } catch (error) {
    log("warn", "sync run websocket vaults update failed", { message: (error as Error).message });
  }
}
