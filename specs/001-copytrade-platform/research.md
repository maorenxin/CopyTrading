# 研究记录: 跟单平台多端交互与跟单流程

**日期**: 2025-12-24

## 决策 1: 服务端与前端共仓结构

- **Decision**: 采用单仓结构，保留现有 `src/` 前端，并新增 `server/` 作为 API 与 Telegram 机器人服务。
- **Rationale**: 现有前端已较完整，单仓便于共享类型与契约，降低多端一致性成本。
- **Alternatives considered**: 独立后端仓库（增加维护成本与发布复杂度）。

## 决策 2: 数据同步策略

- **Decision**: 采用“持续拉取 + 变更推送”的组合：定时拉取 vault 指标与历史，
  对关键地址使用 WebSocket 跟踪交易更新。
- **Rationale**: 兼顾数据完整性与实时性，并满足“展示延迟不超过 5 分钟”的指标。
- **Alternatives considered**: 纯 WebSocket（稳定性与补偿机制复杂）、纯定时拉取（实时性不足）。

## 决策 3: Telegram 身份绑定

- **Decision**: 通过 Web 深链引导用户完成钱包签名绑定，再回填到 Telegram 侧。
- **Rationale**: 兼顾安全性与可用性，避免在 Telegram 内直接处理私钥或弱验证。
- **Alternatives considered**: 小额转账验证（成本高）、仅地址绑定（安全性不足）。

## 决策 4: 跟单与手续费结算

- **Decision**: 用户授权平台代为交易；下单前扣除 0.1% 手续费并明确展示。
- **Rationale**: 结算简单明确，减少对收益结算周期的依赖。
- **Alternatives considered**: 收益分成结算、周期性净值结算（对账复杂）。

## 决策 5: 凭据与敏感信息处理

- **Decision**: 所有密钥与连接信息仅通过环境变量提供，文档与代码库不写入明文。
- **Rationale**: 满足安全要求，避免泄露风险。
- **Alternatives considered**: 配置文件提交到仓库（不安全）。
