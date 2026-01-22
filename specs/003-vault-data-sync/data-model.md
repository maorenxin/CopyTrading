# 数据模型: Vault 数据同步

## Vault

**说明**: Vault 的基础信息与整体指标。

**关键字段**:
- `id` (UUID): 主键。
- `vault_address` (string): Vault 地址，唯一。
- `name` (string): Vault 名称。
- `manager_address` (string): Vault 管理者地址。
- `status` (string): 状态（如 active/inactive）。
- `tvl_usdc` (number): 总锁仓价值。
- `all_time_return` (number): 累计回报。
- `sharpe` (number): Sharpe 指标。
- `max_drawdown` (number): 最大回撤。
- `last_trade_at` (timestamp): 最近成交时间。
- `last_ws_trade_at` (timestamp): 最近通过 WebSocket 捕获的成交时间。
- `synced_at` (timestamp): 最近同步时间。

**关系**:
- 一对多 → `VaultTrade`
- 一对多 → `VaultPosition`
- 一对多 → `VaultDepositor`

**校验规则**:
- `vault_address` 必须唯一且非空。
- 数值字段不得为负（除非业务允许的回撤字段）。

## VaultTrade

**说明**: Vault 的历史成交记录。

**关键字段**:
- `id` (UUID): 主键。
- `vault_id` (UUID): 外键关联 Vault。
- `tx_hash` (string): 交易哈希，唯一。
- `side` (string): 方向（long/short）。
- `price` (number): 成交价格。
- `size` (number): 成交数量。
- `pnl` (number): 成交盈亏。
- `timestamp` (timestamp): 成交时间。
- `source` (string): 数据来源（sync/ws）。
- `synced_at` (timestamp): 同步时间。

**关系**:
- 多对一 → `Vault`

**校验规则**:
- `tx_hash` 必须唯一。
- `timestamp` 必须存在。

## VaultPosition

**说明**: Vault 当前持仓快照。

**关键字段**:
- `id` (UUID): 主键。
- `vault_id` (UUID): 外键关联 Vault。
- `symbol` (string): 币种。
- `side` (string): 方向（long/short）。
- `leverage` (number): 杠杆倍数。
- `quantity` (number): 持仓数量。
- `entry_price` (number): 开仓价格。
- `mark_price` (number): 标记价格。
- `position_value` (number): 仓位价值。
- `roe_percent` (number): ROE 百分比。
- `synced_at` (timestamp): 同步时间。

**关系**:
- 多对一 → `Vault`

**校验规则**:
- `symbol`、`side` 必填。
- 数值字段不得为负（除非允许负盈亏）。

## VaultDepositor

**说明**: Vault 存款人信息。

**关键字段**:
- `id` (UUID): 主键。
- `vault_id` (UUID): 外键关联 Vault。
- `depositor_address` (string): 存款人地址。
- `amount_usdc` (number): 存款金额。
- `share_percent` (number): 占比。
- `synced_at` (timestamp): 同步时间。

**关系**:
- 多对一 → `Vault`

**校验规则**:
- `depositor_address` 必须存在。
- `share_percent` 在 0-100 范围内。

## SyncRun

**说明**: 每次同步任务的执行记录。

**关键字段**:
- `id` (UUID): 主键。
- `source` (string): 数据来源（官方接口/页面回退）。
- `started_at` (timestamp): 同步开始时间。
- `finished_at` (timestamp): 同步结束时间。
- `status` (string): 状态（success/partial/failed）。
- `vault_count` (number): 处理的 Vault 数。
- `success_count` (number): 成功 Vault 数。
- `failed_vaults` (string[]): 失败的 Vault 列表。
- `websocket_vaults` (string[]): 启用 WebSocket 监听的 Vault 地址列表。
- `note` (string): 结果摘要或错误信息。

**校验规则**:
- `started_at` 必填。
- `status` 必须在允许值范围内。
