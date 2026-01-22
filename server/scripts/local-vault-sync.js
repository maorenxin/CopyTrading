"use strict";

const { randomUUID } = require("crypto");
const { Pool } = require("pg");
const { fetch, ProxyAgent } = require("undici");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "postgresql://localhost:5432/copytrading";
const API_URL = process.env.HYPERLIQUID_API_URL || "https://api-ui.hyperliquid.xyz";
const VAULTS_URL = "https://app.hyperliquid.xyz/vaults";
const CONCURRENCY = Number(process.env.VAULT_SYNC_CONCURRENCY || 5);
const BATCH_SIZE = Number(process.env.VAULT_SYNC_BATCH_SIZE || 200);
const VAULT_SYNC_LIMIT = Number(process.env.VAULT_SYNC_LIMIT || 0);

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const log = {
  info: (...args) => console.log("[vault-sync]", ...args),
  warn: (...args) => console.warn("[vault-sync]", ...args),
  error: (...args) => console.error("[vault-sync]", ...args),
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toIso = (value) => {
  if (!value) return undefined;
  if (typeof value === "number") return new Date(value).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const pickVaultAddress = (item) => {
  return (
    item?.vaultAddress ??
    item?.vault_address ??
    item?.address ??
    item?.summary?.vaultAddress ??
    item?.summary?.address ??
    item?.vault?.address ??
    item?.vault?.vaultAddress
  );
};

const normalizeVault = (item) => {
  const summary = item?.summary ?? item?.vault ?? item;
  const vaultAddress = pickVaultAddress(summary);
  if (!vaultAddress) return null;
  const isClosed = summary?.isClosed;
  const leader = summary?.leader ?? item?.managerAddress ?? item?.manager ?? item?.vault?.manager;
  const status =
    item?.status ??
    summary?.status ??
    (typeof isClosed === "boolean" ? (isClosed ? "closed" : "active") : undefined);
  return {
    vaultAddress,
    name: summary?.name ?? item?.name ?? item?.vaultName ?? item?.vault?.name,
    managerAddress: leader,
    creatorAddress: leader,
    status,
    description:
      summary?.description ??
      summary?.desc ??
      summary?.strategy ??
      item?.description ??
      item?.desc ??
      item?.strategy,
    tvlUsdc: toNumber(summary?.tvl ?? item?.tvlUsdc ?? item?.tvl ?? item?.vault?.tvl),
    allTimeReturn: toNumber(item?.allTimeReturn ?? item?.return ?? item?.vault?.allTimeReturn),
    annualizedReturn: toNumber(item?.apr ?? item?.annualizedReturn ?? item?.vault?.annualizedReturn),
    sharpe: toNumber(item?.sharpe ?? item?.vault?.sharpe),
    maxDrawdown: toNumber(item?.maxDrawdown ?? item?.vault?.maxDrawdown),
    lastTradeAt: toIso(item?.lastTradeAt ?? item?.lastTradeTime),
  };
};

const normalizeTrades = (vaultId, raw) => {
  const items = raw?.trades ?? raw?.items ?? raw?.history ?? raw ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    vaultId,
    txHash: item?.tx_hash ?? item?.hash ?? item?.id ?? `${vaultId}-${index}-${item?.time ?? Date.now()}`,
    side: item?.side ?? item?.dir ?? item?.type,
    price: toNumber(item?.price ?? item?.px),
    size: toNumber(item?.size ?? item?.sz ?? item?.qty),
    pnl: toNumber(item?.pnl ?? item?.closedPnl),
    timestamp: toIso(item?.timestamp ?? item?.time ?? item?.t),
    source: "sync",
  }));
};

const normalizePositions = (vaultId, raw) => {
  const items = raw?.positions ?? raw?.items ?? raw ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    vaultId,
    symbol: item?.symbol ?? item?.coin ?? item?.asset,
    side: item?.side ?? item?.dir ?? item?.type,
    leverage: toNumber(item?.leverage ?? item?.lev),
    quantity: toNumber(item?.quantity ?? item?.sz ?? item?.size),
    entryPrice: toNumber(item?.entryPrice ?? item?.entry_px ?? item?.entry),
    markPrice: toNumber(item?.markPrice ?? item?.mark_px ?? item?.mark),
    positionValue: toNumber(item?.positionValue ?? item?.position_value),
    roePercent: toNumber(item?.roePercent ?? item?.roe),
  }));
};

const normalizeDepositors = (vaultId, raw) => {
  const items = raw?.depositors ?? raw?.items ?? raw ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((item) => ({
    vaultId,
    depositorAddress: item?.address ?? item?.depositor ?? item?.wallet,
    amountUsdc: toNumber(item?.amountUsdc ?? item?.amount ?? item?.usd),
    sharePercent: toNumber(item?.sharePercent ?? item?.share ?? item?.percent),
  }));
};

