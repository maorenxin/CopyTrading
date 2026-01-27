import { getPool, query } from "../db/postgres";
import { recomputeVaultRadarStats, seedVaultAiTags } from "../services/vault-quantstat-loader";

/**
 * 为 vault_info 增加雷达评分与 AI 标签字段。
 */
async function ensureVaultsInfoColumns(): Promise<void> {
  await query(`
    alter table if exists vault_info
      add column if not exists radar_balance_score numeric,
      add column if not exists radar_mdd_score numeric,
      add column if not exists radar_sharpe_score numeric,
      add column if not exists radar_return_score numeric,
      add column if not exists radar_age_score numeric,
      add column if not exists radar_area numeric,
      add column if not exists ai_tags jsonb
  `);
}

/**
 * 执行数据库迁移与雷达评分刷新。
 */
async function run(): Promise<void> {
  await ensureVaultsInfoColumns();
  const [radarCount, tagCount] = await Promise.all([
    recomputeVaultRadarStats(),
    seedVaultAiTags(),
  ]);
  console.log(`[info] vault_info columns ensured, radar updated=${radarCount}, ai_tags seeded=${tagCount}`);
  await getPool().end();
}

if (require.main === module) {
  run().catch((error) => {
    console.error(`[error] migrate-vaults-info-radar failed: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
