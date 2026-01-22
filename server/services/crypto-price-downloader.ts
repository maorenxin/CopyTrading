import * as path from "path";
import * as fs from "fs/promises";
import * as Papa from "papaparse";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { log } from "./logger";
import { appendCsvRows, readLatestTimeFromCsv, sleep } from "./hyperliquid-utils";

// === 类型 ===
interface KlineRow extends Record<string, unknown> {
  time: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

type PriceSource = "binance" | "hyperliquid";

interface DownloadTarget {
  name: string;
  symbol: string;
  baseUrl: string;
  outputPath: string;
  source: PriceSource;
}

interface CsvTargetInfo {
  target: DownloadTarget;
  interval: string;
}

// === 对外参数 ===
export interface CryptoDownloadOptions {
  coins: string[];
  outputDir?: string;
  interval?: string;
  startTimeMs?: number;
  endTimeMs?: number;
  delayMs?: number;
  hyperliquidUrl?: string;
  proxyUrl?: string;
  source?: PriceSource;
  forceStartTime?: boolean;
}

// === 常量 ===
const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const BINANCE_FUTURES_URL = "https://fapi.binance.com/fapi/v1/klines";
const CSV_COLUMNS = ["time", "open", "high", "low", "close", "volume"];
const DEFAULT_INTERVAL = "1h";
const DEFAULT_MAX_CANDLES_HYPERLIQUID = 500;
const DEFAULT_MAX_CANDLES_BINANCE = 1500;
const DEFAULT_START_DAYS = 365 * 3;
const fetchFn = undiciFetch;
const COIN_SYMBOL_OVERRIDES: Record<string, string> = {
  KSHIB: "kSHIB",
  KPEPE: "kPEPE",
  KBONK: "kBONK",
};

// === 代理工具 ===
/**
 * 从环境变量或指定参数创建代理实例。
 * @param proxyUrl - 可选代理地址。
 * @returns 代理实例，失败则返回 undefined。
 */
function resolveProxyAgent(proxyUrl?: string): ProxyAgent | undefined {
  const envProxy =
    proxyUrl ||
    process.env.CRYPTO_PROXY ||
    process.env.HTTPS_PROXY ||
    process.env.HTTP_PROXY;
  const host = process.env.CRYPTO_PROXY_HOST;
  const port = process.env.CRYPTO_PROXY_PORT;
  const fallback =
    !envProxy && host && port ? `http://${host}:${port}` : envProxy;
  const resolved = fallback;
  if (!resolved) return undefined;
  try {
    return new ProxyAgent(resolved);
  } catch (error) {
    log("warn", "proxy agent unavailable", { message: (error as Error).message });
    return undefined;
  }
}

// === 时间工具 ===
/**
 * 将 K 线周期转换为毫秒。
 * @param interval - 周期字符串，例如 1h。
 * @returns 毫秒数。
 */
function intervalToMs(interval: string): number {
  const value = Number(interval.slice(0, -1));
  const unit = interval.slice(-1);
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "d") return value * 24 * 60 * 60 * 1000;
  return 0;
}

/**
 * 计算默认起始时间戳。
 * @param nowMs - 当前时间毫秒。
 * @returns 起始时间戳。
 */
