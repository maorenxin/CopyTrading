import * as fs from 'fs';
import * as path from 'path';
import { fetch, ProxyAgent } from 'undici';

const STATS_URL = process.env.HYPERLIQUID_STATS_URL || 'https://stats-data.hyperliquid.xyz/Mainnet/vaults';
const MIN_TVL = Number(process.env.VAULT_MIN_TVL || 10000);
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const log = {
  info: (...args: unknown[]) => console.log('[scrape-vaults]', ...args),
  warn: (...args: unknown[]) => console.warn('[scrape-vaults]', ...args),
  error: (...args: unknown[]) => console.error('[scrape-vaults]', ...args),
};

interface StatsVault {
  apr?: number;
  summary?: {
    name?: string;
    vaultAddress?: string;
    leader?: string;
    tvl?: string;
    isClosed?: boolean;
    relationship?: { type?: string };
    createTimeMillis?: number;
  };
  [key: string]: unknown;
}

async function fetchVaultsFromStats(): Promise<StatsVault[]> {
  const response = await fetch(STATS_URL, {
    dispatcher,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Accept: 'application/json',
      Referer: 'https://app.hyperliquid.xyz/',
    },
  } as any);
  if (!response.ok) {
    throw new Error(`stats API error: ${response.status}`);
  }
  const data = await response.json() as unknown;
  if (Array.isArray(data)) return data;
  return [];
}

async function main() {
  log.info('fetching vaults from stats-data...');
  const raw = await fetchVaultsFromStats();
  log.info(`received ${raw.length} vaults`);

  const rows: string[] = ['vaultAddress,name,relationshipType,createTimeMillis'];

  let kept = 0;
  for (const item of raw) {
    const s = item.summary;
    if (!s?.vaultAddress) continue;

    const relType = s.relationship?.type ?? 'normal';
    if (relType.toLowerCase() !== 'normal') continue;
    if (s.isClosed) continue;

    const tvl = parseFloat(s.tvl ?? '0') || 0;
    if (tvl < MIN_TVL) continue;

    const name = (s.name ?? '').replace(/,/g, ' ');
    const createTime = s.createTimeMillis ?? 0;

    rows.push(`${s.vaultAddress.toLowerCase()},${name},${relType},${createTime}`);
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
