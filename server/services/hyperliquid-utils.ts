import * as Papa from "papaparse";
import * as fs from "fs/promises";
import * as path from "path";
import { log } from "./logger";

// === 类型 ===
export interface VaultAddressEntry {
  vaultAddress: string;
  createTimeMillis?: number;
}

export interface ScrapeByWindowOptions<T> {
  startTime: number;
  endTime: number;
  windowMs: number;
  fetchWindow: (windowStart: number, windowEnd: number) => Promise<T[]>;
  label: string;
  retry: number;
  retryDelayMs: number;
  delayMs: number;
  rateLimitDelayMs: number;
  batchLimit: number;
  minWindowMs: number;
  maxSplitDepth: number;
  logContext?: Record<string, unknown>;
}

// === 解析工具 ===
/**
 * 解析对象或 JSON 字符串为记录对象。
 * @param value - 可能是对象或 JSON 字符串的输入。
 * @returns 解析后的对象，失败时返回空对象。
 */
export function parseJsonMaybe(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

// === 文件/CSV 工具 ===
/**
 * 从 CSV 读取 vault 地址并按条件过滤。
 * @param minTvl - 最小 TVL 过滤条件。
 * @param limit - 返回条数上限。
 * @param relationshipType - 关系类型过滤条件。
 * @param csvPath - CSV 文件路径。
 * @returns 去重后的 vault 列表（含可选创建时间）。
 */
export async function loadVaultAddressesFromCsv(
  minTvl = 1000,
  limit = -1,
  relationshipType = "normal",
  csvPath = process.env.VAULTS_CSV_PATH || "VAULTS.csv",
): Promise<VaultAddressEntry[]> {
  let csvText: string | null = null;
  try {
    csvText = await fs.readFile(csvPath, "utf-8");
  } catch {
    if (csvPath !== "vaults.csv") {
      csvText = await fs.readFile("vaults.csv", "utf-8");
    }
  }
  if (!csvText) {
    throw new Error("vaults csv file not found");
  }

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors && parsed.errors.length > 0) {
    log("warn", "vaults csv parse errors", { count: parsed.errors.length });
  }
  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  const entries = rows
    .map((row: any) => ({
      vaultAddress: row?.vaultAddress ?? row?.vault_address ?? row?.vault ?? null,
      tvl: Number(row?.tvl ?? row?.TVL ?? row?.Tvl ?? 0),
      relationshipType: row?.relationshipType ?? relationshipType,
      createTimeMillis: Number(
        row?.createTimeMillis ?? row?.create_time_millis ?? row?.create_time_ms ?? NaN,
      ),
    }))
    .filter((row) => row.vaultAddress && row.tvl >= minTvl)
    .filter((row) => row.relationshipType === relationshipType)
    .map((row) => ({
      vaultAddress: String(row.vaultAddress),
      createTimeMillis: Number.isFinite(row.createTimeMillis) ? row.createTimeMillis : undefined,
    }));
  const uniqueEntries = Array.from(
    new Map(entries.map((entry) => [entry.vaultAddress, entry])).values(),
  );
  return limit > 0 ? uniqueEntries.slice(0, limit) : uniqueEntries;
}

/**
 * 在 CSV 中按地址查找 vault 记录。
 * @param vaultAddress - vault 地址。
 * @param csvPath - CSV 文件路径。
 * @returns 匹配的 vault 记录，未找到时返回 null。
 */
export async function findVaultEntryByAddress(
  vaultAddress: string,
  csvPath = process.env.VAULTS_CSV_PATH || "VAULTS.csv",
): Promise<VaultAddressEntry | null> {
  let csvText: string | null = null;
  try {
    csvText = await fs.readFile(csvPath, "utf-8");
  } catch {
    if (csvPath !== "vaults.csv") {
      csvText = await fs.readFile("vaults.csv", "utf-8");
    }
  }
  if (!csvText) return null;

  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  if (parsed.errors && parsed.errors.length > 0) {
    log("warn", "vaults csv parse errors", { count: parsed.errors.length });
  }

  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  const target = String(vaultAddress).toLowerCase();
  for (const row of rows) {
    const typedRow = row as Record<string, unknown>;
    const address =
      typedRow?.vaultAddress ??
      typedRow?.vault_address ??
      typedRow?.vault ??
      typedRow?.address ??
      null;
    if (!address) continue;
    if (String(address).toLowerCase() !== target) continue;
    const createTimeMillis = Number(
      typedRow?.createTimeMillis ??
        typedRow?.create_time_millis ??
        typedRow?.create_time_ms ??
        NaN,
    );
    return {
      vaultAddress: String(address),
      createTimeMillis: Number.isFinite(createTimeMillis) ? createTimeMillis : undefined,
    };
  }
  return null;
}

/**
 * 根据表头读取 CSV 中最后一条时间值。
 * @param csvPath - CSV 文件路径。
 * @param timeField - 时间列名。
 * @returns 最新时间戳，不存在则返回 undefined。
 */