function defaultStartTime(nowMs: number): number {
  return nowMs - DEFAULT_START_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * 判断是否还未到下一个周期，避免重复请求。
 * @param nowMs - 当前时间毫秒。
 * @param lastTime - CSV 最新时间。
 * @param intervalMs - 周期毫秒数。
 * @returns 是否跳过下载。
 */
function shouldSkipFreshDownload(
  nowMs: number,
  lastTime: number | undefined,
  intervalMs: number,
): boolean {
  if (!Number.isFinite(lastTime)) return false;
  return Number(nowMs) < Number(lastTime) + intervalMs;
}

// === 币种映射 ===
/**
 * 将币种名称转换为 Hyperliquid 识别的 coin 名称。
 * @param coin - 币种名称。
 * @returns Hyperliquid coin。
 */
function resolveHyperliquidCoin(coin: string) {
  const trimmed = coin.trim();
  if (!trimmed) return trimmed;
  const upper = trimmed.toUpperCase();
  const overridden = COIN_SYMBOL_OVERRIDES[upper] || upper;
  return overridden.endsWith("USDT") ? overridden.slice(0, -4) : overridden;
}

/**
 * 确保 Binance 合约 symbol 格式。
 * @param coin - 币种名称。
 * @returns Binance symbol。
 */
function ensureBinanceSymbol(coin: string) {
  const upper = coin.trim().toUpperCase();
  return upper.endsWith("USDT") ? upper : `${upper}USDT`;
}

/**
 * 生成合约 CSV 输出路径。
 * @param outputDir - 输出目录。
 * @param coin - 币种。
 * @param interval - 周期。
 * @returns CSV 路径。
 */
function resolveFuturesPath(
  outputDir: string,
  coin: string,
  interval: string,
  source: PriceSource,
) {
  const suffix = interval.toLowerCase();
  const upper = coin.toUpperCase();
  const fileSymbol = upper.endsWith("USDT") ? upper : `${upper}USDT`;
  return path.join(
    outputDir,
    `${fileSymbol.toLowerCase()}_${suffix}_${source}.csv`,
  );
}

// === 数据整理 ===
/**
 * 将 Hyperliquid candle 数据转换为 CSV 行。
 * @param candles - Hyperliquid 返回的 candle 数组。
 * @returns CSV 行数组。
 */
function buildRowsFromCandles(candles: any[]): KlineRow[] {
  return candles
    .map((row) => {
      const time =
        Number(row?.t ?? row?.time ?? row?.T ?? row?.startTime ?? row?.openTime);
      if (!Number.isFinite(time)) return null;
      const open = row?.o ?? row?.open;
      const high = row?.h ?? row?.high;
      const low = row?.l ?? row?.low;
      const close = row?.c ?? row?.close;
      const volume = row?.v ?? row?.volume ?? row?.baseVolume ?? row?.vol ?? "0";
      if ([open, high, low, close].some((val) => val === undefined || val === null)) {
        return null;
      }
      return {
        time,
        open: String(open),
        high: String(high),
        low: String(low),
        close: String(close),
        volume: String(volume),
      };
    })
    .filter((row): row is KlineRow => Boolean(row));
}

/**
 * 将 Binance K 线数组转换为 CSV 行。
 * @param candles - Binance 返回的 K 线数组。
 * @returns CSV 行数组。
 */
function buildRowsFromBinance(candles: any[]): KlineRow[] {
  return candles
    .map((row: any[]) => {
      const time = Number(row?.[0]);
      if (!Number.isFinite(time)) return null;
      return {
        time,
        open: String(row?.[1] ?? ""),
        high: String(row?.[2] ?? ""),
        low: String(row?.[3] ?? ""),
        close: String(row?.[4] ?? ""),
        volume: String(row?.[5] ?? "0"),
      };
    })
    .filter((row): row is KlineRow => Boolean(row));
}

// === 数据校验 ===
/**
 * 校验 CSV 中时间间隔是否连续。
 * @param csvPath - CSV 路径。
 * @param intervalMs - 期望的时间间隔毫秒数。
 */
async function validateCsvIntervals(csvPath: string, intervalMs: number) {
  const content = await fs.readFile(csvPath, "utf-8").catch(() => "");
  if (!content) return;
  const lines = content.trim().split(/\r?\n/);
  if (lines.length <= 2) return;
  const header = lines[0].split(",");
  const timeIndex = header.findIndex((value) => value.trim() === "time");
  if (timeIndex < 0) return;
  const times: number[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    const value = Number(cols[timeIndex]);
    if (Number.isFinite(value)) {
      times.push(value);
    }
  }
  if (times.length <= 2) return;
  times.sort((a, b) => a - b);
  let mismatch = 0;
  const samples: Array<{ prev: number; next: number; diff: number }> = [];
  for (let i = 1; i < times.length; i += 1) {
    const diff = times[i] - times[i - 1];
    if (diff !== intervalMs) {
      mismatch += 1;
      if (samples.length < 3) {
        samples.push({ prev: times[i - 1], next: times[i], diff });
      }
    }
  }
  if (mismatch > 0) {
    log("warn", "crypto interval mismatch", {
      csvPath,
      intervalMs,
      mismatch,
      samples,
    });
  }
}

// === 缺口补洞 ===
/**
 * 解析 CSV 文件名为币种与周期。
 * @param fileName - CSV 文件名。
 * @returns 解析结果，失败返回 null。
 */
function parseCsvFileInfo(
  fileName: string,
): { coin: string; interval: string; source: PriceSource } | null {
  const base = path.basename(fileName, ".csv");
  const parts = base.split("_");
  if (parts.length < 3) return null;
  const source = parts[parts.length - 1] as PriceSource;
  if (source !== "binance" && source !== "hyperliquid") return null;
  const interval = parts[parts.length - 2];
  if (!intervalToMs(interval)) return null;
  let symbolPart = parts.slice(0, -2).join("_").toUpperCase();
  if (symbolPart.endsWith("_USDT")) {
    symbolPart = symbolPart.slice(0, -5);
  } else if (symbolPart.endsWith("USDT")) {
    symbolPart = symbolPart.slice(0, -4);
  }
  symbolPart = symbolPart.replace(/_/g, "");
  if (!symbolPart) return null;
  return { coin: symbolPart, interval, source };
}

/**
 * 构造目录内已有 CSV 的下载目标。
 * @param outputDir - 输出目录。
 * @param baseUrl - Hyperliquid 接口地址。
 * @returns 目标列表。
 */
async function buildTargetsFromExistingCsv(
  outputDir: string,
  baseUrl: string,
): Promise<CsvTargetInfo[]> {
  const files = await fs.readdir(outputDir).catch(() => []);
  const targets: CsvTargetInfo[] = [];
  for (const file of files) {
    if (!file.endsWith(".csv")) continue;
    const info = parseCsvFileInfo(file);
    if (!info) continue;
    const symbol =
      info.source === "binance"
        ? ensureBinanceSymbol(info.coin)
        : resolveHyperliquidCoin(info.coin);
    targets.push({
      interval: info.interval,
      target: {
        name: `${info.source}:${symbol}`,
        symbol,
        baseUrl: info.source === "binance" ? BINANCE_FUTURES_URL : baseUrl,
        outputPath: path.join(outputDir, file),
        source: info.source,
      },
    });
  }
  return targets;
}

/**
 * 读取 CSV 中的 K 线行。
 * @param csvPath - CSV 路径。
 * @returns K 线行数组。
 */
async function loadCsvKlineRows(csvPath: string): Promise<KlineRow[]> {
  const content = await fs.readFile(csvPath, "utf-8").catch(() => "");
  if (!content) return [];
  const parsed = Papa.parse(content, { header: true, skipEmptyLines: true });
  const hasErrors = parsed.errors && parsed.errors.length > 0;
  if (hasErrors) {
    log("warn", "crypto csv parse error", { csvPath, count: parsed.errors.length });
  }
  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  const parsedRows = rows
    .map((row: any) => ({
      time: Number(row?.time),
      open: String(row?.open ?? ""),
      high: String(row?.high ?? ""),
      low: String(row?.low ?? ""),
      close: String(row?.close ?? ""),
      volume: String(row?.volume ?? ""),
    }))
    .filter((row) => Number.isFinite(row.time));
  if (!hasErrors) {
    return parsedRows;
  }
  const lines = content.trim().split(/\r?\n/);
  if (lines.length <= 1) return parsedRows;
  const header = lines[0].split(",");
  const timeIndex = header.findIndex((value) => value.trim() === "time");
  if (timeIndex < 0) return parsedRows;
  const fallbackRows: KlineRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split(",");
    if (cols.length < 6) continue;
    const time = Number(cols[timeIndex]);
    if (!Number.isFinite(time)) continue;
    const open = cols[timeIndex + 1] ?? "";
    const high = cols[timeIndex + 2] ?? "";
    const low = cols[timeIndex + 3] ?? "";
    const close = cols[timeIndex + 4] ?? "";
    const volume = cols[timeIndex + 5] ?? "";
    fallbackRows.push({
      time,
      open: String(open).replace(/"/g, ""),
      high: String(high).replace(/"/g, ""),
      low: String(low).replace(/"/g, ""),
      close: String(close).replace(/"/g, ""),
      volume: String(volume).replace(/"/g, ""),
    });
  }
  return fallbackRows.length ? fallbackRows : parsedRows;
}

/**
 * 将 K 线行写回 CSV（按时间去重并排序）。
 * @param csvPath - CSV 路径。
 * @param rows - K 线行数组。
 */
async function writeCsvKlineRows(csvPath: string, rows: KlineRow[]) {
  if (!rows.length) return;
  const rowMap = new Map<number, KlineRow>();
  for (const row of rows) {
    rowMap.set(row.time, row);
  }
  const merged = Array.from(rowMap.values()).sort((a, b) => a.time - b.time);
  const csv = Papa.unparse(merged, { header: true, columns: CSV_COLUMNS });
  await fs.writeFile(csvPath, csv, "utf-8");
}

/**
 * 查找时间序列中的缺口区间。
 * @param times - 已排序的时间数组。
 * @param intervalMs - 期望间隔。
 * @returns 缺口区间列表。
 */
function findTimeGaps(times: number[], intervalMs: number) {
  const gaps: Array<{ start: number; end: number; diff: number }> = [];
  for (let i = 1; i < times.length; i += 1) {
    const prev = times[i - 1];
    const next = times[i];
    const diff = next - prev;
    if (diff > intervalMs) {
      const start = prev + intervalMs;
      const end = next - intervalMs;
      if (start <= end) {
        gaps.push({ start, end, diff });
      }
    }
  }
  return gaps;
}

/**
 * 对 CSV 缺口进行补洞并重排。
 * @param target - 下载目标配置。
 * @param interval - K 线周期。
 * @param intervalMs - 周期毫秒数。
 * @param delayMs - 请求延迟。
 * @param dispatcher - 代理配置。
 */
async function fillCsvGaps(
  target: DownloadTarget,
  interval: string,
  intervalMs: number,
  delayMs: number,
  dispatcher?: ProxyAgent,
) {
  const rows = await loadCsvKlineRows(target.outputPath);
  if (rows.length <= 1) return;
  const times = rows.map((row) => row.time).sort((a, b) => a - b);
  const gaps = findTimeGaps(times, intervalMs);
  if (!gaps.length) return;
  log("warn", "crypto gap detected", {
    target: target.name,
    count: gaps.length,
    sample: gaps[0],
  });
  for (const gap of gaps) {
    if (target.source === "binance") {
      await downloadTargetBinance(target, interval, gap.start, gap.end, delayMs, dispatcher);
    } else {
      await downloadTargetHyperliquid(
        target,
        interval,
        gap.start,
        gap.end,
        delayMs,
        dispatcher,
      );
    }
  }
  const mergedRows = await loadCsvKlineRows(target.outputPath);
  await writeCsvKlineRows(target.outputPath, mergedRows);
}

/**
 * 扫描目录内 CSV 并补洞。
 * @param outputDir - 价格数据目录。
 * @param hyperliquidUrl - Hyperliquid 接口。
 * @param delayMs - 请求延迟。
 * @param proxyUrl - 代理地址。
 */
export async function fillCryptoDataGaps(options: {
  outputDir?: string;
  hyperliquidUrl?: string;
  delayMs?: number;
  proxyUrl?: string;
}) {
  const rootDir = path.resolve(__dirname, "..", "..");
  const outputDir = path.resolve(options.outputDir || path.join(rootDir, "crypto_data"));
  const hyperliquidUrl = options.hyperliquidUrl || HYPERLIQUID_INFO_URL;
  const delayMs = Number(options.delayMs ?? 200);
  const dispatcher = resolveProxyAgent(options.proxyUrl);
  const targets = await buildTargetsFromExistingCsv(outputDir, hyperliquidUrl);
  for (const info of targets) {
    const intervalMs = intervalToMs(info.interval);
    if (!intervalMs) continue;
    await fillCsvGaps(info.target, info.interval, intervalMs, delayMs, dispatcher);
    await validateCsvIntervals(info.target.outputPath, intervalMs);
  }
}

// === 抓取逻辑 ===
/**
 * 下载单个目标的 K 线数据并追加写入 CSV。
 * @param target - 下载目标配置。
 * @param interval - K 线周期。
 * @param startTime - 起始时间戳。
 * @param endTime - 结束时间戳。
 * @param delayMs - 每次请求间隔。
 */
async function downloadTargetHyperliquid(
  target: DownloadTarget,
  interval: string,
  startTime: number,
  endTime: number,
  delayMs: number,
  dispatcher?: ProxyAgent,
  options: { collector?: KlineRow[]; writeToFile?: boolean } = {},
) {
  log("info", "crypto download start", {
    target: target.name,
    symbol: target.symbol,
    startTime,
    endTime,
  });
  const intervalMs = intervalToMs(interval);
  if (!intervalMs) {
    throw new Error(`不支持的 interval: ${interval}`);
  }
  const writeToFile = options.writeToFile ?? true;
  if (startTime > endTime) {
    log("info", "crypto download skip", {
      target: target.name,
      symbol: target.symbol,
      startTime,
      endTime,
    });
    return true;
  }

  const maxCandles = Number(
    process.env.CRYPTO_MAX_CANDLES_HYPERLIQUID ?? DEFAULT_MAX_CANDLES_HYPERLIQUID,
  );
  const maxRetries = Number(process.env.CRYPTO_RETRY_LIMIT ?? 5);
  const retryDelayMs = Number(process.env.CRYPTO_RETRY_DELAY_MS ?? 1500);
  const windowMs = intervalMs * maxCandles;
  let cursor = startTime;
  let hasData = false;
  while (cursor <= endTime) {
    const windowEnd = Math.min(endTime, cursor + windowMs);
    let response: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      response = (await fetchFn(
        target.baseUrl,
        dispatcher
          ? {
            dispatcher,
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "candleSnapshot",
              req: {
                coin: target.symbol,
                interval,
                startTime: cursor,
                endTime: windowEnd,
              },
            }),
          }
          : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "candleSnapshot",
              req: {
                coin: target.symbol,
                interval,
                startTime: cursor,
                endTime: windowEnd,
              },
            }),
          },
      )) as any;
      if (response.ok) {
        break;
      }
      if (response.status === 429 && attempt < maxRetries) {
        log("warn", "crypto rate limited, retry", {
          target: target.name,
          status: response.status,
          attempt,
        });
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      const text = await response.text();
      throw new Error(`${target.name} 请求失败: ${response.status} ${text}`);
    }
    if (!response || !response.ok) {
      throw new Error(`${target.name} 请求失败`);
    }
    const payload = (await response.json()) as any;
    if (payload && typeof payload === "object" && "error" in payload) {
      throw new Error("HYPERLIQUID_SYMBOL_NOT_FOUND");
    }
    const data = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.candles)
          ? payload.candles
          : [];
    if (!Array.isArray(data) || data.length === 0) {
      cursor = windowEnd + intervalMs;
      if (cursor > endTime) {
        break;
      }
      continue;
    }
    const rows = buildRowsFromCandles(data);
    if (rows.length > 0) {
      hasData = true;
      if (writeToFile) {
        await appendCsvRows(target.outputPath, rows, { columns: CSV_COLUMNS });
      }
      if (options.collector) {
        options.collector.push(...rows);
      }
      const lastOpenTime = rows[rows.length - 1]?.time ?? 0;
      if (!Number.isFinite(lastOpenTime)) {
        break;
      }
      log("info", "crypto download batch", {
        target: target.name,
        count: rows.length,
        lastOpenTime,
      });
      cursor = lastOpenTime + intervalMs;
    } else {
      cursor = windowEnd + intervalMs;
    }
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
  return hasData;
}