async function postInfo(type, payload = {}) {
  const response = await fetch(`${API_URL}/info`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, ...payload }),
    dispatcher,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`hyperliquid info error: ${response.status} ${text}`);
  }

  return response.json();
}

async function fetchVaultSummaries() {
  try {
    return await postInfo("vaultSummaries");
  } catch (error) {
    log.warn("fetchVaultSummaries failed", error.message);
    return null;
  }
}

async function fetchVaultTrades(vaultAddress) {
  try {
    return await postInfo("vaultTrades", { vaultAddress });
  } catch (error) {
    log.warn("fetchVaultTrades failed", vaultAddress, error.message);
    return null;
  }
}

async function fetchVaultPositions(vaultAddress) {
  try {
    return await postInfo("vaultPositions", { vaultAddress });
  } catch (error) {
    log.warn("fetchVaultPositions failed", vaultAddress, error.message);
    return null;
  }
}

async function fetchVaultDepositors(vaultAddress) {
  try {
    return await postInfo("vaultDepositors", { vaultAddress });
  } catch (error) {
    log.warn("fetchVaultDepositors failed", vaultAddress, error.message);
    return null;
  }
}

function findVaultArray(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    if (node.length > 0 && typeof node[0] === "object") {
      const candidate = node.find((item) => item?.vaultAddress || item?.address || item?.vault_address);
      if (candidate) return node;
    }
    for (const item of node) {
      const found = findVaultArray(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof node === "object") {
    for (const value of Object.values(node)) {
      const found = findVaultArray(value);
      if (found) return found;
    }
  }
  return null;
}

async function scrapeVaultsFromPage() {
  const response = await fetch(VAULTS_URL, { dispatcher });
  if (!response.ok) {
    throw new Error(`vaults page request failed: ${response.status}`);
  }
  const html = await response.text();
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) {
    const fallback = await fetchVaultSummaries();
    if (Array.isArray(fallback)) {
      return { vaults: fallback, raw: fallback };
    }
    if (fallback && Array.isArray(fallback.vaults)) {
      return { vaults: fallback.vaults, raw: fallback };
    }
    throw new Error("__NEXT_DATA__ not found");
  }
  const json = JSON.parse(match[1]);
  const vaults = findVaultArray(json) ?? [];
  return { vaults, raw: json };
}

function buildInsert(table, columns, rows) {
  const values = [];
  const placeholders = rows.map((row) => {
    const startIndex = values.length;
    columns.forEach((column) => values.push(row[column]));
    const params = columns.map((_, index) => `$${startIndex + index + 1}`);
    return `(${params.join(",")})`;
  });
  const sql = `insert into ${table} (${columns.join(",")}) values ${placeholders.join(",")}`;
  return { sql, values };
}

async function createSyncRun(pool, source, vaultCount) {
  const id = randomUUID();
  const startedAt = new Date().toISOString();
  await pool.query(
    "insert into sync_runs (id, source, started_at, status, vault_count, success_count, failed_vaults, websocket_vaults, note) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [id, source, startedAt, "running", vaultCount, 0, [], [], null],
  );
  return { id, startedAt };
}

async function completeSyncRun(pool, id, { status, successCount, failedVaults, note }) {
  const finishedAt = new Date().toISOString();
  await pool.query(
    "update sync_runs set status = $2, finished_at = $3, success_count = $4, failed_vaults = $5, note = $6 where id = $1",
    [id, status, finishedAt, successCount, failedVaults, note],
  );
}

