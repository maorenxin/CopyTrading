import { randomUUID } from "crypto";
import { log } from "./logger";
import { query, withTransaction } from "../db/postgres";

const BATCH_SIZE = Number(process.env.VAULT_DB_BATCH_SIZE ?? 200);

export interface VaultUpsertInput {
  vaultAddress: string;
  name?: string;
  leaderAddress?: string;
  managerAddress?: string;
  creatorAddress?: string;
  status?: string;
  isClosed?: boolean;
  relationshipType?: string;
  createTimeMillis?: number;
  description?: string;
  tvlUsdc?: number;
  apr?: number;
  allTimeReturn?: number;
  annualizedReturn?: number;
  sharpe?: number;
  maxDrawdown?: number;
  lastTradeAt?: string;
  lastWsTradeAt?: string;
  lastSyncRunId?: string;
}

export interface VaultBasicInput {
  vaultAddress: string;
  name?: string;
  leaderAddress?: string;
  managerAddress?: string;
  creatorAddress?: string;
  description?: string;
}

export interface VaultNavJsonInput {
  vaultAddress: string;
  navJson: unknown;
}

export interface VaultTradeInput {
  vaultAddress: string;
  txHash?: string;
  coin?: string;
  side?: string;
  price?: number;
  size?: number;
  startPosition?: number;
  endPosition?: number;
  pnl?: number;
  utcTime?: string;
  timestamp?: string;
  source?: "sync" | "ws" | "fills" | "csv";
  syncRunId?: string;
}

export interface VaultFundingInput {
  vaultAddress: string;
  utcTime?: string;
  timestamp?: string;
  entryType?: string;
  coin?: string;
  usdc?: number;
  szi?: number;
  fundingRate?: number;
  nSamples?: number;
  syncRunId?: string;
}

export interface VaultLedgerInput {
  vaultAddress: string;
  utcTime?: string;
  timestamp?: string;
  txHash?: string;
  ledgerType?: string;
  usdc?: number;
  commission?: number;
  syncRunId?: string;
}

export interface VaultPositionInput {
  vaultAddress: string;
  symbol?: string;
  side?: string;
  leverage?: number;
  quantity?: number;
  entryPrice?: number;
  markPrice?: number;
  positionValue?: number;
  roePercent?: number;
  syncRunId?: string;
}

export interface VaultDepositorInput {
  vaultAddress: string;
  depositorAddress?: string;
  amountUsdc?: number;
  sharePercent?: number;
  syncRunId?: string;
}

export interface VaultQuantstatUpsertInput {
  vaultAddress: string;
  navStart?: number;
  navEnd?: number;
  balance?: number;
  annualizedReturn?: number;
  sharpe?: number;
  mdd?: number;
  winRate?: number;
  timeInMarket?: number;
  avgHoldDays?: number;
  traderAgeHours?: number;
  followerCount?: number;
  avgDepositorHoldDays?: number;
  avgTradesPerDay?: number;
  freq?: string;
  metricsMode?: string;
  metricsWindow?: string;
  lastTradeAt?: string;
  navJson?: unknown;
}

export interface VaultRadarStatsInput {
  vaultAddress: string;
  radarBalanceScore?: number;
  radarMddScore?: number;
  radarSharpeScore?: number;
  radarReturnScore?: number;
  radarAgeScore?: number;
  radarArea?: number;
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
  vaultAddress: string;
}

function buildInsert(table: string, columns: string[], rows: Record<string, any>[]) {
  const values: any[] = [];
  const placeholders = rows.map((row) => {
    const startIndex = values.length;
    columns.forEach((column) => values.push(row[column]));
    const params = columns.map((_, index) => `$${startIndex + index + 1}`);
    return `(${params.join(",")})`;
  });
  const sql = `insert into ${table} (${columns.join(",")}) values ${placeholders.join(",")}`;
  return { sql, values };
}

