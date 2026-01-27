import type { RouteDefinition } from "./router";
import {
  getVaultByAddress,
  getVaultQuantstats,
  listVaultDepositors,
  listVaultFunding,
  listVaultLedger,
  listVaultPositions,
  listVaultTrades,
  listVaults,
} from "../services/vault-repository";

export const vaultRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/vaults",
    handler: async (request) => {
      const query = (request as any)?.query ?? {};
      const limit = Math.min(Number(query.limit ?? 200), 1000);
      const cursor = query.cursor as string | undefined;
      const items = await listVaults(limit, cursor);
      const nextCursor = items.length > 0 ? items[items.length - 1].vault_address : null;
      return { items, nextCursor };
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultAddress",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const vaultAddress = String(params.vaultAddress ?? "").toLowerCase();
      const item = await getVaultByAddress(vaultAddress);
      return item ?? {};
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultAddress/trades",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const query = (request as any)?.query ?? {};
      const vaultAddress = String(params.vaultAddress ?? "").toLowerCase();
      const limit = Math.min(Number(query.limit ?? 200), 1000);
      const items = await listVaultTrades(vaultAddress, limit);
      return { items };
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultAddress/funding",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const query = (request as any)?.query ?? {};
      const vaultAddress = String(params.vaultAddress ?? "").toLowerCase();
      const limit = Math.min(Number(query.limit ?? 200), 1000);
      const items = await listVaultFunding(vaultAddress, limit);
      return { items };
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultAddress/ledger",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const query = (request as any)?.query ?? {};
      const vaultAddress = String(params.vaultAddress ?? "").toLowerCase();
      const limit = Math.min(Number(query.limit ?? 200), 1000);
      const items = await listVaultLedger(vaultAddress, limit);
      return { items };
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultAddress/positions",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const vaultAddress = String(params.vaultAddress ?? "").toLowerCase();
      const items = await listVaultPositions(vaultAddress);
      return { items };
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultAddress/depositors",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const vaultAddress = String(params.vaultAddress ?? "").toLowerCase();
      const items = await listVaultDepositors(vaultAddress);
      return { items };
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultAddress/quantstats",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const vaultAddress = String(params.vaultAddress ?? "").toLowerCase();
      const item = await getVaultQuantstats(vaultAddress);
      return item ?? {};
    },
  },
];
