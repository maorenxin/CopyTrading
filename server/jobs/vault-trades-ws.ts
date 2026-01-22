import { log } from "../services/logger";
import {
  selectTopVaultsByAnnualReturn,
  upsertVaultTrades,
  updateVaultWsTradeTime,
} from "../services/vault-repository";
import { attachWebsocketVaults } from "../services/sync-run-service";

const DEFAULT_BASE_URL = "https://api.hyperliquid.xyz";

const buildWsUrl = () => {
  const baseUrl = process.env.HYPERLIQUID_API_URL ?? DEFAULT_BASE_URL;
  if (baseUrl.startsWith("https://")) return `wss://${baseUrl.slice("https://".length)}/ws`;
  if (baseUrl.startsWith("http://")) return `ws://${baseUrl.slice("http://".length)}/ws`;
  return `${baseUrl}/ws`;
};

export async function startVaultTradesStream(): Promise<void> {
  const toNumber = (value: unknown): number | undefined => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const topVaults = await selectTopVaultsByAnnualReturn(10);
  const vaultMap = new Map<string, string>();
  const vaultAddresses = topVaults
    .map((vault: any) => {
      if (vault?.vault_address && vault?.id) {
        vaultMap.set(vault.vault_address.toLowerCase(), vault.id);
      }
      return vault?.vault_address;
    })
    .filter((addr: string | undefined): addr is string => Boolean(addr));

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
      const vaultId = vaultMap.get(user);
      if (!vaultId) return;

      const fills = data.fills ?? [];
      if (!Array.isArray(fills) || fills.length === 0) return;

      const trades = fills.map((fill: any, index: number) => ({
        vaultId,
        txHash: fill.hash ?? fill.tid ?? `${vaultId}-${index}-${fill.time ?? Date.now()}`,
        side: fill.side ?? fill.dir,
        price: toNumber(fill.px ?? fill.price),
        size: toNumber(fill.sz ?? fill.size),
        pnl: toNumber(fill.closedPnl ?? fill.pnl),
        timestamp: fill.time ? new Date(fill.time).toISOString() : new Date().toISOString(),
        source: "ws",
      }));

      await upsertVaultTrades(trades);
      await updateVaultWsTradeTime(vaultId, trades[0]?.timestamp);
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