export async function upsertVaults(vaults: VaultUpsertInput[]): Promise<Map<string, VaultRecord>> {
  if (vaults.length === 0) return new Map();

  const now = new Date().toISOString();
  const rows = vaults.map((vault) => ({
    vault_address: vault.vaultAddress,
    name: vault.name ?? null,
    leader_address: vault.leaderAddress ?? null,
    manager_address: vault.managerAddress ?? null,
    creator_address: vault.creatorAddress ?? null,
    status: vault.status ?? null,
    is_closed: vault.isClosed ?? null,
    relationship_type: vault.relationshipType ?? null,
    create_time_millis: vault.createTimeMillis ?? null,
    description: vault.description ?? null,
    tvl_usdc: vault.tvlUsdc ?? null,
    apr: vault.apr ?? null,
    all_time_return: vault.allTimeReturn ?? null,
    annualized_return: vault.annualizedReturn ?? null,
    sharpe: vault.sharpe ?? null,
    max_drawdown: vault.maxDrawdown ?? null,
    last_trade_at: vault.lastTradeAt ?? null,
    last_ws_trade_at: vault.lastWsTradeAt ?? null,
    last_sync_run_id: vault.lastSyncRunId ?? null,
    updated_at: now,
  }));

  const columns = [
    "vault_address",
    "name",
    "leader_address",
    "manager_address",
    "creator_address",
    "status",
    "is_closed",
    "relationship_type",
    "create_time_millis",
    "description",
    "tvl_usdc",
    "apr",
    "all_time_return",
    "annualized_return",
    "sharpe",
    "max_drawdown",
    "last_trade_at",
    "last_ws_trade_at",
    "last_sync_run_id",
    "updated_at",
  ];

  const resultMap = new Map<string, VaultRecord>();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_info", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address) do update set
      name = excluded.name,
      leader_address = excluded.leader_address,
      manager_address = excluded.manager_address,
      creator_address = excluded.creator_address,
      status = excluded.status,
      is_closed = excluded.is_closed,
      relationship_type = excluded.relationship_type,
      create_time_millis = excluded.create_time_millis,
      description = excluded.description,
      tvl_usdc = excluded.tvl_usdc,
      apr = excluded.apr,
      all_time_return = excluded.all_time_return,
      annualized_return = coalesce(excluded.annualized_return, vault_info.annualized_return),
      sharpe = coalesce(excluded.sharpe, vault_info.sharpe),
      max_drawdown = coalesce(excluded.max_drawdown, vault_info.max_drawdown),
      last_trade_at = excluded.last_trade_at,
      last_ws_trade_at = excluded.last_ws_trade_at,
      last_sync_run_id = excluded.last_sync_run_id,
      updated_at = excluded.updated_at
      returning vault_address`;

    const { rows: returned } = (await query<{ vault_address: string }>(upsertSql, values)) as {
      rows: Array<{ vault_address: string }>;
    };
    returned.forEach((row) => {
      resultMap.set(row.vault_address, { vaultAddress: row.vault_address });
    });
  }

  return resultMap;
}

/**
 * 写入 vault 基础信息（仅更新 name/leader/description）。
 * @param rows - vault 基础信息数组。
 * @returns 写入的记录条数。
 */
export async function upsertVaultBasics(rows: VaultBasicInput[]): Promise<number> {
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    vault_address: row.vaultAddress.toLowerCase(),
    name: row.name ?? null,
    leader_address: row.leaderAddress ?? null,
    manager_address: row.managerAddress ?? null,
    creator_address: row.creatorAddress ?? null,
    description: row.description ?? null,
    updated_at: now,
  }));

  const columns = [
    "vault_address",
    "name",
    "leader_address",
    "manager_address",
    "creator_address",
    "description",
    "updated_at",
  ];

  let inserted = 0;
  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const batch = payload.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_info", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address) do update set
      name = coalesce(excluded.name, vault_info.name),
      leader_address = coalesce(excluded.leader_address, vault_info.leader_address),
      manager_address = coalesce(excluded.manager_address, vault_info.manager_address),
      creator_address = coalesce(excluded.creator_address, vault_info.creator_address),
      description = coalesce(excluded.description, vault_info.description),
      updated_at = excluded.updated_at`;
    await query(upsertSql, values);
    inserted += batch.length;
  }

  return inserted;
}

/**
 * 写入 vault 净值曲线（nav_json）。
 * @param rows - vault 净值曲线数据数组。
 * @returns 写入的记录条数。
 */
