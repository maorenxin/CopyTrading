import { randomUUID } from "crypto";
import { getSupabaseClient } from "./supabase";
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
  const supabase = getSupabaseClient();
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

  const { error } = await supabase.from("sync_runs").insert(record);
  if (error) {
    log("error", "sync run insert failed", { message: error.message });
    throw error;
  }
  return record;
}

export async function completeSyncRun(
  id: string,
  updates: Partial<SyncRunRecord>
): Promise<void> {
  const supabase = getSupabaseClient();
  const payload = {
    ...updates,
    finished_at: updates.finished_at ?? new Date().toISOString(),
  };
  const { error } = await supabase.from("sync_runs").update(payload).eq("id", id);
  if (error) {
    log("error", "sync run update failed", { message: error.message, id });
    throw error;
  }
}

export async function attachWebsocketVaults(vaultAddresses: string[]): Promise<void> {
  if (vaultAddresses.length === 0) return;
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from("sync_runs")
    .select("id")
    .order("started_at", { ascending: false })
    .limit(1);
  const latest = data?.[0]?.id;
  if (!latest) return;
  const { error } = await supabase
    .from("sync_runs")
    .update({ websocket_vaults: vaultAddresses })
    .eq("id", latest);
  if (error) {
    log("warn", "sync run websocket vaults update failed", { message: error.message });
  }
}
