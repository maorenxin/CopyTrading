import { promises as fs } from "fs";
import path from "path";
import Papa from "papaparse";
import { computeEndPosition } from "./hyperliquid-utils";

interface LocalTradeCsvRow {
  vault_address?: string;
  time?: string | number;
  coin?: string;
  side?: string;
  dir?: string;
  px?: string | number;
  sz?: string | number;
  start_position?: string | number;
  closed_pnl?: string | number;
  hash?: string;
}

interface LocalTradeItem {
  id: string;
  tx_hash: string;
  coin: string;
  side: string;
  size: number;
  price: number;
  pnl: number;
  timestamp: string;
}

interface LocalPositionItem {
  id: string;
  symbol: string;
  side: "long" | "short";
  size: number;
  quantity: number;
  entry_price: number;
  mark_price: number;
  position_value: number;
  pnl: number;
  roe_percent: number;
}

const DEFAULT_TRADES_DIR =
  process.env.VAULT_TRADES_CSV_DIR || path.resolve(process.cwd(), "vault_trades_data");

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIso = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  const date = Number.isFinite(parsed) ? new Date(parsed) : new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
};

/**
 * 归一化 vault 地址用于匹配本地 CSV 文件名。
 * @param value - 原始地址。
 * @returns 小写地址。
 */
function normalizeVaultAddress(value: string) {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * 解析本地交易 CSV。
 * @param vaultAddress - Vault 地址。
 * @returns CSV 行数组。
 */
async function loadTradeCsvRows(vaultAddress: string): Promise<LocalTradeCsvRow[]> {
  const address = normalizeVaultAddress(vaultAddress);
  if (!address) return [];
  const filePath = path.join(DEFAULT_TRADES_DIR, `${address}.csv`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    if (!content.trim()) return [];
    const parsed = Papa.parse<LocalTradeCsvRow>(content, {
      header: true,
      skipEmptyLines: true,
    });
    return parsed.data ?? [];
  } catch {
    return [];
  }
}

/**
 * 将交易方向转换为 long/short。
 * @param dir - 交易方向描述。
 * @param side - 侧向字段。
 * @returns long 或 short。
 */
function normalizeSide(dir?: string, side?: string): "long" | "short" {
  const raw = `${dir ?? ""} ${side ?? ""}`.toLowerCase();
  if (raw.includes("short") || raw.includes("sell")) return "short";
  if (raw.includes("long") || raw.includes("buy")) return "long";
  return "long";
}

/**
 * 尝试用方向推导持仓变动。
 * @param current - 当前持仓。
 * @param size - 变动数量。
 * @param dir - 交易方向。
 * @returns 更新后的持仓。
 */
function applyPositionDelta(current: number, size: number, dir?: string): number {
  if (!dir || !Number.isFinite(size)) return current;
  const normalized = String(dir).toLowerCase();
  const isOpen = normalized.includes("open");
  const isClose = normalized.includes("close");
  const isLong = normalized.includes("long") || normalized.includes("buy");
  const isShort = normalized.includes("short") || normalized.includes("sell");
  if ((isOpen && isLong) || (isClose && isShort)) {
    return current + size;
  }
  if ((isOpen && isShort) || (isClose && isLong)) {
    return current - size;
  }
  return current;
}

/**
 * 从本地 CSV 读取交易记录。
 * @param vaultAddress - Vault 地址。
 * @param limit - 返回条数上限。
 * @returns 交易记录数组。
 */
export async function loadLocalVaultTrades(
  vaultAddress: string,
  limit: number,
): Promise<LocalTradeItem[]> {
  const rows = await loadTradeCsvRows(vaultAddress);
  if (rows.length === 0) return [];
  const items = rows
    .map((row, index) => {
      const timestamp = toIso(row.time);
      if (!timestamp) return null;
      const tx = row.hash ?? `${vaultAddress}-${row.time ?? index}`;
      return {
        id: tx,
        tx_hash: tx,
        coin: row.coin ?? "BTC",
        side: normalizeSide(row.dir, row.side),
        size: toNumber(row.sz, 0),
        price: toNumber(row.px, 0),
        pnl: toNumber(row.closed_pnl, 0),
        timestamp,
      };
    })
    .filter(Boolean) as LocalTradeItem[];

  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return items.slice(0, Math.max(1, limit));
}

/**
 * 从本地 CSV 计算最新仓位。
 * @param vaultAddress - Vault 地址。
 * @returns 最新仓位数组。
 */
export async function loadLocalVaultPositions(vaultAddress: string): Promise<LocalPositionItem[]> {
  const rows = await loadTradeCsvRows(vaultAddress);
  if (rows.length === 0) return [];

  const sorted = rows
    .map((row) => ({
      ...row,
      timeNum: toNumber(row.time, 0),
    }))
    .sort((a, b) => a.timeNum - b.timeNum);

  const positions = new Map<string, number>();
  const lastPriceMap = new Map<string, number>();

  sorted.forEach((row) => {
    const coin = row.coin ?? "BTC";
    const size = toNumber(row.sz, 0);
    const price = toNumber(row.px, 0);
    if (Number.isFinite(price) && price > 0) {
      lastPriceMap.set(coin, price);
    }
    const startPosition = toNumber(row.start_position, NaN);
    const endPosition = Number.isFinite(startPosition)
      ? computeEndPosition(startPosition, size, row.dir ?? row.side)
      : undefined;
    if (typeof endPosition === "number" && Number.isFinite(endPosition)) {
      positions.set(coin, endPosition);
      return;
    }
    const current = positions.get(coin) ?? 0;
    const next = applyPositionDelta(current, size, row.dir ?? row.side);
    positions.set(coin, next);
  });

  return Array.from(positions.entries())
    .filter(([, size]) => Math.abs(size) > 0)
    .map(([symbol, size]) => {
      const price = lastPriceMap.get(symbol) ?? 0;
      const absSize = Math.abs(size);
      return {
        id: `${normalizeVaultAddress(vaultAddress)}-${symbol}`,
        symbol,
        side: size >= 0 ? "long" : "short",
        size: absSize,
        quantity: absSize,
        entry_price: price,
        mark_price: price,
        position_value: absSize * price,
        pnl: 0,
        roe_percent: 0,
      };
    });
}
