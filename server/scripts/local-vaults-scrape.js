"use strict";

const { randomUUID } = require("crypto");
const { Pool } = require("pg");
const { fetch, ProxyAgent } = require("undici");
const fs = require("fs/promises");

const DATABASE_URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  "postgresql://localhost:5432/copytrading";
const API_URL = process.env.HYPERLIQUID_API_URL || "https://api-ui.hyperliquid.xyz";
const VAULTS_URL = "https://app.hyperliquid.xyz/vaults";
const VAULTS_INPUT_PATH = process.env.VAULTS_INPUT_PATH || process.env.VAULTS_SOURCE_PATH;
const BATCH_SIZE = Number(process.env.VAULT_SCRAPE_BATCH_SIZE || 200);
const VAULT_SCRAPE_LIMIT = Number(process.env.VAULT_SCRAPE_LIMIT || 0);

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const log = {
  info: (...args) => console.log("[vault-scrape]", ...args),
  warn: (...args) => console.warn("[vault-scrape]", ...args),
  error: (...args) => console.error("[vault-scrape]", ...args),
};

const pickVaultAddress = (item) => {
  return (
    item?.vaultAddress ??
    item?.vault_address ??
    item?.address ??
    item?.summary?.vaultAddress ??
    item?.summary?.address ??
    item?.vault?.address ??
    item?.vault?.vaultAddress ??
    item?.vault?.vault_address
  );
};

const normalizeVault = (item) => {
  const summary = item?.summary ?? item?.vault ?? item;
  const vaultAddress = pickVaultAddress(summary);
  if (!vaultAddress) return null;
  const leader = summary?.leader ?? item?.managerAddress ?? item?.manager ?? item?.vault?.manager;
  const isClosed = summary?.isClosed;
  const status =
    item?.status ??
    summary?.status ??
    (typeof isClosed === "boolean" ? (isClosed ? "closed" : "active") : undefined);
  return {
    vaultAddress,
    name:
      summary?.name ??
      item?.name ??
      item?.vaultName ??
      item?.vault?.name ??
      item?.vault_name,
    managerAddress: leader ?? item?.creater_address ?? item?.creator_address,
    creatorAddress: leader ?? item?.creater_address ?? item?.creator_address,
    description:
      summary?.description ??
      summary?.desc ??
      summary?.strategy ??
      item?.description ??
      item?.desc ??
      item?.strategy ??
      item?.vault_desc ??
      item?.vault_description,
    status,
  };
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
  const match = html.match(/<script id="__NEXT_DATA__" type="application\\/json">([\\s\\S]*?)<\\/script>/);
  if (!match) {
    const fallback = await fetchVaultSummaries();
    if (Array.isArray(fallback)) return { vaults: fallback, raw: fallback };
    if (fallback && Array.isArray(fallback.vaults)) return { vaults: fallback.vaults, raw: fallback };
    return { vaults: [], raw: null };
  }
  const json = JSON.parse(match[1]);
  const vaults = findVaultArray(json) ?? [];
  return { vaults, raw: json };
}

async function loadVaultsFromFile(path) {
  const raw = await fs.readFile(path, "utf-8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.vaults)) return data.vaults;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
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

async function upsertVaults(pool, vaults) {
  if (vaults.length === 0) return 0;
  const now = new Date().toISOString();
  const rows = vaults.map((vault) => ({
    id: randomUUID(),
    vault_address: vault.vaultAddress,
    name: vault.name ?? null,
    manager_address: vault.managerAddress ?? null,
    creator_address: vault.creatorAddress ?? null,
    description: vault.description ?? null,
    status: vault.status ?? null,
    updated_at: now,
  }));

  const columns = [
    "id",
    "vault_address",
    "name",
    "manager_address",
    "creator_address",
    "description",
    "status",
    "updated_at",
  ];

  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { sql, values } = buildInsert("vaults", columns, batch);
    const upsertSql = `${sql} on conflict (vault_address) do update set\n      name = excluded.name,\n      manager_address = excluded.manager_address,\n      creator_address = excluded.creator_address,\n      description = excluded.description,\n      status = excluded.status,\n      updated_at = excluded.updated_at`;
    await pool.query(upsertSql, values);
    total += batch.length;
  }

  return total;
}

async function runVaultScrape() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    let rawVaults = [];
    if (VAULTS_INPUT_PATH) {
      log.info(`loading vaults from ${VAULTS_INPUT_PATH}`);
      rawVaults = await loadVaultsFromFile(VAULTS_INPUT_PATH);
    } else {
      const scraped = await scrapeVaultsFromPage();
      rawVaults = scraped.vaults ?? [];
    }
    let normalized = rawVaults.map(normalizeVault).filter(Boolean);
    if (VAULT_SCRAPE_LIMIT > 0) {
      normalized = normalized.slice(0, VAULT_SCRAPE_LIMIT);
    }
    log.info(`vaults=${normalized.length}`);
    const count = await upsertVaults(pool, normalized);
    log.info(`upserted=${count}`);
  } finally {
    await pool.end();
  }
}

runVaultScrape().catch((error) => {
  log.error(error);
  process.exitCode = 1;
});
