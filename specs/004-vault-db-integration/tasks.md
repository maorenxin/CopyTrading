---

description: "Vault 数据落库与联调实施任务"
---

# 任务: Vault 数据落库与联调

**输入**: 设计文档来自 `/specs/004-vault-db-integration/`
**前置条件**: plan.md（必需）, spec.md（用户故事必需）, research.md, data-model.md, contracts/, quickstart.md

**测试**: 本功能以脚本校验与 Chrome MCP 验收为主，不新增自动化测试框架。

**组织方式**: 按用户故事分组，以便每个故事独立实现与测试。

## 格式: `[ID] [P?] [Story] 描述`

- **[P]**: 可并行（不同文件，无依赖）
- **[Story]**: 任务所属用户故事（例如 US1, US2, US3）
- 描述中必须包含具体文件路径

## Phase 1: 基础设置（共享基础设施）

**目的**: 验收记录与执行日志准备

- [x] T001 [P] 创建 Chrome MCP 验收记录模板于 `specs/004-vault-db-integration/validation/mcp-validation.md`
- [x] T002 [P] 创建执行日志模板于 `specs/004-vault-db-integration/validation/run-log.md`

---

## Phase 2: 基础能力（阻塞性前置）

**目的**: 数据库与 API 基础设施，必须完成后才能开始任何用户故事

- [x] T003 更新数据库结构（新增 sync_run_id、last_sync_run_id、对账表与索引）于 `server/db/schema.sql`
- [x] T004 [P] 新增 Postgres 连接与事务封装于 `server/db/postgres.ts`
- [x] T005 更新数据访问层为本地 Postgres 查询于 `server/services/vault-repository.ts`
- [x] T006 [P] 新增 HTTP API 服务入口与路由适配于 `server/api/server.ts`
- [x] T007 [P] 添加 API 启动脚本与端口配置于 `package.json`
- [x] T008 [P] 配置前端 `/api` 代理到本地服务于 `vite.config.ts`

**检查点**: API 可在本地启动并返回 vault/sync-runs 数据

---

## Phase 3: 用户故事 1 - 数据批次落库与保留 CSV（优先级: P1）🎯 MVP

**目标**: 同一批次数据保留 CSV，同时写入本地数据库并可追溯

**独立测试**: 运行一次数据流程，验证 CSV 生成且数据库存在同批次记录

### 用户故事 1 的实现

- [x] T009 [US1] 新增批次写入与去重逻辑于 `server/services/vault-db-writer.ts`
- [x] T010 [US1] 扩展同步脚本写入 CSV + DB 并记录 sync_run 于 `server/scripts/local-vault-sync.js`
- [x] T011 [US1] 扩展 pipeline 同步入库与批次追溯于 `server/scripts/run-vault-pipeline.ts`
- [x] T012 [US1] 新增量化指标 CSV 解析与落库（含公式/来源/窗口元数据）于 `server/services/vault-quantstat-loader.ts`

**检查点**: 同批次重复执行不会产生重复展示，CSV 保留且数据库可追溯

---

## Phase 4: 用户故事 2 - 前端读取真实数据（优先级: P2）

**目标**: 前端页面展示来自数据库的真实数据，不再使用 mock

**独立测试**: 访问 vault 列表/详情页面，数据来自 `/api` 且空数据有提示

### 用户故事 2 的实现

- [x] T013 [P] [US2] 新增 Vault 类型定义于 `src/types/vault.ts`
- [x] T014 [P] [US2] 新增 Vault API 客户端（无 mock 回退）于 `src/services/vaults.ts`
- [x] T015 [P] [US2] 新增 Vault 列表组件与空态 UI 于 `src/components/VaultList.tsx`
- [x] T016 [P] [US2] 新增 Vault 详情组件（含 sync_run_id 展示）于 `src/components/VaultDetailPanel.tsx`
- [x] T017 [US2] 新增页面容器与数据加载逻辑于 `src/components/VaultsPage.tsx`
- [x] T018 [US2] 接入 Vault 页面到应用入口于 `src/App.tsx`

