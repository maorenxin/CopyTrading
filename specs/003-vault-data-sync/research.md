# 研究结论: Vault 数据同步

## Decision 1: 数据源优先级采用“官方接口优先 + 页面回退”

**Decision**: 同步优先使用 Hyperliquid 官方 SDK/API 获取 Vault 数据；当
官方接口不可用或字段缺失时，使用公开页面 `https://app.hyperliquid.xyz/vaults`
作为回退数据源。

**Rationale**: 官方接口提供结构化数据与稳定字段；页面回退确保在接口变动或
不可用时仍可获得核心信息，满足连续运营需求。

**Alternatives considered**: 仅依赖页面爬取（数据易变且维护成本高）。

## Decision 2: 本地 PostgreSQL 与线上结构保持同构

**Decision**: 在本地创建与线上一致的 PostgreSQL 表结构，新增 Vault 相关表以
承载同步数据。

**Rationale**: 同构结构可减少未来迁移成本，并保证服务端查询逻辑一致。

**Alternatives considered**: 使用独立本地数据库模型（迁移成本高、维护复杂）。

## Decision 3: 同步过程需记录来源与时间

**Decision**: 每次同步记录来源（官方接口/页面回退）、时间与成功/失败摘要。

**Rationale**: 支持可追溯性与数据质量监控，便于后续分析一致性检查。

**Alternatives considered**: 不记录同步来源（难以排查数据差异）。

## Decision 4: WebSocket 实时监听覆盖年化收益 Top10

**Decision**: 同步完成后为年化收益排名前 10 的 Vault 建立 WebSocket 监听，
实时写入最新成交。

**Rationale**: 重点 Vault 需要持续更新以支撑排名与实时表现展示。

**Alternatives considered**: 仅靠批量同步（数据时效不足）。

## Decision 5: Vault 地址去重采用覆盖写入

**Decision**: 对重复 Vault 地址进行覆盖更新（upsert）而非新增。

**Rationale**: 避免重复数据并保持最新状态，适配定时爬取策略。

**Alternatives considered**: 仅追加记录（会导致数据膨胀与不一致）。
