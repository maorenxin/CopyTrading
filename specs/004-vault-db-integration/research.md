# 研究记录: Vault 数据落库与联调

**日期**: 2026-01-22

## 决策 1: 本地 PostgreSQL 作为唯一落库

- **Decision**: 以本地 PostgreSQL 作为 vault 数据的持久化存储，沿用 `server/db/schema.sql` 的表结构。
- **Rationale**: 需求明确要求本地数据库；现有 schema 已覆盖 vault 相关表，改造成本最低。
- **Alternatives considered**: 继续使用托管 PostgreSQL 服务（不满足本地化要求）。

## 决策 2: 批次与对账的显式追溯

- **Decision**: 以 `sync_runs` 作为批次基准，并为 vault 相关记录引入可追溯的批次字段，生成对账摘要（批次、记录数、差异计数）。
- **Rationale**: 满足“CSV 与数据库一一对应”和对账需求，避免仅靠时间戳推断。
- **Alternatives considered**: 仅使用 `synced_at` 时间戳关联（对账模糊且不可复现）。

## 决策 3: API 接入层沿用现有 Router 结构

- **Decision**: 复用 `server/api` 中的路由定义，补齐 HTTP 接入层，对外提供 `/api` 数据接口。
- **Rationale**: 现有路由已覆盖 vault 与 sync-runs 需求，补齐接入层即可服务前端。
- **Alternatives considered**: 引入新框架重写路由（增加复杂度与维护成本）。

## 决策 4: 前端数据源切换策略

- **Decision**: 将 vault 相关页面从 mock 切换为真实 API 数据，失败时展示空态与提示，不再回退 mock 数据。
- **Rationale**: 满足上线后“无 mock 数据”的目标，并保证用户识别数据不可用状态。
- **Alternatives considered**: 继续保留 mock 回退（无法满足验收要求）。

## 决策 5: 验收与调试方式

- **Decision**: 以“同步入库 → API 查询 → 前端展示”的流程验收，并通过 Chrome MCP 检查网络响应确认来自数据库。
- **Rationale**: 直接验证数据链路与前端显示一致，确保上线前无 mock 数据残留。
- **Alternatives considered**: 仅依赖日志或脚本检查（无法确认前端真实展示）。
