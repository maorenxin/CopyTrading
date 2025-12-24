# 实施计划: Web3 钱包连接与登录

**分支**: `002-wallet-connect` | **日期**: 2025-12-24 | **规格**: /Users/mao/code/CopyTradingCodex/specs/002-wallet-connect/spec.md
**输入**: 功能规格来自 `/specs/002-wallet-connect/spec.md`

**说明**: 此模板由 `/speckit.plan` 命令填充。执行流程见 `.specify/templates/commands/plan.md`。

## 概要

在现有前端中完善钱包连接能力：支持 Chrome 里唤起 OKX/MetaMask 等扩展，
连接成功后展示地址与状态、支持断开连接，并在缺少钱包时提示安装。
实现聚焦 `WalletConnect.tsx`，并与当前 UI 保持一致的交互与文案。

## 技术背景

**语言/版本**: TypeScript（前端）  
**主要依赖**: React 18 + Vite（现有前端）、浏览器钱包扩展注入对象  
**存储**: 本地状态与缓存（仅保存会话与地址，避免敏感数据）  
**测试**: 手工验收为主（连接/断开/错误提示流程）  
**目标平台**: Web（Chrome 浏览器扩展钱包）
**项目类型**: single/web  
**性能目标**: 连接按钮点击到状态更新不超过 2 秒  
**约束**: 不存储私钥；只做连接/断开与地址展示  
**规模/范围**: 仅完善钱包连接 UI 与状态管理

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
specs/002-wallet-connect/
├── plan.md              # 本文件（/speckit.plan 输出）
├── research.md          # Phase 0 输出（/speckit.plan）
├── data-model.md        # Phase 1 输出（/speckit.plan）
├── quickstart.md        # Phase 1 输出（/speckit.plan）
├── contracts/           # Phase 1 输出（/speckit.plan）
└── tasks.md             # Phase 2 输出（/speckit.tasks - 非 /speckit.plan）
```

### 源码（仓库根目录）

```text
src/
├── components/
│   └── WalletConnect.tsx
├── utils/
└── types/
```

**结构决策**: 在现有 `src/components/WalletConnect.tsx` 中完成实现。

## 复杂度跟踪

> **仅在宪章检查存在必须解释的违规时填写**

| 违规项 | 必要性 | 为什么不能用更简单方案 |
|-----------|------------|-------------------------------------|
| 无 | 当前方案满足宪章约束 | N/A |