export async function upsertVaultNavJson(rows: VaultNavJsonInput[]): Promise<number> {
  if (rows.length === 0) return 0;

  const normalizeNavJson = (value: unknown) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  };

  const now = new Date().toISOString();
  const payload = rows
    .map((row) => ({
      vault_address: row.vaultAddress.toLowerCase(),
      nav_json: normalizeNavJson(row.navJson),
      updated_at: now,
    }))
    .filter((row) => row.nav_json !== null);

  if (payload.length === 0) return 0;

  const columns = ["vault_address", "nav_json", "updated_at"];

  let inserted = 0;
  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const batch = payload.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_info", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address) do update set
      nav_json = excluded.nav_json,
      updated_at = excluded.updated_at`;
    await query(upsertSql, values);
    inserted += batch.length;
  }

  return inserted;
}

/**
 * 将量化指标写入 vault_info 表（仅更新量化相关字段）。
 * @param rows - 量化指标行数据。
 * @returns 写入的记录条数。
 */
export async function upsertVaultQuantstatsIntoVaultsInfo(
  rows: VaultQuantstatUpsertInput[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    vault_address: row.vaultAddress,
    nav_start: row.navStart ?? null,
    nav_end: row.navEnd ?? null,
    balance: row.balance ?? null,
    annualized_return: row.annualizedReturn ?? null,
    sharpe: row.sharpe ?? null,
    mdd: row.mdd ?? null,
    win_rate: row.winRate ?? null,
    time_in_market: row.timeInMarket ?? null,
    avg_hold_days: row.avgHoldDays ?? null,
    trader_age_hours: row.traderAgeHours ?? null,
    follower_count: row.followerCount ?? null,
    avg_depositor_hold_days: row.avgDepositorHoldDays ?? null,
    avg_trades_per_day: row.avgTradesPerDay ?? null,
    freq: row.freq ?? "",
    metrics_mode: row.metricsMode ?? "",
    metrics_window: row.metricsWindow ?? "",
    last_trade_at: row.lastTradeAt ?? null,
    nav_json: row.navJson ?? null,
    updated_at: now,
  }));

  const columns = [
    "vault_address",
    "nav_start",
    "nav_end",
    "balance",
    "annualized_return",
    "sharpe",
    "mdd",
    "win_rate",
    "time_in_market",
    "avg_hold_days",
    "trader_age_hours",
    "follower_count",
    "avg_depositor_hold_days",
    "avg_trades_per_day",
    "freq",
    "metrics_mode",
    "metrics_window",
    "last_trade_at",
    "nav_json",
    "updated_at",
  ];

  let inserted = 0;
  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const batch = payload.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_info", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address) do update set
      nav_start = excluded.nav_start,
      nav_end = excluded.nav_end,
      balance = excluded.balance,
      annualized_return = excluded.annualized_return,
      sharpe = excluded.sharpe,
      mdd = excluded.mdd,
      win_rate = excluded.win_rate,
      time_in_market = excluded.time_in_market,
      avg_hold_days = excluded.avg_hold_days,
      trader_age_hours = excluded.trader_age_hours,
      follower_count = excluded.follower_count,
      avg_depositor_hold_days = excluded.avg_depositor_hold_days,
      avg_trades_per_day = excluded.avg_trades_per_day,
      freq = excluded.freq,
      metrics_mode = excluded.metrics_mode,
      metrics_window = excluded.metrics_window,
      last_trade_at = excluded.last_trade_at,
      nav_json = excluded.nav_json,
      updated_at = excluded.updated_at`;
    await query(upsertSql, values);
    inserted += batch.length;
  }

  return inserted;
}

/**
 * 将雷达图评分与面积写入 vault_info 表。
 * @param rows - 雷达图评分行数据。
 * @returns 写入的记录条数。
 */
