---

description: "功能实施任务清单"
---

# 任务: 跟单平台多端交互与跟单流程

**输入**: 设计文档来自 `/specs/001-copytrade-platform/`
**前置条件**: plan.md（必需）, spec.md（用户故事必需）, research.md, data-model.md, contracts/

**测试**: 本功能未明确要求测试任务，因此仅安排实现任务。

**组织方式**: 按用户故事分组，确保每个故事可独立实现与测试。

## 格式: `[ID] [P?] [Story] 描述`

- **[P]**: 可并行（不同文件，无依赖）
- **[Story]**: 任务所属用户故事（例如 US1, US2, US3）
- 描述中必须包含具体文件路径

## 路径约定

- **Web 应用**: `src/`
- **服务端**: `server/`
- **测试**: `tests/`（本期未安排）

## Phase 1: 基础设置（共享基础设施）

**目的**: 项目初始化与基本结构

- [X] T001 创建服务端目录与入口文件于 `server/index.ts`
- [X] T002 建立服务端目录结构 `server/api/` `server/bots/` `server/services/` `server/jobs/`
- [X] T003 补充环境变量示例文件 `/.env.example`

---

## Phase 2: 基础能力（阻塞性前置）

**目的**: 核心基础设施，必须完成后才能开始任何用户故事

**⚠️ 关键**: 在此阶段完成前，不允许进入用户故事开发

- [X] T004 定义 PostgreSQL 数据结构与表设计于 `server/db/schema.sql`
- [X] T005 实现 PostgreSQL 访问封装于 `server/db/postgres.ts`
- [X] T006 实现 vault 数据定时同步任务于 `server/jobs/vault-sync.ts`
- [X] T007 实现 vault 交易 WebSocket 监听任务于 `server/jobs/vault-stream.ts`
- [X] T008 搭建 API 服务入口与路由聚合于 `server/api/index.ts` 与 `server/api/router.ts`
- [X] T009 实现指标计算与窗口汇总逻辑于 `server/services/metrics.ts`
- [X] T010 实现结构化日志与错误处理于 `server/services/logger.ts`

**检查点**: 基础能力完成 - 用户故事可并行推进

---

## Phase 3: 用户故事 1 - 发现与对比交易员（优先级: P1）🎯 MVP

**目标**: 提供卡片/表格视图、排序与移动端适配的交易员发现体验

**独立测试**: 打开首页，完成视图切换、排序、进入详情并返回

### 用户故事 1 的实现

- [X] T011 [US1] 实现交易员列表数据请求于 `src/services/traders.ts`
- [X] T012 [P] [US1] 构建交易员卡片组件于 `src/components/TraderCard.tsx`
- [X] T013 [P] [US1] 构建交易员表格组件于 `src/components/TraderTableView.tsx`
- [X] T014 [P] [US1] 构建排序与视图切换栏于 `src/components/TradingPlatform.tsx`
- [X] T015 [US1] 组装首页列表视图与交互于 `src/components/TradingPlatform.tsx`
- [X] T016 [US1] 实现移动端“my portfolio”跳转体验于 `src/components/MobilePortfolioSheet.tsx`
- [X] T017 [US1] 接入中英文切换按钮于 `src/components/LanguageSwitcher.tsx` 与 `src/components/Header.tsx`
- [X] T018 [US1] 实现交易员列表 API 于 `server/api/traders.ts`

**检查点**: 用户故事 1 可独立完成并验证

---

## Phase 4: 用户故事 2 - 查看详情并发起跟单（优先级: P2）

**目标**: 完成交易员详情展示与跟单确认流程

**独立测试**: 任意交易员详情页可切换指标并完成跟单确认

### 用户故事 2 的实现

- [X] T019 [US2] 搭建交易员详情页结构于 `src/components/TraderDetailModal.tsx`
- [X] T020 [P] [US2] 构建指标窗口切换组件于 `src/components/MetricTabs.tsx`
- [X] T021 [P] [US2] 构建交易历史列表组件于 `src/components/TraderDetailModal.tsx`
- [X] T022 [P] [US2] 构建净值对比图表组件于 `src/components/CumulativeReturnsChart.tsx`
- [X] T023 [US2] 构建跟单确认弹窗组件于 `src/components/CopyTradeModal.tsx`
- [X] T024 [US2] 实现详情数据请求于 `src/services/metrics.ts` `src/services/trades.ts` `src/services/equity.ts`
- [X] T025 [US2] 实现跟单下单请求与扣费展示于 `src/services/copyOrders.ts`
- [X] T026 [US2] 实现详情相关 API 于 `server/api/trader-detail.ts`
- [X] T027 [US2] 实现跟单下单与撤单 API 于 `server/api/copy-orders.ts`

