# 快速开始: Vault 数据落库与联调

**日期**: 2026-01-22

## 目标

在本地完成数据库建库、vault 数据同步、API 查询与前端展示验证，并通过 Chrome MCP 复核数据来源。

## 前置准备

1) 本地启动 PostgreSQL 并创建数据库（示例名: copytrading）
2) 执行 schema 初始化

```bash
psql "$DATABASE_URL" -f server/db/schema.sql
```

## 数据同步（保留 CSV）

```bash
npm install
npm run vault:sync:local
```

## API 启动

```bash
npm run api:dev
```

## 量化指标入库（可选）

```bash
# 生成 quantstats CSV 后执行
node -r ts-node/register/transpile-only server/scripts/run-vault-pipeline.ts
```

```bash
# 生成 CSV 与数据库对账摘要
node -r ts-node/register/transpile-only server/scripts/reconcile-vault-csv-db.ts
```

## 前端启动

```bash
npm run dev
```

## 验收与调试（Chrome MCP）

1) 访问 vault 列表/详情页面，确认展示来自 API 数据而非 mock
2) 使用 Chrome MCP 打开 Network 面板，核对 `/api/vaults` 与 `/api/vaults/{id}` 返回值
3) 运行对账脚本，核对 CSV 与数据库记录数一致性（以同步批次为单位）

## 必需环境变量（示例）

- `DATABASE_URL` 或 `POSTGRES_URL`
- `HYPERLIQUID_API_URL`（可选）
- `HTTPS_PROXY`（可选）

**注意**: 密钥与连接信息仅通过环境变量提供，不写入仓库。
