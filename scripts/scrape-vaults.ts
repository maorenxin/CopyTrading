import * as fs from 'fs';
import * as path from 'path';
import { fetch, ProxyAgent } from 'undici';

const API_URL = process.env.HYPERLIQUID_API_URL || 'https://api-ui.hyperliquid.xyz';
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const log = {
  info: (...args: unknown[]) => console.log('[scrape-vaults]', ...args),
  warn: (...args: unknown[]) => console.warn('[scrape-vaults]', ...args),
  error: (...args: unknown[]) => console.error('[scrape-vaults]', ...args),
};

interface VaultSummary {
  vaultAddress?: string;
  address?: string;
  vault_address?: string;
  name?: string;
  createTimeMillis?: number;
  relationshipType?: string;
  summary?: Record<string, unknown>;
  vault?: Record<string, unknown>;
  [key: string]: unknown;
}

function pickAddress(item: VaultSummary): string | undefined {
  const s = item?.summary as VaultSummary | undefined;
  return (
    item?.vaultAddress ??
    item?.vault_address ??
    item?.address ??
    s?.vaultAddress ??
    s?.address
  );
}

function pickField(item: VaultSummary, ...keys: string[]): unknown {
  const s = (item?.summary ?? item?.vault ?? item) as Record<string, unknown>;
  for (const k of keys) {
    if (s?.[k] !== undefined) return s[k];
    if (item?.[k] !== undefined) return item[k];
  }
  return undefined;
}

async function fetchVaultSummaries(): Promise<VaultSummary[]> {
  const response = await fetch(`${API_URL}/info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'vaultSummaries' }),
    dispatcher,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API error: ${response.status} ${text}`);
  }
  const data = await response.json() as unknown;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object' && Array.isArray((data as any).vaults)) {
    return (data as any).vaults;
  }
  return [];
}

async function main() {
  log.info('fetching vault summaries...');
  const raw = await fetchVaultSummaries();
  log.info(`received ${raw.length} vaults`);

  const rows: string[] = ['vaultAddress,name,relationshipType,createTimeMillis'];

  let kept = 0;
  for (const item of raw) {
    const addr = pickAddress(item);
    if (!addr) continue;

    const relType = String(pickField(item, 'relationshipType', 'relationship_type') ?? 'normal');
    if (relType.toLowerCase() !== 'normal') continue;

    const name = String(pickField(item, 'name', 'vaultName', 'vault_name') ?? '').replace(/,/g, ' ');
    const createTime = Number(pickField(item, 'createTimeMillis', 'create_time_millis') ?? 0);

    rows.push(`${addr.toLowerCase()},${name},${relType},${createTime}`);
    kept++;
  }

  const outPath = path.resolve(__dirname, '..', 'VAULTS.csv');
  fs.writeFileSync(outPath, rows.join('\n') + '\n');
  log.info(`wrote ${kept} vaults to ${outPath}`);
}

main().catch((err) => {
  log.error(err);
  process.exitCode = 1;
});
