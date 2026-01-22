"use strict";

const { randomUUID } = require("crypto");
const { Pool } = require("pg");
const { fetch, ProxyAgent } = require("undici");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "postgresql://localhost:5432/copytrading";
const API_URL = process.env.HYPERLIQUID_API_URL || "https://api-ui.hyperliquid.xyz";

const VAULT_ADDRESS = process.env.VAULT_ADDRESS;
const VAULTS_LIMIT = Number(process.env.VAULTS_LIMIT || 0);
const START_TIME = Number(process.env.VAULT_TRADES_START || 0);
const END_TIME = Number(process.env.VAULT_TRADES_END || Date.now());
const MAX_PAGES = Number(process.env.VAULT_TRADES_MAX_PAGES || 500);
const BATCH_SIZE = Number(process.env.VAULT_TRADES_BATCH_SIZE || 200);
const AGGREGATE_BY_TIME = String(process.env.VAULT_TRADES_AGGREGATE || "false") === "true";

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const log = {
  info: (...args) => console.log("[vault-trades]", ...args),
  warn: (...args) => console.warn("[vault-trades]", ...args),
  error: (...args) => console.error("[vault-trades]", ...args),
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

async function fetchUserFillsByTime(user, startTime, endTime) {
  try {
    return await postInfo("userFillsByTime", {
      user,
      startTime,
      endTime,
      aggregateByTime: AGGREGATE_BY_TIME,
    });
  } catch (error) {
    log.warn("userFillsByTime failed", user, error.message);
    return null;
  }
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

async function ensureVault(pool, vaultAddress) {
  const result = await pool.query("select id from vaults where vault_address = $1", [vaultAddress]);
  if (result.rows.length > 0) return result.rows[0].id;

  const id = randomUUID();
  await pool.query("insert into vaults (id, vault_address, created_at, updated_at) values ($1,$2,now(),now())", [
    id,
    vaultAddress,
  ]);
  return id;
}

async function upsertVaultTrades(pool, vaultId, trades) {
  if (trades.length === 0) return;
  const now = new Date().toISOString();
  const rows = trades.map((trade, index) => ({
    id: randomUUID(),
    vault_id: vaultId,
    tx_hash: trade.hash ?? `${vaultId}-${trade.time ?? now}-${index}`,
    side: trade.side ?? trade.dir ?? null,
    price: toNumber(trade.px),
    size: toNumber(trade.sz),
    pnl: toNumber(trade.closedPnl),
    timestamp: toIso(trade.time),
    source: "fills",
    synced_at: now,
  }));

  const columns = ["id", "vault_id", "tx_hash", "side", "price", "size", "pnl", "timestamp", "source", "synced_at"];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vault_trades", columns, batch);
    const upsertSql = `${sql} on conflict (vault_id, tx_hash) do update set\n      side = excluded.side,\n      price = excluded.price,\n      size = excluded.size,\n      pnl = excluded.pnl,\n      timestamp = excluded.timestamp,\n      source = excluded.source,\n      synced_at = excluded.synced_at`;
    await pool.query(upsertSql, values);
  }
}

async function listVaultAddresses(pool) {
  if (VAULT_ADDRESS) return [VAULT_ADDRESS.toLowerCase()];
  const result = await pool.query(
    `select vault_address from vaults\n     where vault_address is not null\n     order by vault_address asc${VAULTS_LIMIT > 0 ? " limit $1" : ""}`,
    VAULTS_LIMIT > 0 ? [VAULTS_LIMIT] : [],
  );
  return result.rows.map((row) => String(row.vault_address).toLowerCase());
}

async function syncVaultTrades(pool, vaultAddress) {
  const vaultId = await ensureVault(pool, vaultAddress);
  let cursor = START_TIME;
  let pages = 0;
  let total = 0;

  while (cursor < END_TIME && pages < MAX_PAGES) {
    const fills = await fetchUserFillsByTime(vaultAddress, cursor, END_TIME);
    if (!Array.isArray(fills) || fills.length === 0) break;

    await upsertVaultTrades(pool, vaultId, fills);
    total += fills.length;

    const times = fills.map((fill) => Number(fill.time)).filter(Number.isFinite);
    const maxTime = times.length > 0 ? Math.max(...times) : cursor;
    const nextCursor = maxTime + 1;
    if (!Number.isFinite(nextCursor) || nextCursor <= cursor) {
      log.warn("cursor did not advance", { vaultAddress, cursor, maxTime });
      break;
    }

    cursor = nextCursor;
    pages += 1;
  }

  log.info("synced trades", { vaultAddress, total, pages });
}

async function runVaultTradesSync() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const vaults = await listVaultAddresses(pool);
    if (vaults.length === 0) {
      log.warn("no vaults to sync");
      return;
    }
    for (const vaultAddress of vaults) {
      await syncVaultTrades(pool, vaultAddress);
    }
  } finally {
    await pool.end();
  }
}

runVaultTradesSync().catch((error) => {
  log.error(error);
  process.exitCode = 1;
});