export async function readLatestTimeFromCsv(csvPath: string, timeField = "time") {
  const csvText = await fs.readFile(csvPath, "utf-8").catch(() => null);
  if (!csvText) return undefined;
  const trimmed = csvText.trim();
  if (!trimmed) return undefined;
  const lines = trimmed.split(/\r?\n/);
  if (lines.length <= 1) return undefined;
  const headerParsed = Papa.parse(lines[0], { skipEmptyLines: true });
  const headerRow = Array.isArray(headerParsed.data) ? headerParsed.data[0] : null;
  const timeIndex = Array.isArray(headerRow)
    ? headerRow.findIndex((value) => String(value).trim() === timeField)
    : -1;
  if (timeIndex < 0) return undefined;
  const lastLine = lines[lines.length - 1];
  const parsed = Papa.parse(lastLine, { skipEmptyLines: true });
  const row = Array.isArray(parsed.data) ? parsed.data[0] : null;
  const timeValue = Array.isArray(row) ? Number(row[timeIndex]) : NaN;
  return Number.isFinite(timeValue) ? timeValue : undefined;
}

/**
 * 追加写入 CSV 并保留已有表头。
 * @param csvPath - CSV 输出路径。
 * @param rows - 需要追加的行。
 * @param options - CSV 选项，例如列顺序。
 * @returns 写入完成后的异步结果。
 */
export async function appendCsvRows(
  csvPath: string,
  rows: Array<Record<string, unknown>>,
  options: { columns?: string[] } = {},
) {
  if (!rows.length) return;
  await fs.mkdir(path.dirname(csvPath), { recursive: true });
  const stat = await fs.stat(csvPath).catch(() => null);
  const hasExisting = Boolean(stat && stat.isFile() && stat.size > 0);
  const csv = Papa.unparse(rows, { header: !hasExisting, columns: options.columns });
  if (hasExisting) {
    let prefix = "";
    if (stat && stat.size > 0) {
      const handle = await fs.open(csvPath, "r");
      try {
        const buffer = Buffer.alloc(1);
        await handle.read(buffer, 0, 1, stat.size - 1);
        if (buffer.toString("utf-8") !== "\n") {
          prefix = "\n";
        }
      } finally {
        await handle.close();
      }
    }
    await fs.appendFile(csvPath, `${prefix}${csv}`, "utf-8");
  } else {
    await fs.writeFile(csvPath, csv, "utf-8");
  }
}

// === 时间工具 ===
/**
 * 延迟指定毫秒数。
 * @param ms - 毫秒数。
 * @returns 延迟完成后的异步结果。
 */
export async function sleep(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// === 窗口抓取 ===
/**
 * 以时间窗方式抓取数据，支持重试与拆分。
 * @param options - 窗口、重试与日志配置。
 * @returns 聚合后的数据列表。
 */
export async function scrapeByWindow<T>(options: ScrapeByWindowOptions<T>) {
  const {
    startTime,
    endTime,
    windowMs,
    fetchWindow,
    label,
    retry,
    retryDelayMs,
    delayMs,
    rateLimitDelayMs,
    batchLimit,
    minWindowMs,
    maxSplitDepth,
    logContext = {},
  } = options;

  type WindowTask = { start: number; end: number; depth: number };
  const tasks: WindowTask[] = [];
  for (let windowStart = startTime; windowStart <= endTime; windowStart += windowMs) {
    const windowEnd = Math.min(windowStart + windowMs - 1, endTime);
    tasks.push({ start: windowStart, end: windowEnd, depth: 0 });
  }

  /**
   * 获取单个窗口数据，包含重试与限流处理。
   * @param windowStart - 窗口起始时间。
   * @param windowEnd - 窗口结束时间。
   * @returns 该窗口的数据数组。
   */
  const fetchWithRetry = async (windowStart: number, windowEnd: number) => {
    let batch: T[] = [];
    let attempt = 0;
    while (attempt <= retry) {
      try {
        batch = await fetchWindow(windowStart, windowEnd);
        break;
      } catch (error) {
        const message = (error as Error).message;
        if (attempt >= retry) {
          log("warn", `${label} window failed`, {
            ...logContext,
            windowStart,
            windowEnd,
            message,
          });
        } else {
          log("warn", `${label} window retry`, {
            ...logContext,
            windowStart,
            windowEnd,
            attempt: attempt + 1,
            message,
          });
          const isRateLimit = message.includes("429");
          await sleep(isRateLimit ? rateLimitDelayMs : retryDelayMs);
        }
      }
      attempt += 1;
    }
    return batch;
  };

  const items: T[] = [];
  while (tasks.length > 0) {
    const task = tasks.shift();
    if (!task) break;
    const { start, end, depth } = task;
    const batch = await fetchWithRetry(start, end);
    if (
      Array.isArray(batch) &&
      batch.length >= batchLimit &&
      end - start + 1 > minWindowMs &&
      depth < maxSplitDepth
    ) {
      const mid = Math.floor((start + end) / 2);
      if (mid > start && mid < end) {
        tasks.unshift({ start: mid + 1, end, depth: depth + 1 });
        tasks.unshift({ start, end: mid, depth: depth + 1 });
        log("warn", `${label} window split`, {
          ...logContext,
          start,
          end,
          mid,
          count: batch.length,
          depth: depth + 1,
        });
        continue;
      }
    }

    if (Array.isArray(batch) && batch.length > 0) {
      items.push(...batch);
    }
    log("info", `${label} window fetched`, {
      ...logContext,
      windowStart: start,
      windowEnd: end,
      count: Array.isArray(batch) ? batch.length : 0,
    });
    await sleep(delayMs);
  }

  return items;
}
