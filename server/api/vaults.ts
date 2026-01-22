import type { RouteDefinition } from "./router";
import {
  getVaultById,
  listVaultDepositors,
  listVaultPositions,
  listVaultTrades,
  listVaults,
} from "../services/vault-repository";
import { runVaultSync } from "../jobs/vault-sync";

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
    method: "POST",
    path: "/vaults/sync",
    handler: async () => {
      const result = await runVaultSync();
      return { syncRunId: result.syncRunId, status: result.status };
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultId",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const vaultId = params.vaultId as string;
      const item = await getVaultById(vaultId);
      return item ?? {};
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultId/trades",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const query = (request as any)?.query ?? {};
      const vaultId = params.vaultId as string;
      const limit = Math.min(Number(query.limit ?? 200), 1000);
      const items = await listVaultTrades(vaultId, limit);
      return { items };
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultId/positions",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const vaultId = params.vaultId as string;
      const items = await listVaultPositions(vaultId);
      return { items };
    },
  },
  {
    method: "GET",
    path: "/vaults/:vaultId/depositors",
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const vaultId = params.vaultId as string;
      const items = await listVaultDepositors(vaultId);
      return { items };
    },
  },
];
