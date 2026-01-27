import * as path from "path";
import { promises as fs } from "fs";
import { upsertCryptoRows, upsertCryptoSyncTime } from "../services/crypto-price-downloader";

interface FileInfo {
  source: string;
  symbol: string;
  interval: string;
  filePath: string;
}

function parseFileInfo(fileName: string, dirPath: string): FileInfo | null {
  const match = fileName.match(/^(.+?)_([0-9]+[mhd])_([a-z0-9]+)\.csv$/i);
  if (!match) return null;
  const rawSymbol = match[1];
  const interval = match[2].toLowerCase();
  const source = match[3].toLowerCase();
  const upper = rawSymbol.toUpperCase();
  const symbol =
    source === "hyperliquid"
      ? upper.endsWith("USDT")
        ? upper.slice(0, -4)
        : upper
      : source === "binance"
        ? upper.endsWith("USDT")
          ? upper
          : `${upper}USDT`
        : upper;
  return {
    source,
    symbol,
    interval,
    filePath: path.join(dirPath, fileName),
  };
}

async function loadCsvRows(filePath: string) {
  const content = await fs.readFile(filePath, "utf-8").catch(() => "");
  if (!content.trim()) return [];
  const lines = content.trim().split(/\r?\n/);
  if (lines.length <= 1) return [];
  const header = lines[0].split(",");
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(",");
    const normalized =
      cols.length < header.length
        ? cols.concat(Array(header.length - cols.length).fill(""))
        : cols.slice(0, header.length);
    const row: Record<string, string> = {};
    header.forEach((key, index) => {
      row[key] = normalized[index] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

async function syncFile(info: FileInfo) {
  const rows = await loadCsvRows(info.filePath);
  if (rows.length === 0) {
    console.warn("[crypto-sync] empty csv", { filePath: info.filePath });
    return { file: info.filePath, rows: 0 };
  }

  const normalized = rows
    .map((row) => ({
      time: Number(row.time),
      open: row.open ?? null,
      high: row.high ?? null,
      low: row.low ?? null,
      close: row.close ?? null,
      volume: row.volume ?? null,
    }))
    .filter((row) => Number.isFinite(row.time));

  if (normalized.length === 0) {
    console.warn("[crypto-sync] no valid rows", { filePath: info.filePath });
    return { file: info.filePath, rows: 0 };
  }

  await upsertCryptoRows(info.source, info.symbol, info.interval, normalized as any);
  const maxTime = Math.max(...normalized.map((row) => row.time));
  await upsertCryptoSyncTime(info.source, info.symbol, info.interval, maxTime);

  return { file: info.filePath, rows: normalized.length };
}

async function run() {
  const rootDir = path.resolve(__dirname, "..", "..");
  const dirPath = path.resolve(process.env.CRYPTO_CSV_DIR || path.join(rootDir, "crypto_data"));
  const entries = await fs.readdir(dirPath).catch(() => []);
  const csvFiles = entries.filter((file) => file.endsWith(".csv"));
  if (csvFiles.length === 0) {
    console.warn("[crypto-sync] no csv files", { dirPath });
    return;
  }

  let total = 0;
  for (const fileName of csvFiles) {
    const info = parseFileInfo(fileName, dirPath);
    if (!info) continue;
    const result = await syncFile(info);
    total += result.rows;
    console.log("[crypto-sync] synced", { file: result.file, rows: result.rows });
  }
  console.log("[crypto-sync] complete", { files: csvFiles.length, rows: total });
}

if (require.main === module) {
  run().catch((error) => {
    console.error("[crypto-sync] failed", { message: (error as Error).message });
    process.exitCode = 1;
  });
}
