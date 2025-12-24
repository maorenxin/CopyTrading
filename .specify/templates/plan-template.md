# 实施计划: [FEATURE]

**分支**: `[###-feature-name]` | **日期**: [DATE] | **规格**: [link]
**输入**: 功能规格来自 `/specs/[###-feature-name]/spec.md`

**说明**: 此模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/commands/plan.md`。

## 概要

[从功能规格提取: 核心需求 + 研究得到的技术方案]

## 技术背景

<!--
  需要操作: 用本项目的技术细节替换此部分内容。
  这里的结构仅作为指导，帮助迭代过程。
-->

**语言/版本**: [例如 Python 3.11, Swift 5.9, Rust 1.75 或 NEEDS CLARIFICATION]  
**主要依赖**: [例如 FastAPI, UIKit, LLVM 或 NEEDS CLARIFICATION]  
**存储**: [如适用，例如 PostgreSQL, CoreData, files 或 N/A]  
**测试**: [例如 pytest, XCTest, cargo test 或 NEEDS CLARIFICATION]  
**目标平台**: [例如 Linux server, iOS 15+, WASM 或 NEEDS CLARIFICATION]
**项目类型**: [single/web/mobile - 决定源码结构]  
**性能目标**: [领域指标，例如 1000 req/s, 10k lines/sec, 60 fps 或 NEEDS CLARIFICATION]  
**约束**: [领域约束，例如 <200ms p95, <100MB memory, offline-capable 或 NEEDS CLARIFICATION]  
**规模/范围**: [领域规模，例如 10k users, 1M LOC, 50 screens 或 NEEDS CLARIFICATION]

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
specs/[###-feature]/
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
# [REMOVE IF UNUSED] 选项 1: 单项目（默认）
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] 选项 2: Web 应用（当检测到前后端时）
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] 选项 3: 移动端 + API（当检测到 iOS/Android）
api/
└── [与 backend 相同的结构]

ios/ or android/
└── [平台特定结构: 功能模块、UI 流程、平台测试]
```

**结构决策**: [记录所选结构并引用上述真实目录]

## 复杂度跟踪

> **仅在宪章检查存在必须解释的违规时填写**

| 违规项 | 必要性 | 为什么不能用更简单方案 |
|-----------|------------|-------------------------------------|
| [例如, 第 4 个项目] | [当前需要] | [为什么 3 个项目不够] |
| [例如, 仓储模式] | [具体问题] | [为什么直接 DB 访问不够] |