export async function upsertVaultRadarStatsIntoVaultsInfo(
  rows: VaultRadarStatsInput[],
): Promise<number> {
  if (rows.length === 0) return 0;

  const now = new Date().toISOString();
  const payload = rows.map((row) => ({
    vault_address: row.vaultAddress,
    radar_balance_score: row.radarBalanceScore ?? null,
    radar_mdd_score: row.radarMddScore ?? null,
    radar_sharpe_score: row.radarSharpeScore ?? null,
    radar_return_score: row.radarReturnScore ?? null,
    radar_age_score: row.radarAgeScore ?? null,
    radar_area: row.radarArea ?? null,
    updated_at: now,
  }));

  const columns = [
    "vault_address",
    "radar_balance_score",
    "radar_mdd_score",
    "radar_sharpe_score",
    "radar_return_score",
    "radar_age_score",
    "radar_area",
    "updated_at",
  ];

  let inserted = 0;
  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    const batch = payload.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_info", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address) do update set
      radar_balance_score = excluded.radar_balance_score,
      radar_mdd_score = excluded.radar_mdd_score,
      radar_sharpe_score = excluded.radar_sharpe_score,
      radar_return_score = excluded.radar_return_score,
      radar_age_score = excluded.radar_age_score,
      radar_area = excluded.radar_area,
      updated_at = excluded.updated_at`;
    await query(upsertSql, values);
    inserted += batch.length;
  }

  return inserted;
}

export async function upsertVaultTrades(trades: VaultTradeInput[]): Promise<void> {
  if (trades.length === 0) return;
  const deduped = new Map<string, VaultTradeInput>();
  for (const trade of trades) {
    const vaultAddress = trade.vaultAddress.toLowerCase();
    const fallbackKey = `${vaultAddress}:${trade.utcTime ?? ""}:${trade.timestamp ?? ""}:${
      trade.coin ?? ""
    }:${trade.side ?? ""}:${
      trade.price ?? ""
    }:${trade.size ?? ""}:${trade.pnl ?? ""}`;
    const txHash = trade.txHash ?? fallbackKey;
    const key = `${vaultAddress}:${txHash}`;
    if (!deduped.has(key)) {
      deduped.set(key, { ...trade, vaultAddress, txHash });
    }
  }
  const now = new Date().toISOString();
  const rows = Array.from(deduped.values()).map((trade) => ({
    vault_address: trade.vaultAddress,
    tx_hash: trade.txHash ?? randomUUID(),
    coin: trade.coin ?? null,
    side: trade.side ?? null,
    price: trade.price ?? null,
    size: trade.size ?? null,
    start_position: trade.startPosition ?? null,
    end_position: trade.endPosition ?? null,
    pnl: trade.pnl ?? null,
    utc_time: trade.utcTime ?? null,
    timestamp: trade.timestamp ?? null,
    source: trade.source ?? "sync",
    sync_run_id: trade.syncRunId ?? null,
    synced_at: now,
  }));

  const columns = [
    "vault_address",
    "tx_hash",
    "coin",
    "side",
    "price",
    "size",
    "start_position",
    "end_position",
    "pnl",
    "utc_time",
    "timestamp",
    "source",
    "sync_run_id",
    "synced_at",
  ];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_trades", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address, tx_hash) do update set
      coin = excluded.coin,
      side = excluded.side,
      price = excluded.price,
      size = excluded.size,
      start_position = excluded.start_position,
      end_position = excluded.end_position,
      pnl = excluded.pnl,
      utc_time = excluded.utc_time,
      timestamp = excluded.timestamp,
      source = excluded.source,
      sync_run_id = excluded.sync_run_id,
      synced_at = excluded.synced_at`;
    await query(upsertSql, values);
  }
}

