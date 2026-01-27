import { query } from "../db/postgres";

const EPSILON = 1e-12;

interface TradeEvent {
  timeMs: number;
  coin: string;
  endPosition: number;
}

/**
 * 解析命令行地址参数。
 * @param argv - 命令行参数。
 * @returns 解析后的 vault 地址列表。
 */
function parseVaultAddresses(argv: string[]): string[] {
  const targets = argv
    .filter((value) => value && !value.startsWith("--"))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(targets));
}

/**
 * 解析在场时间统计的结束模式。
 * @returns 结束模式（now 或 last）。
 */
function resolveEndMode(): "now" | "last" {
  const mode = String(process.env.TIME_IN_MARKET_END ?? "last").toLowerCase();
  return mode === "now" ? "now" : "last";
}

/**
 * 加载 vault 的创建时间。
 * @param vaultAddress - vault 地址。
 * @returns 创建时间毫秒数或 undefined。
 */
async function loadVaultCreateTime(vaultAddress: string): Promise<number | undefined> {
  const { rows } = await query<{ create_time_millis: string | number | null }>(
    "select create_time_millis from vault_info where vault_address = $1",
    [vaultAddress],
  );
  const raw = rows?.[0]?.create_time_millis;
  if (raw === null || raw === undefined) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

/**
 * 加载 vault 的交易事件序列。
 * @param vaultAddress - vault 地址。
 * @returns 交易事件列表及缺失统计。
 */
async function loadTradeEvents(vaultAddress: string): Promise<{
  events: TradeEvent[];
  missingCoin: number;
  missingTime: number;
  missingEnd: number;
  maxEventMs?: number;
  minEventMs?: number;
}> {
  const { rows } = await query<{
    coin: string | null;
    end_position: string | number | null;
    event_time: string | null;
  }>(
    `select coin, end_position, coalesce(utc_time, timestamp) as event_time
     from vault_trades
     where lower(vault_address) = $1
     order by coalesce(utc_time, timestamp) asc, tx_hash asc`,
    [vaultAddress.toLowerCase()],
  );

  const events: TradeEvent[] = [];
  let missingCoin = 0;
  let missingTime = 0;
  let missingEnd = 0;
  let minEventMs: number | undefined;
  let maxEventMs: number | undefined;

  rows.forEach((row) => {
    if (!row.coin) {
      missingCoin += 1;
      return;
    }
    const timeMs = row.event_time ? Date.parse(row.event_time) : NaN;
    if (!Number.isFinite(timeMs)) {
      missingTime += 1;
      return;
    }
    const endPosition = Number(row.end_position);
    if (!Number.isFinite(endPosition)) {
      missingEnd += 1;
      return;
    }
    events.push({ timeMs, coin: row.coin, endPosition });
    if (minEventMs === undefined || timeMs < minEventMs) minEventMs = timeMs;
    if (maxEventMs === undefined || timeMs > maxEventMs) maxEventMs = timeMs;
  });

  return {
    events,
    missingCoin,
    missingTime,
    missingEnd,
    maxEventMs,
    minEventMs,
  };
}

/**
 * 计算在场时间占比。
 * @param events - 交易事件。
 * @param startMs - 统计起点时间（毫秒）。
 * @param endMs - 统计终点时间（毫秒）。
 * @returns 在场时间统计结果。
 */
function computeTimeInMarket(
  events: TradeEvent[],
  startMs: number,
  endMs: number,
): { ratio: number; activeMs: number; totalMs: number } {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return { ratio: 0, activeMs: 0, totalMs: 0 };
  }

  const positions = new Map<string, number>();
  let activeCount = 0;
  let activeMs = 0;
  let index = 0;

  const applyEvent = (event: TradeEvent) => {
    const prev = positions.get(event.coin) ?? 0;
    const next = event.endPosition;
    const prevActive = Math.abs(prev) > EPSILON;
    const nextActive = Math.abs(next) > EPSILON;
    if (!prevActive && nextActive) {
      activeCount += 1;
    } else if (prevActive && !nextActive) {
      activeCount = Math.max(0, activeCount - 1);
    }
    positions.set(event.coin, next);
  };

  // 先应用起点之前的事件以还原起始持仓状态。
  while (index < events.length && events[index].timeMs < startMs) {
    applyEvent(events[index]);
    index += 1;
  }

  let lastTime = startMs;
  while (index < events.length) {
    const currentTime = events[index].timeMs;
    if (currentTime > endMs) break;
    if (currentTime > lastTime && activeCount > 0) {
      activeMs += currentTime - lastTime;
    }
    while (index < events.length && events[index].timeMs === currentTime) {
      applyEvent(events[index]);
      index += 1;
    }
    lastTime = currentTime;
  }

  if (endMs > lastTime && activeCount > 0) {
    activeMs += endMs - lastTime;
  }

  const totalMs = Math.max(0, endMs - startMs);
  const ratio = totalMs > 0 ? activeMs / totalMs : 0;
  return { ratio, activeMs, totalMs };
}

