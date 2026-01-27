import { HyperliquidClient } from "../services/hyperliquid-client";
import { scrapeVaultsFromPage } from "../services/hyperliquid-scrapeHLVaults";
import {
  upsertVaults,
  upsertVaultTrades,
  replaceVaultDepositors,
  replaceVaultPositions,
  VaultDepositorInput,
  VaultPositionInput,
  VaultTradeInput,
  VaultUpsertInput,
} from "../services/vault-repository";
import { createSyncRun, completeSyncRun } from "../services/sync-run-service";
import { log } from "../services/logger";
import { computeEndPosition } from "../services/hyperliquid-utils";

const CONCURRENCY = Number(process.env.VAULT_SYNC_CONCURRENCY ?? 5);

const toNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toIso = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === "number") {
    return new Date(value).toISOString();
  }
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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

const toChinaTimestamp = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return chinaFormatter.format(new Date(parsed));
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : chinaFormatter.format(date);
};

const pickVaultAddress = (item: any): string | undefined => {
  return (
    item?.vaultAddress ??
    item?.vault_address ??
    item?.address ??
    item?.summary?.vaultAddress ??
    item?.summary?.address ??
    item?.vault?.address ??
    item?.vault?.vaultAddress
  );
};

const normalizeVault = (item: any): VaultUpsertInput | null => {
  const summary = item?.summary ?? item?.vault ?? item;
  const vaultAddress = pickVaultAddress(summary);
  if (!vaultAddress) return null;
  const isClosed = summary?.isClosed;
  const leader = summary?.leader ?? item?.managerAddress ?? item?.manager ?? item?.vault?.manager;
  const status =
    item?.status ??
    summary?.status ??
    (typeof isClosed === "boolean" ? (isClosed ? "closed" : "active") : undefined);
  return {
    vaultAddress: vaultAddress.toLowerCase(),
    name: summary?.name ?? item?.name ?? item?.vaultName ?? item?.vault?.name,
    managerAddress: leader,
    creatorAddress: leader,
    status,
    description:
      summary?.description ??
      summary?.desc ??
      summary?.strategy ??
      item?.description ??
      item?.desc ??
      item?.strategy,
    tvlUsdc: toNumber(summary?.tvl ?? item?.tvlUsdc ?? item?.tvl ?? item?.vault?.tvl),
    allTimeReturn: toNumber(item?.allTimeReturn ?? item?.return ?? item?.vault?.allTimeReturn),
    annualizedReturn: toNumber(item?.apr ?? item?.annualizedReturn ?? item?.vault?.annualizedReturn),
    sharpe: toNumber(item?.sharpe ?? item?.vault?.sharpe),
    maxDrawdown: toNumber(item?.maxDrawdown ?? item?.vault?.maxDrawdown),
    lastTradeAt: toIso(item?.lastTradeAt ?? item?.lastTradeTime),
  };
};

const normalizeTrades = (vaultAddress: string, raw: any): VaultTradeInput[] => {
  const items = raw?.trades ?? raw?.items ?? raw?.history ?? raw ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((item: any, index: number) => {
    const size = toNumber(item?.size ?? item?.sz ?? item?.qty);
    const dir = item?.dir ?? item?.side ?? item?.type;
    const startPosition = toNumber(item?.start_position ?? item?.startPosition);
    const endPosition = computeEndPosition(startPosition, size, dir);
    return {
      vaultAddress,
      txHash:
        item?.tid ??
        item?.tx_hash ??
        item?.hash ??
        item?.id ??
        `${vaultAddress}-${index}-${item?.time ?? Date.now()}`,
      coin: item?.coin ?? item?.symbol ?? item?.asset,
      side: item?.side ?? item?.dir ?? item?.type,
      price: toNumber(item?.price ?? item?.px),
      size,
      startPosition,
      endPosition,
      pnl: toNumber(item?.pnl ?? item?.closedPnl),
      utcTime: toIso(item?.timestamp ?? item?.time ?? item?.t),
      timestamp: toChinaTimestamp(item?.timestamp ?? item?.time ?? item?.t),
      source: "sync",
    };
  });
};