async function downloadTargetBinance(
  target: DownloadTarget,
  interval: string,
  startTime: number,
  endTime: number,
  delayMs: number,
  dispatcher?: ProxyAgent,
  options: { collector?: KlineRow[]; writeToFile?: boolean } = {},
) {
  log("info", "crypto download start", {
    target: target.name,
    symbol: target.symbol,
    startTime,
    endTime,
  });
  const intervalMs = intervalToMs(interval);
  if (!intervalMs) {
    throw new Error(`不支持的 interval: ${interval}`);
  }
  const writeToFile = options.writeToFile ?? true;
  if (startTime > endTime) {
    log("info", "crypto download skip", {
      target: target.name,
      symbol: target.symbol,
      startTime,
      endTime,
    });
    return true;
  }

  const maxCandles = Number(
    process.env.CRYPTO_MAX_CANDLES_BINANCE ?? DEFAULT_MAX_CANDLES_BINANCE,
  );
  const maxRetries = Number(process.env.CRYPTO_RETRY_LIMIT ?? 10);
  const retryDelayMs = Number(process.env.CRYPTO_RETRY_DELAY_MS ?? 1500);
  const windowMs = intervalMs * maxCandles;
  let cursor = startTime;
  let hasData = false;
  while (cursor <= endTime) {
    const windowEnd = Math.min(endTime, cursor + windowMs);
    const params = new URLSearchParams({
      symbol: target.symbol,
      interval,
      startTime: String(cursor),
      endTime: String(windowEnd),
      limit: String(maxCandles),
    });
    let response: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      response = (await fetchFn(
        `${target.baseUrl}?${params.toString()}`,
        dispatcher ? { dispatcher } : undefined,
      )) as any;
      if (response.ok) {
        break;
      }
      if (response.status === 429 && attempt < maxRetries) {
        log("warn", "crypto rate limited, retry", {
          target: target.name,
          status: response.status,
          attempt,
        });
        await sleep(retryDelayMs * (attempt + 1));
        continue;
      }
      const text = await response.text();
      throw new Error(`${target.name} 请求失败: ${response.status} ${text}`);
    }
    if (!response || !response.ok) {
      throw new Error(`${target.name} 请求失败`);
    }
    const payload = (await response.json()) as any;
    if (!Array.isArray(payload)) {
      if (payload && typeof payload === "object" && "code" in payload) {
        if (Number(payload.code) === -1121) {
          throw new Error("BINANCE_SYMBOL_NOT_FOUND");
        }
        throw new Error(`BINANCE_ERROR_${payload.code}`);
      }
      throw new Error("BINANCE_INVALID_RESPONSE");
    }
    if (payload.length === 0) {
      cursor = windowEnd + intervalMs;
      if (cursor > endTime) {
        break;
      }
      continue;
    }
    const rows = buildRowsFromBinance(payload);
    if (rows.length > 0) {
      hasData = true;
      if (writeToFile) {
        await appendCsvRows(target.outputPath, rows, { columns: CSV_COLUMNS });
      }
      if (options.collector) {
        options.collector.push(...rows);
      }
      const lastOpenTime = rows[rows.length - 1]?.time ?? 0;
      if (!Number.isFinite(lastOpenTime)) {
        break;
      }
      log("info", "crypto download batch", {
        target: target.name,
        count: rows.length,
        lastOpenTime,
      });
      cursor = lastOpenTime + intervalMs;
    } else {
      cursor = windowEnd + intervalMs;
    }
    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }
  if (!hasData) {
    throw new Error("BINANCE_NO_DATA");
  }
  return true;
}

