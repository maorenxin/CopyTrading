import * as fs from 'fs';
import * as path from 'path';
import { fetch, ProxyAgent } from 'undici';

const API_URL = process.env.HYPERLIQUID_API_URL || 'https://api-ui.hyperliquid.xyz';
const START_TIME = Number(process.env.VAULT_TRADES_START || 0);
const END_TIME = Number(process.env.VAULT_TRADES_END || Date.now());
const MAX_PAGES = Number(process.env.VAULT_TRADES_MAX_PAGES || 500);
const SLEEP_MS = Number(process.env.VAULT_SLEEP_MS || 1000);
const MAX_RETRIES = 5;

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const log = {
  info: (...args: unknown[]) => console.log('[scrape-trades]', ...args),
  warn: (...args: unknown[]) => console.warn('[scrape-trades]', ...args),
  error: (...args: unknown[]) => console.error('[scrape-trades]', ...args),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Fill {
  time?: number;
  coin?: string;
  dir?: string;
  side?: string;
  px?: string | number;
  sz?: string | number;
  closedPnl?: string | number;
  fee?: string | number;
  [key: string]: unknown;
}

async function fetchFills(user: string, startTime: number, endTime: number): Promise<Fill[] | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_URL}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'userFillsByTime', user, startTime, endTime }),
        dispatcher,
      });
      if (response.status === 429) {
        const delay = 2000 * Math.pow(2, attempt);
        log.warn(`429 for ${user}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      if (!response.ok) {
        const text = await response.text();
        log.warn(`API error for ${user}: ${response.status} ${text}`);
        return null;
      }
      return (await response.json()) as Fill[];
    } catch (err: any) {
      log.warn(`fetch failed for ${user}: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * Math.pow(2, attempt));
        continue;
      }
      return null;
    }
  }
  return null;
}

function loadVaults(): string[] {
  const csvPath = path.resolve(__dirname, '..', 'VAULTS.csv');
  if (!fs.existsSync(csvPath)) {
    log.error('VAULTS.csv not found');
    return [];
  }
  const lines = fs.readFileSync(csvPath, 'utf-8').trim().split('\n');
  return lines.slice(1).map((line) => line.split(',')[0].trim().toLowerCase()).filter(Boolean);
}

function getLastTimestamp(csvPath: string): number {
  if (!fs.existsSync(csvPath)) return 0;
  const content = fs.readFileSync(csvPath, 'utf-8').trim();
  const lines = content.split('\n');
  if (lines.length < 2) return 0;
  const lastLine = lines[lines.length - 1];
  const time = Number(lastLine.split(',')[0]);
  return Number.isFinite(time) ? time : 0;
}

function appendToCsv(csvPath: string, fills: Fill[]): number {
  const isNew = !fs.existsSync(csvPath);
  const header = 'time,coin,dir,px,sz,closedPnl,fee';
  const lines = fills.map((f) =>
    [
      f.time ?? 0,
      f.coin ?? '',
      f.dir ?? f.side ?? '',
      f.px ?? 0,
      f.sz ?? 0,
      f.closedPnl ?? 0,
      f.fee ?? 0,
    ].join(',')
  );
  if (lines.length === 0) return 0;
  const content = isNew ? header + '\n' + lines.join('\n') + '\n' : lines.join('\n') + '\n';
  fs.appendFileSync(csvPath, content);
  return lines.length;
}

async function scrapeVault(vault: string, outDir: string): Promise<void> {
  const csvPath = path.join(outDir, `${vault}.csv`);
  const lastTs = getLastTimestamp(csvPath);
  let cursor = lastTs > 0 ? lastTs + 1 : START_TIME;
  let pages = 0;
  let total = 0;

  while (cursor < END_TIME && pages < MAX_PAGES) {
    const fills = await fetchFills(vault, cursor, END_TIME);
    if (!Array.isArray(fills) || fills.length === 0) break;

    // Sort by time
    fills.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

    const count = appendToCsv(csvPath, fills);
    total += count;

    const times = fills.map((f) => Number(f.time)).filter(Number.isFinite);
    const maxTime = times.length > 0 ? Math.max(...times) : cursor;
    const next = maxTime + 1;
    if (!Number.isFinite(next) || next <= cursor) break;

    cursor = next;
    pages++;
  }

  if (total > 0) {
    log.info(`${vault}: +${total} trades (${pages} pages)`);
  }
}

async function main() {
  const vaults = loadVaults();
  if (vaults.length === 0) return;

  const outDir = path.resolve(__dirname, '..', 'vault_trades_data');
  fs.mkdirSync(outDir, { recursive: true });

  log.info(`scraping trades for ${vaults.length} vaults...`);

  for (const vault of vaults) {
    await scrapeVault(vault, outDir);
    await sleep(SLEEP_MS);
  }

  log.info('done');
}

main().catch((err) => {
  log.error(err);
  process.exitCode = 1;
});
