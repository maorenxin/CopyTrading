import { randomUUID } from "crypto";
import { getSupabaseClient } from "./supabase";
import { log } from "./logger";

export interface VaultUpsertInput {
  vaultAddress: string;
  name?: string;
  managerAddress?: string;
  creatorAddress?: string;
  status?: string;
  description?: string;
  tvlUsdc?: number;
  allTimeReturn?: number;
  annualizedReturn?: number;
  sharpe?: number;
  maxDrawdown?: number;
  lastTradeAt?: string;
  lastWsTradeAt?: string;
}

export interface VaultTradeInput {
  vaultId: string;
  txHash?: string;
  side?: string;
  price?: number;
  size?: number;
  pnl?: number;
  timestamp?: string;
  source?: "sync" | "ws" | "fills";
}

export interface VaultPositionInput {
  vaultId: string;
  symbol?: string;
  side?: string;
  leverage?: number;
  quantity?: number;
  entryPrice?: number;
  markPrice?: number;
  positionValue?: number;
  roePercent?: number;
}

export interface VaultDepositorInput {
  vaultId: string;
  depositorAddress?: string;
  amountUsdc?: number;
  sharePercent?: number;
}

export interface SyncRunInput {
  source: string;
  startedAt: string;
  status: string;
  vaultCount?: number;
  successCount?: number;
  failedVaults?: string[];
  websocketVaults?: string[];
  note?: string;
}

export interface VaultRecord {
  id: string;
  vaultAddress: string;
}

export async function upsertVaults(vaults: VaultUpsertInput[]): Promise<Map<string, VaultRecord>> {
  const supabase = getSupabaseClient();
  const addresses = Array.from(new Set(vaults.map((vault) => vault.vaultAddress)));

  const existingMap = new Map<string, string>();
  if (addresses.length > 0) {
    const { data } = await supabase
      .from("vaults")
      .select("id,vault_address")
      .in("vault_address", addresses);

    (data ?? []).forEach((row: any) => {
      existingMap.set(row.vault_address, row.id);
    });
  }

  const now = new Date().toISOString();
  const payload = vaults.map((vault) => ({
    id: existingMap.get(vault.vaultAddress) ?? randomUUID(),
    vault_address: vault.vaultAddress,
    name: vault.name ?? null,
    manager_address: vault.managerAddress ?? null,
    creator_address: vault.creatorAddress ?? null,
    status: vault.status ?? null,
    description: vault.description ?? null,
    tvl_usdc: vault.tvlUsdc ?? null,
    all_time_return: vault.allTimeReturn ?? null,
    annualized_return: vault.annualizedReturn ?? null,
    sharpe: vault.sharpe ?? null,
    max_drawdown: vault.maxDrawdown ?? null,
    last_trade_at: vault.lastTradeAt ?? null,
    last_ws_trade_at: vault.lastWsTradeAt ?? null,
    updated_at: now,
  }));

  if (payload.length === 0) {
    return new Map();
  }

  const { error } = await supabase.from("vaults").upsert(payload, { onConflict: "vault_address" });
  if (error) {
    log("error", "vaults upsert failed", { message: error.message });
    throw error;
  }

  const result = new Map<string, VaultRecord>();
  payload.forEach((row) => {
    result.set(row.vault_address, { id: row.id, vaultAddress: row.vault_address });
  });
  return result;
}

export async function upsertVaultTrades(trades: VaultTradeInput[]): Promise<void> {
  if (trades.length === 0) return;
  const supabase = getSupabaseClient();
  const payload = trades.map((trade) => ({
    id: randomUUID(),
    vault_id: trade.vaultId,
    tx_hash: trade.txHash ?? randomUUID(),
    side: trade.side ?? null,
    price: trade.price ?? null,
    size: trade.size ?? null,
    pnl: trade.pnl ?? null,
    timestamp: trade.timestamp ?? null,
    source: trade.source ?? "sync",
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("vault_trades")
    .upsert(payload, { onConflict: "vault_id,tx_hash" });

  if (error) {
    log("error", "vault trades upsert failed", { message: error.message });
    throw error;
  }
}

export async function replaceVaultPositions(vaultId: string, positions: VaultPositionInput[]): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from("vault_positions").delete().eq("vault_id", vaultId);

  if (positions.length === 0) return;

  const payload = positions.map((position) => ({
    id: randomUUID(),
    vault_id: vaultId,
    symbol: position.symbol ?? null,
    side: position.side ?? null,
    leverage: position.leverage ?? null,
    quantity: position.quantity ?? null,
    entry_price: position.entryPrice ?? null,
    mark_price: position.markPrice ?? null,
    position_value: position.positionValue ?? null,
    roe_percent: position.roePercent ?? null,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("vault_positions").insert(payload);
  if (error) {
    log("error", "vault positions insert failed", { message: error.message });
    throw error;
  }
}

export async function replaceVaultDepositors(vaultId: string, depositors: VaultDepositorInput[]): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from("vault_depositors").delete().eq("vault_id", vaultId);

  if (depositors.length === 0) return;

  const payload = depositors.map((depositor) => ({
    id: randomUUID(),
    vault_id: vaultId,
    depositor_address: depositor.depositorAddress ?? null,
    amount_usdc: depositor.amountUsdc ?? null,
    share_percent: depositor.sharePercent ?? null,
    synced_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("vault_depositors").insert(payload);
  if (error) {
    log("error", "vault depositors insert failed", { message: error.message });
    throw error;
  }
}

export async function updateVaultWsTradeTime(vaultId: string, timestamp?: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("vaults")
    .update({ last_ws_trade_at: timestamp ?? new Date().toISOString() })
    .eq("id", vaultId);
  if (error) {
    log("error", "vault ws trade time update failed", { message: error.message });
  }
}

export async function listVaults(limit = 200, cursor?: string) {
  const supabase = getSupabaseClient();
  let query = supabase.from("vaults").select("*").order("annualized_return", { ascending: false });
  if (cursor) {
    query = query.gt("vault_address", cursor);
  }
  const { data, error } = await query.limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getVaultById(vaultId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("vaults").select("*").eq("id", vaultId).single();
  if (error) throw error;
  return data;
}

export async function listVaultTrades(vaultId: string, limit = 200) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("vault_trades")
    .select("*")
    .eq("vault_id", vaultId)
    .order("timestamp", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listVaultPositions(vaultId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("vault_positions").select("*").eq("vault_id", vaultId);
  if (error) throw error;
  return data ?? [];
}

export async function listVaultDepositors(vaultId: string) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("vault_depositors").select("*").eq("vault_id", vaultId);
  if (error) throw error;
  return data ?? [];
}

export async function listSyncRuns(limit = 50) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("sync_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function selectTopVaultsByAnnualReturn(limit = 10) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from("vaults").select("*").limit(200);
  if (error) throw error;
  const items = (data ?? []).slice();
  items.sort((a: any, b: any) => {
    const aValue = Number(a.annualized_return ?? a.all_time_return ?? 0);
    const bValue = Number(b.annualized_return ?? b.all_time_return ?? 0);
    return bValue - aValue;
  });
  return items.slice(0, limit);
}
