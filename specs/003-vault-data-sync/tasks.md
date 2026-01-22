# 任务: Vault 数据同步

**输入**: 设计文档来自 `/specs/003-vault-data-sync/`
**前置条件**: plan.md（必需）, spec.md（用户故事必需）, research.md, data-model.md, contracts/

**测试**: 未在规格中要求测试任务，当前不包含测试清单。

**组织方式**: 按用户故事分组，以便每个故事独立实现与测试。

## Phase 1: 基础设置（共享基础设施）

**目的**: 初始化本地数据环境与基础配置

- [X] T001 更新本地 Supabase 表结构以支持 Vault 数据于 `server/db/schema.sql`
- [X] T002 添加 Vault 同步环境变量说明与代理配置说明于 `specs/003-vault-data-sync/quickstart.md`

---

## Phase 2: 基础能力（阻塞性前置）

**目的**: 核心基础设施，必须完成后才能开始任何用户故事

- [X] T003 创建 Vault 数据访问仓储（upsert/查询）于 `server/services/vault-repository.ts`
- [X] T004 [P] 创建 Hyperliquid 官方数据源客户端封装于 `server/services/hyperliquid-client.ts`
- [X] T005 [P] 创建 Vault 页面回退采集服务于 `server/services/hyperliquid-scraper.ts`
- [X] T006 实现同步记录写入与状态更新于 `server/services/sync-run-service.ts`
- [X] T007 搭建 Vault 同步入口 API 于 `server/api/vaults.ts`
- [X] T008 添加同步记录查询 API 于 `server/api/sync-runs.ts`
- [X] T009 更新 API 路由注册于 `server/api/index.ts`

**检查点**: 基础能力完成 - 用户故事可并行推进

---

## Phase 3: 用户故事 1 - 本地同步 Vault 数据（优先级: P1）🎯 MVP

**目标**: 拉取 Vault 基础信息/成交/仓位/存款人并写入本地数据库

**独立测试**: 触发一次同步后，数据库中可查询到 Vault 全量数据与同步记录

### 用户故事 1 的实现

- [X] T010 [US1] 实现 Vault 全量同步流程与字段映射于 `server/jobs/vault-sync.ts`
- [X] T011 [US1] 在同步流程中写入 Vault/成交/仓位/存款人数据于 `server/services/vault-repository.ts`
- [X] T012 [US1] 支持同步入口触发并返回任务状态于 `server/api/vaults.ts`
- [X] T013 [US1] 写入同步结果摘要（成功/失败数量与列表）于 `server/services/sync-run-service.ts`

**检查点**: 用户故事 1 可独立运行并输出完整同步数据

---

## Phase 4: 用户故事 2 - 实时更新与去重写入（优先级: P2）

**目标**: WebSocket 实时监听 Top10 Vault 成交并去重写入

**独立测试**: 建立监听后，最新成交可实时写入且不产生重复记录

### 用户故事 2 的实现

- [X] T014 [US2] 计算年化收益 Top10 Vault 并持久化名单于 `server/services/vault-repository.ts`
- [X] T015 [US2] 实现 WebSocket 监听与消息解析于 `server/jobs/vault-trades-ws.ts`
- [X] T016 [US2] 将实时成交写入并更新 `last_ws_trade_at` 于 `server/services/vault-repository.ts`
- [X] T017 [US2] 将 WebSocket 监听的 Vault 列表写入同步记录于 `server/services/sync-run-service.ts`
- [X] T018 [US2] 启动 WebSocket 监听任务于 `server/index.ts`

**检查点**: Top10 Vault 成交实时写入生效

---

## Phase 5: 用户故事 3 - 回退数据源与可追溯性（优先级: P3）

**目标**: 官方数据源不可用时自动回退采集并可追溯

**独立测试**: 模拟官方数据源失败时仍可完成同步并记录来源

### 用户故事 3 的实现

- [X] T019 [US3] 在同步流程中加入官方接口失败回退逻辑于 `server/jobs/vault-sync.ts`
- [X] T020 [US3] 记录同步来源（官方/回退）于 `server/services/sync-run-service.ts`
- [X] T021 [US3] 提供同步记录查询接口于 `server/api/sync-runs.ts`

**检查点**: 回退数据源与同步记录可独立验证

---

## Phase 6: 打磨与跨领域工作

**目的**: 跨故事一致性与文档补充

- [X] T022 更新同步快速验证步骤与运行说明于 `specs/003-vault-data-sync/quickstart.md`
- [X] T023 校验 Web/Telegram 可用接口与数据字段一致性说明于 `docs/telegram-parity.md`

---

## 依赖与执行顺序

### 阶段依赖

- **设置（Phase 1）**: 无依赖 - 可立即开始
- **基础能力（Phase 2）**: 依赖设置完成 - 阻塞所有用户故事
- **用户故事（Phase 3+）**: 依赖基础能力完成
- **打磨（最终阶段）**: 依赖所有目标用户故事完成

### 用户故事依赖

- **用户故事 1 (P1)**: 基础能力完成后可开始 - 不依赖其他故事
- **用户故事 2 (P2)**: 基础能力完成后可开始 - 依赖用户故事 1 的数据基础
- **用户故事 3 (P3)**: 基础能力完成后可开始 - 可独立测试但复用同步流程

### 并行机会

- T004 与 T005 可并行
- 用户故事 1 完成后可并行推进用户故事 2 与 3

---

## 实施策略

### MVP 优先（仅用户故事 1）

1. 完成 Phase 1: 设置
2. 完成 Phase 2: 基础能力
3. 完成 Phase 3: 用户故事 1
4. **停止并验证**: 独立验证同步数据正确性

### 增量交付

1. 完成用户故事 1 → 验证同步
2. 添加用户故事 2 → 验证实时更新
3. 添加用户故事 3 → 验证回退与追溯
