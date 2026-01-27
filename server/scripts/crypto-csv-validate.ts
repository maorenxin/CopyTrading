import * as path from "path";
import { promises as fs } from "fs";
import { query } from "../db/postgres";

interface CsvRow {
  time: number;
  open?: string | null;
  high?: string | null;
  low?: string | null;
  close?: string | null;
  volume?: string | null;
}

function normalizeDbSymbol(source: string, rawSymbol: string) {
  const upper = rawSymbol.toUpperCase();
  if (source === "hyperliquid") {
    return upper.endsWith("USDT") ? upper.slice(0, -4) : upper;
  }
  if (source === "binance") {
    return upper.endsWith("USDT") ? upper : `${upper}USDT`;
  }
  return upper;
}

function normalizeFileSymbol(source: string, symbol: string) {
  const upper = symbol.toUpperCase();
  if (source === "hyperliquid") {
    return upper.endsWith("USDT") ? upper : `${upper}USDT`;
  }
  if (source === "binance") {
    return upper.endsWith("USDT") ? upper : `${upper}USDT`;
  }
  return upper;
}

async function loadCsvRows(filePath: string): Promise<CsvRow[]> {
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
  return rows
    .map((row) => ({
      time: Number(row.time),
      open: row.open ?? null,
      high: row.high ?? null,
      low: row.low ?? null,
      close: row.close ?? null,
      volume: row.volume ?? null,
    }))
    .filter((row) => Number.isFinite(row.time));
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const equalNumber = (left: unknown, right: unknown) => {
  const lnum = toNumber(left);
  const rnum = toNumber(right);
  if (lnum === null && rnum === null) return true;
  if (lnum === null || rnum === null) return false;
  return Math.abs(lnum - rnum) <= 1e-9;
};

async function validateSymbol(params: {
  source: string;
  symbol: string;
  interval: string;
  dirPath: string;
}) {
  const fileSymbol = normalizeFileSymbol(params.source, params.symbol);
  const fileName = `${fileSymbol.toLowerCase()}_${params.interval}_${params.source}.csv`;
  const filePath = path.join(params.dirPath, fileName);
  const csvRows = await loadCsvRows(filePath);
  const dbSymbol = normalizeDbSymbol(params.source, fileSymbol);
  const { rows: dbRows } = await query(
    `select open_time_ms, open, high, low, close, volume
     from crypto_prices_1h
     where source = $1 and symbol = $2 and interval = $3`,
    [params.source, dbSymbol, params.interval],
  );

  const csvMap = new Map<number, CsvRow>();
  csvRows.forEach((row) => {
    if (!csvMap.has(row.time)) csvMap.set(row.time, row);
  });
  const dbMap = new Map<number, any>();
  dbRows.forEach((row: any) => {
    const time = Number(row.open_time_ms);
    if (!Number.isFinite(time)) return;
    if (!dbMap.has(time)) dbMap.set(time, row);
  });

  const missingInDb: number[] = [];
  const extraInDb: number[] = [];
  const mismatches: Array<{ time: number; fields: string[] }> = [];

  csvMap.forEach((csv, key) => {
    const db = dbMap.get(key);
    if (!db) {
      missingInDb.push(key);
      return;
    }
    const diffs: string[] = [];
    if (!equalNumber(csv.open, db.open)) diffs.push("open");
    if (!equalNumber(csv.high, db.high)) diffs.push("high");
    if (!equalNumber(csv.low, db.low)) diffs.push("low");
    if (!equalNumber(csv.close, db.close)) diffs.push("close");
    if (!equalNumber(csv.volume, db.volume)) diffs.push("volume");
    if (diffs.length > 0) {
      mismatches.push({ time: key, fields: diffs });
    }
  });

  dbMap.forEach((_db, key) => {
    if (!csvMap.has(key)) extraInDb.push(key);
  });

  return {
    symbol: params.symbol,
    source: params.source,
    interval: params.interval,
    csvCount: csvMap.size,
    dbCount: dbMap.size,
    missingInDb,
    extraInDb,
    mismatches,
  };
}

async function run() {
  const rootDir = path.resolve(__dirname, "..", "..");
  const dirPath = path.resolve(process.env.CRYPTO_VALIDATE_DIR || path.join(rootDir, "crypto_data"));
  const interval = (process.env.CRYPTO_VALIDATE_INTERVAL || "1h").toLowerCase();
  const source = (process.env.CRYPTO_VALIDATE_SOURCE || "hyperliquid").toLowerCase();
  const symbolsEnv = process.env.CRYPTO_VALIDATE_SYMBOLS || "";
  const symbols = symbolsEnv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (symbols.length === 0) {
    console.warn("[crypto-validate] no symbols provided");
    return;
  }

  const results = [];
  let totalMissing = 0;
  let totalExtra = 0;
  let totalMismatch = 0;
  for (const symbol of symbols) {
    const result = await validateSymbol({ source, symbol, interval, dirPath });
    totalMissing += result.missingInDb.length;
    totalExtra += result.extraInDb.length;
    totalMismatch += result.mismatches.length;
    results.push({
      ...result,
      sampleMissing: result.missingInDb.slice(0, 5),
      sampleExtra: result.extraInDb.slice(0, 5),
      sampleMismatches: result.mismatches.slice(0, 5),
    });
  }

  const outputPath =
    process.env.CRYPTO_VALIDATE_OUTPUT ||
    path.join(
      rootDir,
      "specs/004-vault-db-integration/validation/crypto-validate.json",
    );
  const report = {
    generatedAt: new Date().toISOString(),
    source,
    interval,
    totals: {
      symbols: results.length,
      missing: totalMissing,
      extra: totalExtra,
      mismatched: totalMismatch,
      consistent: totalMissing === 0 && totalExtra === 0 && totalMismatch === 0,
    },
    symbols: results,
  };
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf-8");
  console.log("[crypto-validate] report", { output: outputPath, ...report.totals });
}

if (require.main === module) {
  run().catch((error) => {
    console.error("[crypto-validate] failed", { message: (error as Error).message });
    process.exitCode = 1;
  });
}