**检查点**: 用户故事 1 与 2 均可独立运行

---

## Phase 5: 用户故事 3 - Telegram 机器人操作（优先级: P3）

**目标**: 提供 Telegram 对话式下单与查询能力，并保持与 Web 一致

**独立测试**: Telegram 对话可完成一次收益查询或下单

### 用户故事 3 的实现

- [X] T028 [US3] 实现 Telegram Webhook 入口于 `server/api/telegram.ts`
- [X] T029 [US3] 实现机器人命令处理于 `server/bots/telegram.ts`
- [X] T030 [US3] 实现绑定深链生成 API 于 `server/api/telegram-bind.ts`
- [X] T031 [US3] 实现绑定确认 API 于 `server/api/telegram-bind-confirm.ts`
- [X] T032 [US3] 实现 Telegram 绑定服务于 `server/services/telegram-binding.ts`
- [X] T033 [US3] 实现资产概览 API 于 `server/api/portfolio.ts`
- [X] T034 [US3] 实现 Telegram 文案与数据对齐适配于 `server/services/telegram-presenter.ts`

**检查点**: 三个用户故事均可独立运行

---

## Phase N: 打磨与跨领域工作

**目的**: 影响多个用户故事的改进

- [X] T035 [P] 输出 Web/Telegram 数据一致性核对文档于 `docs/telegram-parity.md`
- [X] T036 添加风险披露组件并接入详情页于 `src/components/RiskNotice.tsx` 与 `src/components/TraderDetailModal.tsx`
- [X] T037 完成中英文文案资源整理于 `src/i18n/strings.ts`
- [X] T038 更新快速开始说明以补充服务端启动占位于 `specs/001-copytrade-platform/quickstart.md`

---

## 依赖与执行顺序

### 阶段依赖

- **设置（Phase 1）**: 无依赖 - 可立即开始
- **基础能力（Phase 2）**: 依赖设置完成 - 阻塞所有用户故事
- **用户故事（Phase 3+）**: 依赖基础能力完成
  - 可并行（团队允许）
  - 或按优先级顺序 (P1 → P2 → P3)
- **打磨（最终阶段）**: 依赖所有目标用户故事完成

### 用户故事依赖

- **用户故事 1 (P1)**: 可在基础能力完成后开始 - 不依赖其他故事
- **用户故事 2 (P2)**: 可在基础能力完成后开始 - 依赖交易员列表与详情基础数据
- **用户故事 3 (P3)**: 可在基础能力完成后开始 - 依赖 API 与绑定机制

### 并行机会

- Phase 2 中的 T006 与 T007 可并行（不同数据任务）
- 用户故事 1 的 T012、T013、T014 可并行（不同组件）
- 用户故事 2 的 T020、T021、T022 可并行（不同组件）
- 用户故事 3 的 T030、T031 可并行（不同 API）

---

## 并行示例: 用户故事 1

```bash
Task: "构建交易员卡片组件于 src/components/TraderCard.tsx"
Task: "构建交易员表格组件于 src/components/TraderTable.tsx"
Task: "构建排序与视图切换栏于 src/components/TraderSortBar.tsx"
```

---

## 实施策略

### MVP 优先（仅用户故事 1）

1. 完成 Phase 1: 设置
2. 完成 Phase 2: 基础能力（关键 - 阻塞所有故事）
3. 完成 Phase 3: 用户故事 1
4. **停止并验证**: 独立测试用户故事 1

### 增量交付

1. 完成设置 + 基础能力 → 基础可用
2. 添加用户故事 1 → 验证 → MVP 可用
3. 添加用户故事 2 → 验证 → 详情与跟单完善
4. 添加用户故事 3 → 验证 → Telegram 能力补齐
5. 最后进行 Phase N 打磨与跨领域检查