export async function getLatestVaultTradeUtcTime(
  vaultAddress: string,
): Promise<number | undefined> {
  const { rows } = await query<{ max_time: string | null }>(
    "select max(utc_time) as max_time from vault_trades where vault_address = $1",
    [vaultAddress.toLowerCase()],
  );
  const maxTime = rows[0]?.max_time ?? null;
  if (!maxTime) return undefined;
  const parsed = Date.parse(maxTime);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getLatestVaultFundingUtcTime(
  vaultAddress: string,
): Promise<number | undefined> {
  const { rows } = await query<{ max_time: string | null }>(
    "select max(utc_time) as max_time from vault_funding where vault_address = $1",
    [vaultAddress.toLowerCase()],
  );
  const maxTime = rows[0]?.max_time ?? null;
  if (!maxTime) return undefined;
  const parsed = Date.parse(maxTime);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function getLatestVaultLedgerUtcTime(
  vaultAddress: string,
): Promise<number | undefined> {
  const { rows } = await query<{ max_time: string | null }>(
    "select max(utc_time) as max_time from vault_nonfunding_ledger where vault_address = $1",
    [vaultAddress.toLowerCase()],
  );
  const maxTime = rows[0]?.max_time ?? null;
  if (!maxTime) return undefined;
  const parsed = Date.parse(maxTime);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function upsertVaultFunding(funding: VaultFundingInput[]): Promise<void> {
  if (funding.length === 0) return;
  const now = new Date().toISOString();
  const rows = funding.map((entry) => ({
    vault_address: entry.vaultAddress,
    utc_time: entry.utcTime ?? null,
    timestamp: entry.timestamp ?? null,
    entry_type: entry.entryType ?? null,
    coin: entry.coin ?? null,
    usdc: entry.usdc ?? null,
    szi: entry.szi ?? null,
    funding_rate: entry.fundingRate ?? null,
    n_samples: entry.nSamples ?? null,
    sync_run_id: entry.syncRunId ?? null,
    synced_at: now,
  }));

  const columns = [
    "vault_address",
    "utc_time",
    "timestamp",
    "entry_type",
    "coin",
    "usdc",
    "szi",
    "funding_rate",
    "n_samples",
    "sync_run_id",
    "synced_at",
  ];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_funding", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address, utc_time, coin, entry_type) do update set
      utc_time = excluded.utc_time,
      timestamp = excluded.timestamp,
      usdc = excluded.usdc,
      szi = excluded.szi,
      funding_rate = excluded.funding_rate,
      n_samples = excluded.n_samples,
      sync_run_id = excluded.sync_run_id,
      synced_at = excluded.synced_at`;
    await query(upsertSql, values);
  }
}

export async function upsertVaultLedger(entries: VaultLedgerInput[]): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date().toISOString();
  const rows = entries.map((entry) => ({
    vault_address: entry.vaultAddress,
    utc_time: entry.utcTime ?? null,
    timestamp: entry.timestamp ?? null,
    tx_hash: entry.txHash ?? null,
    ledger_type: entry.ledgerType ?? null,
    usdc: entry.usdc ?? null,
    commission: entry.commission ?? null,
    sync_run_id: entry.syncRunId ?? null,
    synced_at: now,
  }));

  const columns = [
    "vault_address",
    "utc_time",
    "timestamp",
    "tx_hash",
    "ledger_type",
    "usdc",
    "commission",
    "sync_run_id",
    "synced_at",
  ];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_nonfunding_ledger", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address, tx_hash, utc_time, ledger_type) do update set
      utc_time = excluded.utc_time,
      timestamp = excluded.timestamp,
      usdc = excluded.usdc,
      commission = excluded.commission,
      sync_run_id = excluded.sync_run_id,
      synced_at = excluded.synced_at`;
    await query(upsertSql, values);
  }
}

export async function replaceVaultPositions(
  vaultAddress: string,
  positions: VaultPositionInput[],
  syncRunId?: string
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("delete from vault_positions where vault_address = $1", [vaultAddress]);
    if (positions.length === 0) return;

    const now = new Date().toISOString();
    const rows = positions.map((position) => ({
      vault_address: vaultAddress,
      symbol: position.symbol ?? null,
      side: position.side ?? null,
      leverage: position.leverage ?? null,
      quantity: position.quantity ?? null,
      entry_price: position.entryPrice ?? null,
      mark_price: position.markPrice ?? null,
      position_value: position.positionValue ?? null,
      roe_percent: position.roePercent ?? null,
      sync_run_id: position.syncRunId ?? syncRunId ?? null,
      synced_at: now,
    }));

    const columns = [
      "vault_address",
      "symbol",
      "side",
      "leverage",
      "quantity",
      "entry_price",
      "mark_price",
      "position_value",
      "roe_percent",
      "sync_run_id",
      "synced_at",
    ];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { sql, values } = buildInsert("vault_positions", columns, batch);
      await client.query(sql, values);
    }
  });
}

export async function replaceVaultDepositors(
  vaultAddress: string,
  depositors: VaultDepositorInput[],
  syncRunId?: string
): Promise<void> {
  await withTransaction(async (client) => {
    await client.query("delete from vault_depositors where vault_address = $1", [vaultAddress]);
    if (depositors.length === 0) return;

    const now = new Date().toISOString();
    const rows = depositors.map((depositor) => ({
      vault_address: vaultAddress,
      depositor_address: depositor.depositorAddress ?? null,
      amount_usdc: depositor.amountUsdc ?? null,
      share_percent: depositor.sharePercent ?? null,
      sync_run_id: depositor.syncRunId ?? syncRunId ?? null,
      synced_at: now,
    }));

    const columns = [
      "vault_address",
      "depositor_address",
      "amount_usdc",
      "share_percent",
      "sync_run_id",
      "synced_at",
    ];

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { sql, values } = buildInsert("vault_depositors", columns, batch);
      await client.query(sql, values);
    }
  });
}