const normalizePositions = (vaultAddress: string, raw: any): VaultPositionInput[] => {
  const items = raw?.positions ?? raw?.items ?? raw ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => ({
    vaultAddress,
    symbol: item?.symbol ?? item?.coin ?? item?.asset,
    side: item?.side ?? item?.dir ?? item?.type,
    leverage: toNumber(item?.leverage ?? item?.lev),
    quantity: toNumber(item?.quantity ?? item?.sz ?? item?.size),
    entryPrice: toNumber(item?.entryPrice ?? item?.entry_px ?? item?.entry),
    markPrice: toNumber(item?.markPrice ?? item?.mark_px ?? item?.mark),
    positionValue: toNumber(item?.positionValue ?? item?.position_value),
    roePercent: toNumber(item?.roePercent ?? item?.roe),
  }));
};

const normalizeDepositors = (vaultAddress: string, raw: any): VaultDepositorInput[] => {
  const items = raw?.depositors ?? raw?.items ?? raw ?? [];
  if (!Array.isArray(items)) return [];
  return items.map((item: any) => ({
    vaultAddress,
    depositorAddress: item?.address ?? item?.depositor ?? item?.wallet,
    amountUsdc: toNumber(item?.amountUsdc ?? item?.amount ?? item?.usd),
    sharePercent: toNumber(item?.sharePercent ?? item?.share ?? item?.percent),
  }));
};

export async function runVaultSync(): Promise<{ syncRunId: string; status: string }> {
  const client = new HyperliquidClient();
  let vaultSource = "official";
  let rawVaults: any = await client.fetchVaults();
  let vaultList: any[] = Array.isArray(rawVaults) ? rawVaults : rawVaults?.vaults ?? [];

  if (vaultList.length === 0) {
    vaultSource = "fallback";
    const scraped = await scrapeVaultsFromPage();
    rawVaults = scraped.vaults;
    vaultList = Array.isArray(rawVaults) ? rawVaults : rawVaults?.vaults ?? [];
  }
  const normalizedVaults: VaultUpsertInput[] = vaultList
    .map(normalizeVault)
    .filter((vault): vault is VaultUpsertInput => Boolean(vault));

  const syncRun = await createSyncRun(vaultSource, normalizedVaults.length);
  const vaultsWithSync = normalizedVaults.map((vault) => ({
    ...vault,
    lastSyncRunId: syncRun.id,
  }));
  await upsertVaults(vaultsWithSync);

  const queue = normalizedVaults.slice();
  const failedVaults: string[] = [];
  let successCount = 0;

  const worker = async () => {
    while (queue.length > 0) {
      const vault = queue.shift();
      if (!vault) continue;

      try {
        const [tradeData, positionData, depositorData] = await Promise.all([
          client.fetchVaultTrades(vault.vaultAddress),
          client.fetchVaultPositions(vault.vaultAddress),
          client.fetchVaultDepositors(vault.vaultAddress),
        ]);

        const trades = normalizeTrades(vault.vaultAddress, tradeData).map((trade) => ({
          ...trade,
          syncRunId: syncRun.id,
        }));
        const positions = normalizePositions(vault.vaultAddress, positionData).map((position) => ({
          ...position,
          syncRunId: syncRun.id,
        }));
        const depositors = normalizeDepositors(vault.vaultAddress, depositorData).map((depositor) => ({
          ...depositor,
          syncRunId: syncRun.id,
        }));

        await upsertVaultTrades(trades);
        await replaceVaultPositions(vault.vaultAddress, positions);
        await replaceVaultDepositors(vault.vaultAddress, depositors);

        successCount += 1;
      } catch (error) {
        failedVaults.push(vault.vaultAddress);
        log("warn", "vault sync failed", {
          vaultAddress: vault.vaultAddress,
          message: (error as Error).message,
        });
      }
    }
  };

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  const status = failedVaults.length === 0
    ? "success"
    : successCount > 0
      ? "partial"
      : "failed";

  await completeSyncRun(syncRun.id, {
    status,
    success_count: successCount,
    failed_vaults: failedVaults,
    note: `vaults:${normalizedVaults.length}, success:${successCount}, failed:${failedVaults.length}`,
  });

  return { syncRunId: syncRun.id, status };
}