async function upsertVaults(pool, vaults) {
  if (vaults.length === 0) return new Map();
  const now = new Date().toISOString();
  const rows = vaults.map((vault) => ({
    id: randomUUID(),
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

  const columns = [
    "id",
    "vault_address",
    "name",
    "manager_address",
    "creator_address",
    "status",
    "description",
    "tvl_usdc",
    "all_time_return",
    "annualized_return",
    "sharpe",
    "max_drawdown",
    "last_trade_at",
    "last_ws_trade_at",
    "updated_at",
  ];

  const map = new Map();
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vaults", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address) do update set
      name = excluded.name,
      manager_address = excluded.manager_address,
      creator_address = excluded.creator_address,
      status = excluded.status,
      description = excluded.description,
      tvl_usdc = excluded.tvl_usdc,
      all_time_return = excluded.all_time_return,
      annualized_return = excluded.annualized_return,
      sharpe = excluded.sharpe,
      max_drawdown = excluded.max_drawdown,
      last_trade_at = excluded.last_trade_at,
      last_ws_trade_at = excluded.last_ws_trade_at,
      updated_at = excluded.updated_at
      returning id, vault_address`;

    const result = await pool.query(upsertSql, values);
    result.rows.forEach((row) => {
      map.set(row.vault_address, { id: row.id, vaultAddress: row.vault_address });
    });
  }

  return map;
}

async function upsertVaultTrades(pool, trades) {
  if (trades.length === 0) return;
  const now = new Date().toISOString();
  const rows = trades.map((trade) => ({
    id: randomUUID(),
    vault_id: trade.vaultId,
    tx_hash: trade.txHash ?? randomUUID(),
    side: trade.side ?? null,
    price: trade.price ?? null,
    size: trade.size ?? null,
    pnl: trade.pnl ?? null,
    timestamp: trade.timestamp ?? null,
    source: trade.source ?? "sync",
    synced_at: now,
  }));

  const columns = ["id", "vault_id", "tx_hash", "side", "price", "size", "pnl", "timestamp", "source", "synced_at"];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_trades", columns, batch);
    const upsertSql = `${sql} on conflict (vault_id, tx_hash) do update set
      side = excluded.side,
      price = excluded.price,
      size = excluded.size,
      pnl = excluded.pnl,
      timestamp = excluded.timestamp,
      source = excluded.source,
      synced_at = excluded.synced_at`;
    await pool.query(upsertSql, values);
  }
}

async function replaceVaultPositions(pool, vaultId, positions) {
  await pool.query("delete from vault_positions where vault_id = $1", [vaultId]);
  if (positions.length === 0) return;
  const now = new Date().toISOString();
  const rows = positions.map((position) => ({
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
    synced_at: now,
  }));

  const columns = [
    "id",
    "vault_id",
    "symbol",
    "side",
    "leverage",
    "quantity",
    "entry_price",
    "mark_price",
    "position_value",
    "roe_percent",
    "synced_at",
  ];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_positions", columns, batch);
    await pool.query(sql, values);
  }
}

async function replaceVaultDepositors(pool, vaultId, depositors) {
  await pool.query("delete from vault_depositors where vault_id = $1", [vaultId]);
  if (depositors.length === 0) return;
  const now = new Date().toISOString();
  const rows = depositors.map((depositor) => ({
    id: randomUUID(),
    vault_id: vaultId,
    depositor_address: depositor.depositorAddress ?? null,
    amount_usdc: depositor.amountUsdc ?? null,
    share_percent: depositor.sharePercent ?? null,
    synced_at: now,
  }));

  const columns = ["id", "vault_id", "depositor_address", "amount_usdc", "share_percent", "synced_at"];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_depositors", columns, batch);
    await pool.query(sql, values);
  }
}

async function runVaultSync() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    let vaultSource = "official";
    let rawVaults = await fetchVaultSummaries();
    let vaultList = Array.isArray(rawVaults) ? rawVaults : rawVaults?.vaults ?? [];

    if (vaultList.length === 0) {
      vaultSource = "fallback";
      const scraped = await scrapeVaultsFromPage();
      rawVaults = scraped.vaults;
      vaultList = Array.isArray(rawVaults) ? rawVaults : rawVaults?.vaults ?? [];
    }
    let normalizedVaults = vaultList.map(normalizeVault).filter(Boolean);
    if (VAULT_SYNC_LIMIT > 0) {
      normalizedVaults = normalizedVaults.slice(0, VAULT_SYNC_LIMIT);
    }

    log.info(`vaults=${normalizedVaults.length} source=${vaultSource}`);

    const syncRun = await createSyncRun(pool, vaultSource, normalizedVaults.length);
    const vaultIdMap = await upsertVaults(pool, normalizedVaults);

    const queue = normalizedVaults.slice();
    const failedVaults = [];
    let successCount = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const vault = queue.shift();
        if (!vault) continue;
        const vaultId = vaultIdMap.get(vault.vaultAddress)?.id;
        if (!vaultId) continue;

        try {
          const [tradeData, positionData, depositorData] = await Promise.all([
            fetchVaultTrades(vault.vaultAddress),
            fetchVaultPositions(vault.vaultAddress),
            fetchVaultDepositors(vault.vaultAddress),
          ]);

          const trades = normalizeTrades(vaultId, tradeData);
          const positions = normalizePositions(vaultId, positionData);
          const depositors = normalizeDepositors(vaultId, depositorData);

          await upsertVaultTrades(pool, trades);
          await replaceVaultPositions(pool, vaultId, positions);
          await replaceVaultDepositors(pool, vaultId, depositors);

          successCount += 1;
        } catch (error) {
          failedVaults.push(vault.vaultAddress);
          log.warn("vault sync failed", vault.vaultAddress, error.message);
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    const status = failedVaults.length === 0 ? "success" : successCount > 0 ? "partial" : "failed";
    await completeSyncRun(pool, syncRun.id, {
      status,
      successCount,
      failedVaults,
      note: `vaults:${normalizedVaults.length}, success:${successCount}, failed:${failedVaults.length}`,
    });

    log.info(`sync complete status=${status} success=${successCount} failed=${failedVaults.length}`);
  } finally {
    await pool.end();
  }
}

runVaultSync().catch((error) => {
  log.error(error);
  process.exitCode = 1;
});