export async function updateVaultWsTradeTime(
  vaultAddress: string,
  timestamp?: string
): Promise<void> {
  const time = timestamp ?? new Date().toISOString();
  try {
    await query(
      "update vault_info set last_ws_trade_at = $2, updated_at = $3 where vault_address = $1",
      [vaultAddress, time, new Date().toISOString()]
    );
  } catch (error) {
    log("error", "vault ws trade time update failed", {
      message: (error as Error).message,
    });
  }
}

export async function listVaults(limit = 200, cursor?: string) {
  const params: Array<string | number> = [limit];
  let sql = "select * from vault_info";
  if (cursor) {
    sql += " where vault_address > $2";
    params.push(cursor);
  }
  sql += " order by annualized_return desc nulls last, vault_address asc limit $1";
  const { rows } = await query(sql, params);
  return rows ?? [];
}

export async function getVaultByAddress(vaultAddress: string) {
  const { rows } = await query(
    "select * from vault_info where vault_address = $1 limit 1",
    [vaultAddress]
  );
  return rows?.[0];
}

export async function listVaultTrades(vaultAddress: string, limit = 200) {
  const { rows } = await query(
    "select * from vault_trades where vault_address = $1 order by utc_time desc nulls last limit $2",
    [vaultAddress, limit]
  );
  return rows ?? [];
}

export async function listVaultFunding(vaultAddress: string, limit = 200) {
  const { rows } = await query(
    "select * from vault_funding where vault_address = $1 order by utc_time desc nulls last limit $2",
    [vaultAddress, limit]
  );
  return rows ?? [];
}

export async function listVaultLedger(vaultAddress: string, limit = 200) {
  const { rows } = await query(
    "select * from vault_nonfunding_ledger where vault_address = $1 order by utc_time desc nulls last limit $2",
    [vaultAddress, limit]
  );
  return rows ?? [];
}

export async function listVaultPositions(vaultAddress: string) {
  const { rows } = await query(
    "select * from vault_positions where vault_address = $1",
    [vaultAddress]
  );
  return rows ?? [];
}

export async function listVaultDepositors(vaultAddress: string) {
  const { rows } = await query(
    "select * from vault_depositors where vault_address = $1",
    [vaultAddress]
  );
  return rows ?? [];
}

export async function getVaultQuantstats(vaultAddress: string) {
  const { rows } = await query(
    `select vault_address, nav_start, nav_end, balance, annualized_return, sharpe, mdd,
            win_rate, time_in_market, avg_hold_days, trader_age_hours,
            follower_count, avg_depositor_hold_days, avg_trades_per_day,
            freq, metrics_mode, metrics_window, last_trade_at, nav_json
     from vault_info
     where vault_address = $1
     limit 1`,
    [vaultAddress]
  );
  return rows?.[0];
}

export async function listSyncRuns(limit = 50) {
  const { rows } = await query(
    `select
      sr.*,
      rs.csv_vaults_count as reconcile_csv_vaults_count,
      rs.db_vaults_count as reconcile_db_vaults_count,
      rs.csv_trades_count as reconcile_csv_trades_count,
      rs.db_trades_count as reconcile_db_trades_count,
      rs.csv_positions_count as reconcile_csv_positions_count,
      rs.db_positions_count as reconcile_db_positions_count,
      rs.csv_depositors_count as reconcile_csv_depositors_count,
      rs.db_depositors_count as reconcile_db_depositors_count,
      rs.diff_vaults_count as reconcile_diff_vaults_count,
      rs.diff_trades_count as reconcile_diff_trades_count,
      rs.diff_positions_count as reconcile_diff_positions_count,
      rs.diff_depositors_count as reconcile_diff_depositors_count
    from sync_runs sr
    left join reconcile_summaries rs on rs.sync_run_id = sr.id
    order by sr.started_at desc
    limit $1`,
    [limit]
  );
  return rows ?? [];
}

export async function selectTopVaultsByAnnualReturn(limit = 10) {
  const { rows } = await query(
    "select * from vault_info order by annualized_return desc nulls last limit $1",
    [limit]
  );
  return rows ?? [];
}
