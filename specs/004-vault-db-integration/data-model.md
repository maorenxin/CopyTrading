# 数据模型: Vault 数据落库与联调

**日期**: 2026-01-22

## 实体与字段

### Vault

- **字段**: id, vault_address, name, manager_address, creator_address, status, description, tvl_usdc,
  all_time_return, annualized_return, sharpe, max_drawdown, last_trade_at, last_ws_trade_at,
  created_at, updated_at, last_sync_run_id
- **校验**: vault_address 必填且唯一；数值字段为非 NaN；status ∈ {active, closed, paused, unknown}
- **关系**: 1 对多 关联 VaultTrade、VaultPosition、VaultDepositor；多对 1 关联 SyncRun（最近批次）

### VaultTrade

- **字段**: id, vault_id, tx_hash, side, price, size, pnl, timestamp, source, synced_at, sync_run_id
- **校验**: (vault_id, tx_hash) 唯一；timestamp 必须为有效时间
- **关系**: 多对 1 关联 Vault 与 SyncRun

### VaultPosition

- **字段**: id, vault_id, symbol, side, leverage, quantity, entry_price, mark_price,
  position_value, roe_percent, synced_at, sync_run_id
- **校验**: quantity ≥ 0；leverage ≥ 0；symbol 非空时需为有效标识
- **关系**: 多对 1 关联 Vault 与 SyncRun

### VaultDepositor

- **字段**: id, vault_id, depositor_address, amount_usdc, share_percent, synced_at, sync_run_id
- **校验**: amount_usdc ≥ 0；share_percent ∈ [0, 100]
- **关系**: 多对 1 关联 Vault 与 SyncRun

### SyncRun

- **字段**: id, source, started_at, finished_at, status, vault_count, success_count,
  failed_vaults, note
- **校验**: status ∈ {running, success, partial, failed}；计数字段 ≥ 0
- **关系**: 1 对多 关联 Vault/VaultTrade/VaultPosition/VaultDepositor

### 对账摘要（ReconcileSummary）

- **字段**: id, sync_run_id, csv_vaults_count, db_vaults_count, csv_trades_count, db_trades_count,
  csv_positions_count, db_positions_count, csv_depositors_count, db_depositors_count,
  diff_vaults_count, diff_trades_count, diff_positions_count, diff_depositors_count, created_at
- **校验**: 所有计数字段 ≥ 0
- **关系**: 1 对 1 关联 SyncRun

## 关键关系图（文字版）

- SyncRun (1) — (N) Vault / VaultTrade / VaultPosition / VaultDepositor
- Vault (1) — (N) VaultTrade / VaultPosition / VaultDepositor
- SyncRun (1) — (1) ReconcileSummary

## 状态流转

- SyncRun: running → success | partial | failed