**检查点**: 前端不引用 mock 数据，且 API 无数据时显示空态

---

## Phase 5: 用户故事 3 - CSV 与数据库一致性核对（优先级: P3）

**目标**: 生成 CSV 与数据库对账摘要并可查询

**独立测试**: 对任一批次输出记录数与差异计数摘要

### 用户故事 3 的实现

- [x] T019 [US3] 新增对账摘要计算逻辑（CSV vs DB）于 `server/services/reconcile-summary.ts`
- [x] T020 [US3] 新增对账脚本并写入报告与数据库于 `server/scripts/reconcile-vault-csv-db.ts`
- [x] T021 [US3] 扩展批次 API 返回对账摘要于 `server/api/sync-runs.ts`

**检查点**: 批次 API 可返回对账摘要，报告可与 CSV 对照

---

## Phase N: 打磨与跨领域工作

**目的**: 验收与文档收敛

- [x] T022 更新运行与验收步骤说明于 `specs/004-vault-db-integration/quickstart.md`
- [x] T023 使用 `mcp__chrome-devtools__*` 验证 vault 列表与数据库一致并记录于 `specs/004-vault-db-integration/validation/mcp-validation.md`
- [x] T024 使用 `mcp__chrome-devtools__*` 验证 vault 详情与数据库一致并记录于 `specs/004-vault-db-integration/validation/mcp-validation.md`
- [x] T025 使用 `mcp__chrome-devtools__*` 验证页面无 mock 数据回退并记录于 `specs/004-vault-db-integration/validation/mcp-validation.md`
- [x] T026 记录本地运行命令与输出摘要于 `specs/004-vault-db-integration/validation/run-log.md`

---

## 依赖与执行顺序

### 阶段依赖

- **设置（Phase 1）**: 无依赖 - 可立即开始
- **基础能力（Phase 2）**: 依赖设置完成 - 阻塞所有用户故事
- **用户故事（Phase 3+）**: 依赖基础能力完成
- **打磨（最终阶段）**: 依赖所有目标用户故事完成

### 用户故事依赖

- **用户故事 1 (P1)**: 基础能力完成后可开始 - 不依赖其他故事
- **用户故事 2 (P2)**: 基础能力完成后可开始 - 依赖 US1 提供数据库数据
- **用户故事 3 (P3)**: 基础能力完成后可开始 - 依赖 US1 生成 CSV/DB 数据

### 单个用户故事内

- 数据结构先于写入逻辑
- 服务层先于 API 接口
- 数据层完成后再开始前端联调
- 每个故事完成后进行独立验证

### 并行机会

- Phase 2 中标记 [P] 的基础任务可并行
- Phase 4 中标记 [P] 的前端组件可并行
- US2 与 US3 在 US1 完成后可并行

---

## 并行示例: 用户故事 2

```bash
Task: "新增 Vault 类型定义于 src/types/vault.ts"
Task: "新增 Vault API 客户端（无 mock 回退）于 src/services/vaults.ts"
Task: "新增 Vault 列表组件与空态 UI 于 src/components/VaultList.tsx"
Task: "新增 Vault 详情组件（含 sync_run_id 展示）于 src/components/VaultDetailPanel.tsx"
```

---

## 实施策略

### MVP 优先（仅用户故事 1）

1. 完成 Phase 1: 设置
2. 完成 Phase 2: 基础能力（关键 - 阻塞所有故事）
3. 完成 Phase 3: 用户故事 1
4. **停止并验证**: CSV 与数据库落库一致性

### 增量交付

1. 基础能力完成后交付 US1
2. 加入 US2 完成前端真实数据联调
3. 加入 US3 完成对账摘要输出
4. 最终用 Chrome MCP 验收并记录
