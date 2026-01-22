# 实施计划: Vault 数据同步

**分支**: `003-vault-data-sync` | **日期**: 2025-12-25 | **规格**: `/Users/mao/code/CopyTradingCodex/specs/003-vault-data-sync/spec.md`
**输入**: 功能规格来自 `/Users/mao/code/CopyTradingCodex/specs/003-vault-data-sync/spec.md`

**说明**: 此模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/commands/plan.md`。

## 概要

为 Hyperliquid Vault 数据建立本地同步能力，覆盖 Vault 基本信息、历史成交、
当前仓位与存款人，并记录同步来源与时间。同步后对年化收益 Top10 Vault
建立 WebSocket 监听，实时写入最新成交；支持重复同步时的覆盖更新。

## 技术背景

<!--
  需要操作: 用本项目的技术细节替换此部分内容。
  这里的结构仅作为指导，帮助迭代过程。
-->

**语言/版本**: TypeScript（Node.js 运行时）  
**主要依赖**: `@supabase/supabase-js`、现有后端服务层  
**存储**: 本地 Supabase（PostgreSQL）  
**测试**: 现有仓库未配置自动化测试（本阶段以手工验收为主）  
**目标平台**: 本地服务器环境 + 现有 Web/Server 仓库结构  
**项目类型**: Web 应用（前端 + Node 服务端）  
**性能目标**: 接近 30000 个 Vault 在 60 分钟内完成一次全量同步  
**约束**: 遵守数据源速率限制；支持 HTTP 代理 `127.0.0.1:9090`；WebSocket
监听需避免重复写入  
**规模/范围**: 公开 Vault 列表与其衍生数据（成交、仓位、存款人、实时成交）

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
specs/003-vault-data-sync/
├── plan.md              # 本文件（/speckit.plan 输出）
├── research.md          # Phase 0 输出（/speckit.plan）
├── data-model.md        # Phase 1 输出（/speckit.plan）
├── quickstart.md        # Phase 1 输出（/speckit.plan）
├── contracts/           # Phase 1 输出（/speckit.plan）
└── tasks.md             # Phase 2 输出（/speckit.tasks - 非 /speckit.plan）
```

### 源码（仓库根目录）
<!--
  需要操作: 用本功能实际结构替换下方占位树。
  删除未使用的选项，并展开所选结构的真实路径（如 apps/admin、packages/something）。
  交付的计划中不得保留 Option 标签。
-->

```text
src/
├── components/
├── services/
└── utils/

server/
├── api/
├── jobs/
└── services/
```

**结构决策**: 采用现有 `src/` 前端 + `server/` 后端结构，新增同步逻辑与 API
端点放在 `server/jobs/` 与 `server/api/`，数据访问复用 `server/services/`。

## Phase 0: 研究结论

详见 `/Users/mao/code/CopyTradingCodex/specs/003-vault-data-sync/research.md`。

- 数据源优先级采用官方接口优先、页面回退兜底。
- 本地 Supabase 与线上结构保持同构，降低迁移成本。
- 同步记录必须保留来源与时间，支持审计与追溯。
- WebSocket 实时监听覆盖年化收益 Top10 Vault。
- Vault 地址去重采用覆盖写入。

## Phase 1: 设计与契约

**数据模型**: `/Users/mao/code/CopyTradingCodex/specs/003-vault-data-sync/data-model.md`  
**接口契约**: `/Users/mao/code/CopyTradingCodex/specs/003-vault-data-sync/contracts/openapi.yaml`  
**快速验证**: `/Users/mao/code/CopyTradingCodex/specs/003-vault-data-sync/quickstart.md`

### 宪章复检（Phase 1）

- 指标透明: 同步记录含来源与时间，后续指标可复现。
- 仅钱包接入: 本功能不引入账户体系。
- 非托管授权: 仅同步与存储数据，不涉及资金操作。
- 渠道一致性: 通过统一 API 输出为后续 Web/Telegram 提供一致数据。
- 零售安全: 同步链路不触及用户文案。

## 复杂度跟踪

> **仅在宪章检查存在必须解释的违规时填写**

无。本计划未触及宪章违规项。
