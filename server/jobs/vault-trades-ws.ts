import { log } from "../services/logger";
import {
  selectTopVaultsByAnnualReturn,
  upsertVaultTrades,
  updateVaultWsTradeTime,
} from "../services/vault-repository";
import { attachWebsocketVaults } from "../services/sync-run-service";
import { computeEndPosition } from "../services/hyperliquid-utils";

const DEFAULT_BASE_URL = "https://api.hyperliquid.xyz";

const buildWsUrl = () => {
  const baseUrl = process.env.HYPERLIQUID_API_URL ?? DEFAULT_BASE_URL;
  if (baseUrl.startsWith("https://")) return `wss://${baseUrl.slice("https://".length)}/ws`;
  if (baseUrl.startsWith("http://")) return `ws://${baseUrl.slice("http://".length)}/ws`;
  return `${baseUrl}/ws`;
};

/**
 * 订阅 websocket 实时成交流并写入数据库。
 * @returns 执行完成的异步结果。
 */
export async function startVaultTradesStream(): Promise<void> {
  const toNumber = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const toIso = (value: unknown): string => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    const date = new Date(value as string);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  };
  const chinaFormatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const toChinaTimestamp = (value: unknown): string => {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return chinaFormatter.format(new Date(parsed));
    const date = new Date(value as string);
    return Number.isNaN(date.getTime()) ? chinaFormatter.format(new Date()) : chinaFormatter.format(date);
  };
  const topVaults = await selectTopVaultsByAnnualReturn(10);
  const vaultAddresses: string[] = topVaults
    .map((vault: any) => vault?.vault_address)
    .filter((addr: string | undefined): addr is string => Boolean(addr))
    .map((addr: string) => addr.toLowerCase());
  const vaultSet = new Set(vaultAddresses);

  await attachWebsocketVaults(vaultAddresses);

  if (vaultAddresses.length === 0) {
    log("warn", "no vaults found for websocket stream");
    return;
  }

  const wsUrl = buildWsUrl();
  const { WebSocket } = require("undici");
  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    vaultAddresses.forEach((address) => {
      socket.send(
        JSON.stringify({
          method: "subscribe",
          subscription: { type: "userFills", user: address },
        })
      );
    });
    log("info", "vault websocket subscribed", { count: vaultAddresses.length });
  };

  socket.onmessage = async (event: any) => {
    try {
      const payload = typeof event.data === "string" ? event.data : event.data?.toString();
      if (!payload) return;
      const message = JSON.parse(payload);
      if (message?.channel !== "userFills" && message?.channel !== "user") return;

      const data = message?.data ?? {};
      const user = (data.user ?? data?.fills?.[0]?.user ?? "").toLowerCase();
      if (!vaultSet.has(user)) return;

      const fills = data.fills ?? [];
      if (!Array.isArray(fills) || fills.length === 0) return;

      const trades = fills.map((fill: any, index: number) => {
        const size = toNumber(fill.sz ?? fill.size);
        const dir = fill.dir ?? fill.side;
        const startPosition = toNumber(fill.startPosition ?? fill.start_position);
        const endPosition = computeEndPosition(startPosition, size, dir);
        return {
          vaultAddress: user,
          txHash: fill.tid ?? fill.hash ?? `${user}-${index}-${fill.time ?? Date.now()}`,
          coin: fill.coin ?? fill.symbol,
          side: fill.side ?? fill.dir,
          price: toNumber(fill.px ?? fill.price),
          size,
          startPosition,
          endPosition,
          pnl: toNumber(fill.closedPnl ?? fill.pnl),
          utcTime: toIso(fill.time ?? Date.now()),
          timestamp: toChinaTimestamp(fill.time ?? Date.now()),
          source: "ws" as const,
        };
      });

      await upsertVaultTrades(trades);
      await updateVaultWsTradeTime(user, trades[0]?.utcTime);
    } catch (error) {
      log("warn", "vault websocket message failed", { message: (error as Error).message });
    }
  };

  socket.onerror = (error: any) => {
    log("error", "vault websocket error", { message: error?.message ?? "unknown" });
  };

  socket.onclose = () => {
    log("warn", "vault websocket closed");
  };
}
