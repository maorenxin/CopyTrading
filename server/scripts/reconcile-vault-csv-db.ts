import { promises as fs } from "fs";
import { buildReconcileSummary, upsertReconcileSummary } from "../services/reconcile-summary";

const OUTPUT_PATH = process.env.RECONCILE_OUTPUT_PATH || "reconcile-summary.json";

async function run(): Promise<void> {
  const summary = await buildReconcileSummary({
    syncRunId: process.env.RECONCILE_SYNC_RUN_ID,
    vaultsCsvPath: process.env.VAULTS_CSV_PATH,
    tradesDir: process.env.VAULT_TX_OUTPUT_DIR,
  });

  if (!summary) {
    console.warn("[warn] reconcile summary not generated");
    return;
  }

  await upsertReconcileSummary(summary);
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(summary, null, 2), "utf-8");
  console.log(`[info] reconcile summary saved to ${OUTPUT_PATH}`);
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[error] reconcile summary failed: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
