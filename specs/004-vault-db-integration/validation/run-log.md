# 运行与输出日志

**日期**: 2026-01-22

## 执行记录

- 初始化数据库: `/opt/homebrew/opt/postgresql@15/bin/psql "postgresql://localhost:5432/postgres" -f server/db/schema.sql`
- 数据同步命令: `DATABASE_URL="postgresql://localhost:5432/postgres" VAULT_SYNC_LIMIT=20 npm run vault:sync:local`
- 对账摘要命令: `DATABASE_URL="postgresql://localhost:5432/postgres" node -r ts-node/register/transpile-only server/scripts/reconcile-vault-csv-db.ts`
- API 启动命令: `DATABASE_URL="postgresql://localhost:5432/postgres" npm run api:dev`
- 前端启动命令: `npm run dev`

## 输出摘要

- 同步批次数量: 1（sync_run_id=522261f2-d3d4-4a66-8835-cf68fdf61750，vaults=20，source=csv）
- CSV 输出路径: `VAULTS.csv`（本次同步因远端页面连接重置，使用本地 CSV 作为落库来源）
- 数据库记录摘要: vaults=20；vault_trades/positions/depositors 因 API 422/429 为空
- 前端页面访问结果: `http://localhost:3000` 可访问，`/api/vaults` 返回 20 条记录
