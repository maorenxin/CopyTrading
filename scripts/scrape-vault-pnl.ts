import * as fs from 'fs';
import * as path from 'path';
import { fetch, ProxyAgent } from 'undici';

const API_URL = process.env.HYPERLIQUID_API_URL || 'https://api-ui.hyperliquid.xyz';
const SLEEP_MS = Number(process.env.VAULT_PNL_SLEEP_MS || 500);
const MAX_RETRIES = 5;

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;

const log = {
  info: (...args: unknown[]) => console.log('[scrape-vault-pnl]', ...args),
  warn: (...args: unknown[]) => console.warn('[scrape-vault-pnl]', ...args),
  error: (...args: unknown[]) => console.error('[scrape-vault-pnl]', ...args),
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PortfolioPeriodData {
  accountValueHistory?: Array<[number, string]>;
  pnlHistory?: Array<[number, string]>;
  [key: string]: unknown;
}

// portfolio is an array of [periodName, data] tuples
type PortfolioEntry = [string, PortfolioPeriodData];

interface VaultDetails {
  name?: string;
  portfolio?: PortfolioEntry[];
  [key: string]: unknown;
}

async function fetchVaultDetails(vaultAddress: string): Promise<VaultDetails | null> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_URL}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'vaultDetails', vaultAddress }),
        dispatcher,
      });
      if (response.status === 429) {
        const delay = 2000 * Math.pow(2, attempt);
        log.warn(`429 for ${vaultAddress}, retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms`);
        await sleep(delay);
        continue;
      }
      if (!response.ok) {
        log.warn(`${vaultAddress}: HTTP ${response.status}`);
        return null;
      }
      return (await response.json()) as VaultDetails;
    } catch (err) {
      if (attempt < MAX_RETRIES) {
        await sleep(2000 * Math.pow(2, attempt));
        continue;
      }
      log.warn(`${vaultAddress}: ${err}`);
      return null;
    }
  }
  return null;
}

function loadVaultAddresses(vaultsCsvPath: string): string[] {
  if (!fs.existsSync(vaultsCsvPath)) return [];
  const lines = fs.readFileSync(vaultsCsvPath, 'utf-8').trim().split('\n');
  if (lines.length < 2) return [];
  // header: vaultAddress,name,...
  return lines.slice(1).map((line) => line.split(',')[0].trim().toLowerCase()).filter(Boolean);
}

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const vaultsCsv = path.resolve(rootDir, 'VAULTS.csv');
  const outDir = path.resolve(rootDir, 'vault_hl_pnl');

  const addresses = loadVaultAddresses(vaultsCsv);
  if (!addresses.length) {
    log.warn('no vaults found in VAULTS.csv');
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  log.info(`fetching vaultDetails for ${addresses.length} vaults...`);

  // Load existing names.json to preserve names for vaults not in current VAULTS.csv
  const namesPath = path.join(outDir, 'names.json');
  let nameMap: Record<string, string> = {};
  if (fs.existsSync(namesPath)) {
    try { nameMap = JSON.parse(fs.readFileSync(namesPath, 'utf-8')); } catch {}
  }

  let success = 0;
  for (const addr of addresses) {
    const details = await fetchVaultDetails(addr);
    if (!details) {
      await sleep(SLEEP_MS);
      continue;
    }

    // Always save name if available
    if (details.name) {
      nameMap[addr] = details.name;
    }

    if (!details.portfolio) {
      log.warn(`${addr}: no portfolio data`);
      await sleep(SLEEP_MS);
      continue;
    }

    const allTimeEntry = details.portfolio.find((p) => Array.isArray(p) && p[0] === 'allTime');
    if (!allTimeEntry) {
      log.warn(`${addr}: no allTime period`);
      await sleep(SLEEP_MS);
      continue;
    }
    const allTime = allTimeEntry[1];

    const accountValueHistory = allTime.accountValueHistory ?? [];
    const pnlHistory = allTime.pnlHistory ?? [];

    if (!accountValueHistory.length) {
      log.warn(`${addr}: empty accountValueHistory`);
      await sleep(SLEEP_MS);
      continue;
    }

    const rows = ['timestamp,accountValue,pnl'];
    for (let i = 0; i < accountValueHistory.length; i++) {
      const [ts, av] = accountValueHistory[i];
      const pnl = i < pnlHistory.length ? pnlHistory[i][1] : '0';
      rows.push(`${ts},${av},${pnl}`);
    }

    const outPath = path.join(outDir, `${addr}.csv`);
    fs.writeFileSync(outPath, rows.join('\n') + '\n');

    // Accumulate daily data from "month" period
    const monthEntry = details.portfolio.find((p) => Array.isArray(p) && p[0] === 'month');
    if (monthEntry) {
      const monthData = monthEntry[1];
      const monthAV = monthData.accountValueHistory ?? [];
      const monthPnl = monthData.pnlHistory ?? [];
      if (monthAV.length > 0) {
        const dailyDir = path.join(rootDir, 'vault_hl_pnl_daily');
        fs.mkdirSync(dailyDir, { recursive: true });
        const dailyPath = path.join(dailyDir, `${addr}.csv`);

        // Read existing timestamps to avoid duplicates
        const existingTs = new Set<number>();
        if (fs.existsSync(dailyPath)) {
          const lines = fs.readFileSync(dailyPath, 'utf-8').split('\n').slice(1);
          for (const line of lines) {
            const ts = parseInt(line.split(',')[0]);
            if (!isNaN(ts)) existingTs.add(ts);
          }
        }

        // Append new data points
        const newRows: string[] = [];
        for (let i = 0; i < monthAV.length; i++) {
          const [ts, av] = monthAV[i];
          if (!existingTs.has(ts)) {
            const pnl = i < monthPnl.length ? monthPnl[i][1] : '0';
            newRows.push(`${ts},${av},${pnl}`);
          }
        }

        if (newRows.length > 0) {
          if (fs.existsSync(dailyPath)) {
            fs.appendFileSync(dailyPath, newRows.join('\n') + '\n');
          } else {
            fs.writeFileSync(dailyPath, 'timestamp,accountValue,pnl\n' + newRows.join('\n') + '\n');
          }
        }
      }
    }

    success++;
    await sleep(SLEEP_MS);
  }

  // Save vault name mapping
  fs.writeFileSync(namesPath, JSON.stringify(nameMap, null, 2) + '\n');
  log.info(`saved ${Object.keys(nameMap).length} vault names to ${namesPath}`);

  log.info(`done: ${success}/${addresses.length} vaults written to ${outDir}`);
}

main().catch((err) => {
  log.error(err);
  process.exitCode = 1;
});
