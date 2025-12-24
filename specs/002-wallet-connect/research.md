# 研究记录: Web3 钱包连接与登录

**日期**: 2025-12-24

## 决策 1: 钱包连接方式

- **Decision**: 使用浏览器扩展注入对象完成连接授权与地址获取。
- **Rationale**: 满足 Chrome 端 OKX/MetaMask 连接需求，且无需引入额外账户体系。
- **Alternatives considered**: 独立托管登录（不符合仅钱包接入原则）。

## 决策 2: 连接状态管理

- **Decision**: 连接成功后在前端状态保存地址，并在刷新后尝试恢复。
- **Rationale**: 提升用户体验，避免每次刷新重新连接。
- **Alternatives considered**: 不缓存状态（用户体验差）。

## 决策 3: 失败与缺少钱包提示

- **Decision**: 当未检测到钱包扩展时显示安装提示；授权失败时显示重试提示。
- **Rationale**: 降低用户困惑，提高连接成功率。
- **Alternatives considered**: 静默失败（不可接受）。
