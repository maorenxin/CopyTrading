import * as fs from 'fs';
import * as path from 'path';
import { fetch, ProxyAgent } from 'undici';

const API_URL = process.env.HYPERLIQUID_API_URL || 'https://api-ui.hyperliquid.xyz';
const START_TIME = Number(process.env.VAULT_TRADES_START || 0);
const END_TIME = Number(process.env.VAULT_TRADES_END || Date.now());
const MAX_PAGES = Number(process.env.VAULT_TRADES_MAX_PAGES || 500);
const SLEEP_MS = Number(process.env.VAULT_SLEEP_MS || 500);
const MAX_RETRIES = 3;

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const log = {
  info: (...args: unknown[]) => console.log('[scrape-cashflows]', ...args),
  warn: (...args: unknown[]) => console.warn('[scrape-cashflows]', ...args),
  error: (...args: unknown[]) => console.error('[scrape-cashflows]', ...args),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FundingEntry {
  time?: number;
  delta?: { usdc?: string | number; type?: string };
  hash?: string;
  [key: string]: unknown;
}

interface LedgerEntry {
  time?: number;
  delta?: { usdc?: string | number; type?: string };
  hash?: string;
  [key: string]: unknown;
}

async function postInfo(type: string, payload: Record<string, unknown>): Promise<unknown> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_URL}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, ...payload }),
        dispatcher,
      });
      if (response.status === 429) {
        const delay = 2000 * Math.pow(2, attempt);
        log.warn(`429 for ${type}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error: ${response.status} ${text}`);
      }
      return response.json();
    } catch (err: any) {
      if (attempt < MAX_RETRIES && err.message?.includes('429')) {
        await sleep(2000 * Math.pow(2, attempt));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${type} failed after ${MAX_RETRIES} retries`);
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

async function scrapeFunding(vault: string, outDir: string): Promise<void> {
  const csvPath = path.join(outDir, `${vault}.csv`);
  const lastTs = getLastTimestamp(csvPath);
  let cursor = lastTs > 0 ? lastTs + 1 : START_TIME;
  let pages = 0;
  let total = 0;

  while (cursor < END_TIME && pages < MAX_PAGES) {
    let data: FundingEntry[];
    try {
      data = (await postInfo('userFunding', {
        user: vault,
        startTime: cursor,
        endTime: END_TIME,
      })) as FundingEntry[];
    } catch (err: any) {
      log.warn(`funding fetch failed for ${vault}: ${err.message}`);
      break;
    }
    if (!Array.isArray(data) || data.length === 0) break;

    data.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

    const isNew = !fs.existsSync(csvPath);
    const header = 'time,USDC';
    const lines = data.map((entry) => {
      const time = entry.time ?? 0;
      const usdc = entry.delta?.usdc ?? 0;
      return `${time},${usdc}`;
    });

    if (lines.length > 0) {
      const content = isNew ? header + '\n' + lines.join('\n') + '\n' : lines.join('\n') + '\n';
      fs.appendFileSync(csvPath, content);
      total += lines.length;
    }

    const times = data.map((e) => Number(e.time)).filter(Number.isFinite);
    const maxTime = times.length > 0 ? Math.max(...times) : cursor;
    const next = maxTime + 1;
    if (!Number.isFinite(next) || next <= cursor) break;
    cursor = next;
    pages++;
  }

  if (total > 0) log.info(`funding ${vault}: +${total}`);
}

async function scrapeLedger(vault: string, outDir: string): Promise<void> {
  const csvPath = path.join(outDir, `${vault}.csv`);
  const lastTs = getLastTimestamp(csvPath);
  let cursor = lastTs > 0 ? lastTs + 1 : START_TIME;
  let pages = 0;
  let total = 0;

  while (cursor < END_TIME && pages < MAX_PAGES) {
    let data: LedgerEntry[];
    try {
      data = (await postInfo('userNonFundingLedgerUpdates', {
        user: vault,
        startTime: cursor,
        endTime: END_TIME,
      })) as LedgerEntry[];
    } catch (err: any) {
      log.warn(`ledger fetch failed for ${vault}: ${err.message}`);
      break;
    }
    if (!Array.isArray(data) || data.length === 0) break;

    data.sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0));

    const isNew = !fs.existsSync(csvPath);
    const header = 'time,ledgerType,USDC';
    const lines = data.map((entry) => {
      const time = entry.time ?? 0;
      const ledgerType = (entry.delta?.type ?? '').toString().replace(/,/g, ' ');
      const usdc = entry.delta?.usdc ?? 0;
      return `${time},${ledgerType},${usdc}`;
    });

    if (lines.length > 0) {
      const content = isNew ? header + '\n' + lines.join('\n') + '\n' : lines.join('\n') + '\n';
      fs.appendFileSync(csvPath, content);
      total += lines.length;
    }

    const times = data.map((e) => Number(e.time)).filter(Number.isFinite);
    const maxTime = times.length > 0 ? Math.max(...times) : cursor;
    const next = maxTime + 1;
    if (!Number.isFinite(next) || next <= cursor) break;
    cursor = next;
    pages++;
  }

  if (total > 0) log.info(`ledger ${vault}: +${total}`);
}

async function main() {
  const vaults = loadVaults();
  if (vaults.length === 0) return;

  const fundingDir = path.resolve(__dirname, '..', 'vault_funding_data');
  const ledgerDir = path.resolve(__dirname, '..', 'vault_nonfunding_ledger');
  fs.mkdirSync(fundingDir, { recursive: true });
  fs.mkdirSync(ledgerDir, { recursive: true });

  log.info(`scraping cashflows for ${vaults.length} vaults...`);

  for (const vault of vaults) {
    await scrapeFunding(vault, fundingDir);
    await scrapeLedger(vault, ledgerDir);
    await sleep(SLEEP_MS);
  }

  log.info('done');
}

main().catch((err) => {
  log.error(err);
  process.exitCode = 1;
});
