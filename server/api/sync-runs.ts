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
      const normalized = items.map((item: any) => {
        const {
          reconcile_csv_vaults_count,
          reconcile_db_vaults_count,
          reconcile_csv_trades_count,
          reconcile_db_trades_count,
          reconcile_csv_positions_count,
          reconcile_db_positions_count,
          reconcile_csv_depositors_count,
          reconcile_db_depositors_count,
          reconcile_diff_vaults_count,
          reconcile_diff_trades_count,
          reconcile_diff_positions_count,
          reconcile_diff_depositors_count,
          ...rest
        } = item ?? {};

        const hasSummary = [
          reconcile_csv_vaults_count,
          reconcile_db_vaults_count,
          reconcile_csv_trades_count,
          reconcile_db_trades_count,
          reconcile_csv_positions_count,
          reconcile_db_positions_count,
          reconcile_csv_depositors_count,
          reconcile_db_depositors_count,
          reconcile_diff_vaults_count,
          reconcile_diff_trades_count,
          reconcile_diff_positions_count,
          reconcile_diff_depositors_count,
        ].some((value) => value !== null && value !== undefined);

        return {
          ...rest,
          reconcile_summary: hasSummary
            ? {
                csv_vaults_count: reconcile_csv_vaults_count ?? null,
                db_vaults_count: reconcile_db_vaults_count ?? null,
                csv_trades_count: reconcile_csv_trades_count ?? null,
                db_trades_count: reconcile_db_trades_count ?? null,
                csv_positions_count: reconcile_csv_positions_count ?? null,
                db_positions_count: reconcile_db_positions_count ?? null,
                csv_depositors_count: reconcile_csv_depositors_count ?? null,
                db_depositors_count: reconcile_db_depositors_count ?? null,
                diff_vaults_count: reconcile_diff_vaults_count ?? null,
                diff_trades_count: reconcile_diff_trades_count ?? null,
                diff_positions_count: reconcile_diff_positions_count ?? null,
                diff_depositors_count: reconcile_diff_depositors_count ?? null,
              }
            : null,
        };
      });

      return { items: normalized };
    },
  },
];