// === 对外入口 ===
/**
 * 下载币种价格数据（支持增量追加）。
 * @param options - 下载参数。
 */
export async function downloadCryptoPrices(options: CryptoDownloadOptions) {
  const rootDir = path.resolve(__dirname, "..", "..");
  const outputDir = path.resolve(options.outputDir || path.join(rootDir, "crypto_data"));
  const interval = options.interval || DEFAULT_INTERVAL;
  const nowMs = Date.now();
  const endTime = Number(options.endTimeMs ?? nowMs);
  const delayMs = Number(options.delayMs ?? 200);
  const hyperliquidUrl = options.hyperliquidUrl || HYPERLIQUID_INFO_URL;
  const coins = (options.coins || []).map((value) => value.trim()).filter(Boolean);
  const source = (options.source || "hyperliquid") as PriceSource;
  const forceStartTime = Boolean(options.forceStartTime);

  const intervalMs = intervalToMs(interval);
  if (!intervalMs) {
    throw new Error(`不支持的 interval: ${interval}`);
  }
  const hasStartTime = Number.isFinite(options.startTimeMs);
  const defaultStartMs = hasStartTime
    ? Number(options.startTimeMs)
    : defaultStartTime(nowMs);
  const dispatcher = resolveProxyAgent(options.proxyUrl);

  for (const coin of coins) {
    const symbol =
      source === "binance" ? ensureBinanceSymbol(coin) : resolveHyperliquidCoin(coin);
    const outputPath = resolveFuturesPath(outputDir, coin, interval, source);
    const target: DownloadTarget = {
      name: `${source}:${symbol}`,
      symbol,
      baseUrl: source === "binance" ? BINANCE_FUTURES_URL : hyperliquidUrl,
      outputPath,
      source,
    };

    const existingRows = forceStartTime ? await loadCsvKlineRows(outputPath) : [];
    const lastTime = hasStartTime || forceStartTime
      ? undefined
      : await readLatestTimeFromCsv(outputPath, "time");
    if (!hasStartTime && !forceStartTime && shouldSkipFreshDownload(nowMs, lastTime, intervalMs)) {
      log("info", "crypto download skip (latest within interval)", {
        target: target.name,
        symbol: target.symbol,
        lastTime,
        nowMs,
      });
      continue;
    }
    const startTime =
      typeof lastTime === "number" ? lastTime + intervalMs : defaultStartMs;

    const collector: KlineRow[] = [];
    try {
      if (source === "binance") {
        await downloadTargetBinance(
          target,
          interval,
          startTime,
          endTime,
          delayMs,
          dispatcher,
          {
            collector: forceStartTime ? collector : undefined,
            writeToFile: !forceStartTime,
          },
        );
      } else {
        await downloadTargetHyperliquid(
          target,
          interval,
          startTime,
          endTime,
          delayMs,
          dispatcher,
          {
            collector: forceStartTime ? collector : undefined,
            writeToFile: !forceStartTime,
          },
        );
      }
    } catch (error) {
      log("warn", "crypto download failed", {
        target: target.name,
        message: (error as Error).message,
      });
      continue;
    }

    if (forceStartTime && hasStartTime) {
      const replaceStart = Number(options.startTimeMs);
      const replaceEnd = endTime;
      const retained = existingRows.filter(
        (row) => row.time < replaceStart || row.time > replaceEnd,
      );
      const merged = retained.concat(collector);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await writeCsvKlineRows(outputPath, merged);
      await validateCsvIntervals(outputPath, intervalMs);
      continue;
    }

    const mergedRows = await loadCsvKlineRows(outputPath);
    if (mergedRows.length > 0) {
      await writeCsvKlineRows(outputPath, mergedRows);
      await fillCsvGaps(target, interval, intervalMs, delayMs, dispatcher);
      await validateCsvIntervals(outputPath, intervalMs);
    }
  }
}