/**
 * 写入 vault_info 的在场时间占比。
 * @param vaultAddress - vault 地址。
 * @param ratio - 在场时间占比。
 */
async function updateTimeInMarket(vaultAddress: string, ratio: number): Promise<void> {
  await query(
    "update vault_info set time_in_market = $1, updated_at = $2 where vault_address = $3",
    [ratio, new Date().toISOString(), vaultAddress],
  );
}

/**
 * 针对单个 vault 计算并更新在场时间占比。
 * @param vaultAddress - vault 地址。
 */
async function recomputeForVault(vaultAddress: string): Promise<void> {
  const { events, missingCoin, missingEnd, missingTime, minEventMs, maxEventMs } =
    await loadTradeEvents(vaultAddress);

  if (events.length === 0 || minEventMs === undefined || maxEventMs === undefined) {
    await updateTimeInMarket(vaultAddress, 0);
    console.log(`[time-in-market] ${vaultAddress} empty trades -> 0`);
    return;
  }

  const createTimeMs = await loadVaultCreateTime(vaultAddress);
  const startMs =
    createTimeMs && createTimeMs > 0 ? Math.min(createTimeMs, maxEventMs) : minEventMs;
  const endMode = resolveEndMode();
  const endMs = endMode === "now" ? Date.now() : maxEventMs;

  const { ratio, activeMs, totalMs } = computeTimeInMarket(events, startMs, endMs);
  await updateTimeInMarket(vaultAddress, ratio);

  const activeHours = activeMs / 36e5;
  const totalHours = totalMs / 36e5;
  console.log(
    `[time-in-market] ${vaultAddress} ratio=${ratio.toFixed(6)} activeHours=${activeHours.toFixed(
      2,
    )} totalHours=${totalHours.toFixed(2)} missingCoin=${missingCoin} missingEnd=${missingEnd} missingTime=${missingTime}`,
  );
}

/**
 * 加载需要处理的 vault 地址列表。
 * @returns vault 地址列表。
 */
async function loadVaultAddresses(): Promise<string[]> {
  const { rows } = await query<{ vault_address: string }>(
    "select distinct vault_address from vault_trades",
  );
  return rows.map((row) => row.vault_address.toLowerCase()).filter(Boolean);
}

/**
 * 脚本入口：重算在场时间占比。
 */
async function run(): Promise<void> {
  const targets = parseVaultAddresses(process.argv.slice(2));
  const vaults = targets.length > 0 ? targets : await loadVaultAddresses();
  if (vaults.length === 0) {
    console.warn("[time-in-market] no vaults found");
    return;
  }

  console.log(`[time-in-market] start vaults=${vaults.length}`);
  for (const vaultAddress of vaults) {
    await recomputeForVault(vaultAddress);
  }
  console.log("[time-in-market] done");
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[time-in-market] failed: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
