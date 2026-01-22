import type { RouteDefinition } from "./router";
import { listSyncRuns } from "../services/vault-repository";

export const syncRunRoutes: RouteDefinition[] = [
  {
    method: "GET",
    path: "/sync-runs",
    handler: async (request) => {
      const query = (request as any)?.query ?? {};
      const limit = Math.min(Number(query.limit ?? 50), 200);
      const items = await listSyncRuns(limit);
      return { items };
    },
  },
];