// === 命令行入口 ===
/**
 * 下载指定币种的 K 线数据。
 */
async function run() {
  const rootDir = path.resolve(__dirname, "..", "..");
  const outputDir = path.resolve(process.env.CRYPTO_DATA_DIR || path.join(rootDir, "crypto_data"));
  const interval = process.env.CRYPTO_INTERVAL || DEFAULT_INTERVAL;
  const nowMs = Date.now();
  const endTime = Number(process.env.CRYPTO_DATA_END_TIME ?? nowMs);
  const delayMs = Number(process.env.CRYPTO_DATA_DELAY_MS ?? 500);
  const hyperliquidUrl = process.env.CRYPTO_HYPERLIQUID_URL || HYPERLIQUID_INFO_URL;
  const gapFillAll = String(process.env.CRYPTO_GAP_FILL_ALL ?? "0").toLowerCase() == "1";
  const sourceEnv =
    process.env.CRYPTO_SOURCE || process.env.CRYPTO_DATA_SOURCE || process.env.CRYPTO_PLATFORM;
  const coinsEnv = process.env.CRYPTO_COINS || "BTC";
  const coins = coinsEnv
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const proxyUrl = process.env.CRYPTO_PROXY;
  const startTimeEnv = process.env.CRYPTO_DATA_START_TIME;
  const forceStart = String(process.env.CRYPTO_FORCE_START_TIME ?? "0") === "1";

  if (gapFillAll) {
    await fillCryptoDataGaps({
      outputDir,
      hyperliquidUrl,
      delayMs,
      proxyUrl,
    });
    return;
  }

  await downloadCryptoPrices({
    coins,
    outputDir,
    interval,
    startTimeMs: startTimeEnv ? Number(startTimeEnv) : undefined,
    endTimeMs: endTime,
    delayMs,
    hyperliquidUrl,
    proxyUrl,
    source: sourceEnv === "binance" ? "binance" : "hyperliquid",
    forceStartTime: forceStart,
  });
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[error] crypto download failed: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
