# 数据模型: Web3 钱包连接与登录

**日期**: 2025-12-24

## 实体与字段

### 钱包会话（WalletSession）

- **字段**: wallet_address, status, connected_at
- **校验**: wallet_address 必须为有效地址格式；status ∈ {disconnected, connected}
- **关系**: 本功能为前端会话态，不涉及服务端关联

## 状态流转

- disconnected → connected → disconnected
