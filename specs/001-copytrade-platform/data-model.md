# 数据模型: 跟单平台多端交互与跟单流程

**日期**: 2025-12-24

## 实体与字段

### 交易员（Trader）

- **字段**: id, vault_address, display_name, avatar_url, status, rank, trader_age_days, follower_count,
  all_time_return, annualized_return, max_drawdown_percent, win_rate_percent, avg_trades_per_day,
  last_trade_timestamp, balance_usdc, time_in_market_percent, avg_hold_days, radar_score,
  ai_strategy_en, ai_strategy_cn, ai_tags_en, ai_tags_cn, created_at, updated_at
- **校验**: vault_address 必须为有效地址格式；status ∈ {active, paused, hidden}
- **关系**: 1 对多 关联 绩效指标、交易历史、跟单订单

### 绩效指标（PerformanceMetric）

- **字段**: id, trader_id, window (7d/30d/90d/all), return_rate, annual_return_rate, sharpe,
  win_rate, max_drawdown, pnl, pnl_volatility, pnl_bias, balance_score, trader_age_score,
  radar_score, updated_at
- **校验**: window 必须在枚举范围内；数值字段为非 NaN 数值
- **关系**: 多对 1 关联 交易员

### 交易历史（TradeHistory）

- **字段**: id, trader_id, tx_hash, side, size, price, pnl, timestamp
- **校验**: tx_hash 唯一；timestamp 必须为有效时间
- **关系**: 多对 1 关联 交易员

### 跟单订单（CopyOrder）

- **字段**: id, user_wallet_id, trader_id, amount_usdc, fee_usdc, status, created_at, updated_at
- **校验**: amount_usdc > 0；fee_usdc = amount_usdc * 0.001；status ∈ {pending, active, cancelled, failed}
- **关系**: 多对 1 关联 用户钱包 与 交易员

### 用户钱包（UserWallet）

- **字段**: id, wallet_address, telegram_user_id, language, created_at, updated_at
- **校验**: wallet_address 格式有效；language ∈ {zh, en}
- **关系**: 1 对多 关联 跟单订单

### Telegram 绑定（TelegramBinding）

- **字段**: id, telegram_user_id, wallet_address, binding_status, bound_at
- **校验**: binding_status ∈ {pending, verified, revoked}
- **关系**: 1 对 1 关联 用户钱包

## 关键关系图（文字版）

- 交易员 (1) — (N) 绩效指标
- 交易员 (1) — (N) 交易历史
- 用户钱包 (1) — (N) 跟单订单
- Telegram 绑定 (1) — (1) 用户钱包

## 状态流转

- 跟单订单: pending → active → cancelled | failed
- Telegram 绑定: pending → verified → revoked
