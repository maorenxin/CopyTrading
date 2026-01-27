# 实施计划: Vault 数据落库与联调

**分支**: `004-vault-db-integration` | **日期**: 2026-01-22 | **规格**: /Users/mao/code/CopyTradingCodex/specs/004-vault-db-integration/spec.md
**输入**: 功能规格来自 `/specs/004-vault-db-integration/spec.md`

**说明**: 此模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/commands/plan.md`。

## 概要

在本地 PostgreSQL 落库 vault 下载与指标计算结果，继续保留 CSV 输出以便对账；
补齐对账摘要与批次追溯能力；新增/完善 API 读取数据库数据，并让前端切换为真实数据源；
验收阶段使用 Chrome MCP 检查网络与页面数据，确保不再使用 mock 数据。

## 技术背景

**语言/版本**: TypeScript 5.9（前端）、Node.js（服务端脚本）  
**主要依赖**: React 18 + Vite 6（前端）、pg、undici、papaparse  
**存储**: 本地 PostgreSQL + CSV 文件  
**测试**: 现有仓库未配置测试框架（计划补充脚本级校验与浏览器验收）  
**目标平台**: 本地开发环境（Node 服务/脚本 + Web 前端）
**项目类型**: web（前端）+ server（脚本/服务端）同仓  
**性能目标**: 单次同步完成后 10 分钟内前端可见最新批次数据  
**约束**: 必须保留 CSV；前端不再使用 mock 数据；数据库位于本地；验收用 Chrome MCP 复核  
**规模/范围**: 本地单库、vault 数据批次同步与列表/详情展示

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
specs/004-vault-db-integration/
├── plan.md              # 本文件（/speckit.plan 输出）
├── research.md          # Phase 0 输出（/speckit.plan）
├── data-model.md        # Phase 1 输出（/speckit.plan）
├── quickstart.md        # Phase 1 输出（/speckit.plan）
├── contracts/           # Phase 1 输出（/speckit.plan）
└── tasks.md             # Phase 2 输出（/speckit.tasks - 非 /speckit.plan）
```

### 源码（仓库根目录）

```text
src/                      # Web 前端
├── components/
├── services/
└── utils/

server/                   # 数据同步与 API
├── api/
├── db/
├── jobs/
├── scripts/
└── services/
```

**结构决策**: 保持 `src/` 前端与 `server/` 服务端共仓结构不变，在 `server/` 内完成数据库与 API 接入。

## 复杂度跟踪

> **仅在宪章检查存在必须解释的违规时填写**

| 违规项 | 必要性 | 为什么不能用更简单方案 |
|-----------|------------|-------------------------------------|
| 无 | 当前方案满足宪章约束 | N/A |
