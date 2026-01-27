# 实施计划: 跟单平台多端交互与跟单流程

**分支**: `001-copytrade-platform` | **日期**: 2025-12-24 | **规格**: /Users/mao/code/CopyTradingCodex/specs/001-copytrade-platform/spec.md
**输入**: 功能规格来自 `/specs/001-copytrade-platform/spec.md`

**说明**: 此模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/commands/plan.md`。

## 概要

建设可多端自适应的跟单平台：Web 端提供卡片/表格视图、交易员详情与跟单确认；
Telegram 端提供下单、查询、撤单与调整杠杆的对话操作；数据来自 Hyperliquid vault，
展示指标可复现并收取 0.1% 手续费。技术方案包含前端展示、数据管线与 API/机器人
通道，并确保渠道一致性、非托管签名与风险披露。

## 技术背景

**语言/版本**: TypeScript（前端）、Node.js 20（服务端）  
**主要依赖**: React 18 + Vite（现有前端）、Telegram Bot SDK（服务端）、Web3 钱包连接库  
**存储**: 本地 PostgreSQL（仅用于数据/会话，不存私钥）  
**测试**: 前端单元测试（Vitest 或同级替代），API 契约测试（OpenAPI 校验）  
**目标平台**: Web（桌面优先 + 移动自适应）+ Telegram 机器人
**项目类型**: single/web + server（前端与服务端共仓）  
**性能目标**: 指标数据延迟不超过 5 分钟；列表与详情核心交互可在 3 秒内完成  
**约束**: 钱包连接为唯一身份方式；任何资金移动需明确签名；不存储私钥或敏感凭据  
**规模/范围**: 初期覆盖核心交易员列表与跟单流程，后续扩展更多指标与策略

## 宪章检查

*关卡: 必须在 Phase 0 研究前通过；在 Phase 1 设计后复检。*

- 指标透明: 每个指标都有公式、来源与窗口文档。
- 仅钱包接入: 不得出现用户名/密码或托管账户流程。
- 非托管授权: 任何资金移动都需要明确钱包签名。
- 渠道一致性: Web 与 Telegram API 提供相同核心数据与筛选。
- 零售安全: 文案包含风险披露与非投资建议表述。

## 项目结构

### 文档（本功能）

```text
specs/001-copytrade-platform/
├── plan.md              # 本文件（/speckit.plan 输出）
├── research.md          # Phase 0 输出（/speckit.plan）
├── data-model.md        # Phase 1 输出（/speckit.plan）
├── quickstart.md        # Phase 1 输出（/speckit.plan）
├── contracts/           # Phase 1 输出（/speckit.plan）
└── tasks.md             # Phase 2 输出（/speckit.tasks - 非 /speckit.plan）
```

### 源码（仓库根目录）

```text
src/                      # 现有 Web 前端
├── components/
├── pages/
└── services/

server/                   # 新增服务端（API + Telegram）
├── api/
├── bots/
├── services/
└── jobs/

tests/
├── contract/
├── integration/
└── unit/
```

**结构决策**: 保持现有 `src/` 前端结构不变，新增 `server/` 作为 API 与机器人服务。

## 复杂度跟踪

> **仅在宪章检查存在必须解释的违规时填写**

| 违规项 | 必要性 | 为什么不能用更简单方案 |
|-----------|------------|-------------------------------------|
| 无 | 当前方案满足宪章约束 | N/A |
