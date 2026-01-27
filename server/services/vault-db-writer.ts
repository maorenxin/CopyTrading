import { query } from "../db/postgres";
import { log } from "./logger";
import {
  VaultDepositorInput,
  VaultPositionInput,
  VaultTradeInput,
  VaultUpsertInput,
  upsertVaults,
  upsertVaultTrades,
  replaceVaultDepositors,
  replaceVaultPositions,
} from "./vault-repository";
import { completeSyncRun, createSyncRun } from "./sync-run-service";

export interface VaultBatchInput {
  vault: VaultUpsertInput;
  trades?: VaultTradeInput[];
  positions?: VaultPositionInput[];
  depositors?: VaultDepositorInput[];
}

export async function createVaultSyncRun(source: string, vaultCount: number) {
  return createSyncRun(source, vaultCount);
}

export async function finalizeVaultSyncRun(
  syncRunId: string,
  updates: {
    status: string;
    successCount?: number;
    failedVaults?: string[];
    note?: string;
  }
): Promise<void> {
  await completeSyncRun(syncRunId, {
    status: updates.status,
    success_count: updates.successCount ?? 0,
    failed_vaults: updates.failedVaults ?? [],
    note: updates.note ?? null,
  });
}

export async function upsertVaultAddresses(
  vaultAddresses: string[],
  syncRunId: string
): Promise<void> {
  const unique = Array.from(new Set(vaultAddresses.map((addr) => addr.toLowerCase())));
  const inputs: VaultUpsertInput[] = unique.map((vaultAddress) => ({
    vaultAddress,
    lastSyncRunId: syncRunId,
  }));
  await upsertVaults(inputs);
}

export async function applyVaultBatch(
  syncRunId: string,
  batch: VaultBatchInput
): Promise<string | null> {
  const vaultsWithSync: VaultUpsertInput[] = [
    { ...batch.vault, lastSyncRunId: syncRunId },
  ];
  await upsertVaults(vaultsWithSync);
  const vaultAddress = batch.vault.vaultAddress;

  const trades = (batch.trades ?? []).map((trade) => ({
    ...trade,
    vaultAddress,
    syncRunId,
  }));
  const positions = (batch.positions ?? []).map((position) => ({
    ...position,
    vaultAddress,
    syncRunId,
  }));
  const depositors = (batch.depositors ?? []).map((depositor) => ({
    ...depositor,
    vaultAddress,
    syncRunId,
  }));

  await upsertVaultTrades(trades);
  await replaceVaultPositions(vaultAddress, positions, syncRunId);
  await replaceVaultDepositors(vaultAddress, depositors, syncRunId);

  return vaultAddress;
}

export async function touchVaultSyncRun(
  vaultAddresses: string[],
  syncRunId: string
): Promise<void> {
  if (vaultAddresses.length === 0) return;
  const unique = Array.from(new Set(vaultAddresses.map((addr) => addr.toLowerCase())));
  try {
    await query(
      "update vault_info set last_sync_run_id = $2, updated_at = $3 where lower(vault_address) = any($1)",
      [unique, syncRunId, new Date().toISOString()]
    );
  } catch (error) {
    log("warn", "vault sync run touch failed", { message: (error as Error).message });
  }
}
