# CopyTradingCodex API

Base URL (API server): `http://localhost:4000`  
Frontend proxy (Vite dev): `http://127.0.0.1:3000/api`

All responses are JSON. `vault_address` is the primary key for Vault data.

## Vaults

### List vaults
`GET /vaults`

Query:
- `limit` (number, default 200, max 1000)
- `cursor` (string, vault_address for pagination)

Response:
```json
{
  "items": [
    {
      "vault_address": "0x...",
      "name": "Vault Name",
      "leader_address": "0x...",
      "manager_address": "0x...",
      "creator_address": "0x...",
      "status": "active",
      "is_closed": false,
      "relationship_type": "normal",
      "create_time_millis": "1683243596849",
      "description": "",
      "tvl_usdc": "12345.67",
      "apr": "0.12",
      "all_time_return": "0.45",
      "annualized_return": "0.12",
      "sharpe": "1.23",
      "max_drawdown": "-0.2",
      "last_trade_at": "2024-01-01T00:00:00.000Z",
      "last_ws_trade_at": null,
      "last_sync_run_id": "uuid",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "nextCursor": "0x..."
}
```

### Vault detail
`GET /vaults/:vaultAddress`

Response: single vault row (same fields as list).

### Vault trades
`GET /vaults/:vaultAddress/trades`

Query:
- `limit` (number, default 200, max 1000)

Response:
```json
{
  "items": [
    {
      "vault_address": "0x...",
      "tx_hash": "0x...",
      "side": "buy",
      "price": "123.45",
      "size": "0.5",
      "pnl": "0.1",
      "utc_time": "2024-01-01T00:00:00.000Z",
      "timestamp": "2024-01-01 08:00:00",
      "source": "sync",
      "sync_run_id": "uuid",
      "synced_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Vault funding
`GET /vaults/:vaultAddress/funding`

Query:
- `limit` (number, default 200, max 1000)

Response:
```json
{
  "items": [
    {
      "vault_address": "0x...",
      "utc_time": "2024-01-01T00:00:00.000Z",
      "timestamp": "2024-01-01 08:00:00",
      "entry_type": "funding",
      "coin": "BTC",
      "usdc": "12.34",
      "szi": "0.01",
      "funding_rate": "0.0001",
      "n_samples": "24",
      "sync_run_id": "uuid",
      "synced_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Vault ledger (non-funding)
`GET /vaults/:vaultAddress/ledger`

Query:
- `limit` (number, default 200, max 1000)

Response:
```json
{
  "items": [
    {
      "vault_address": "0x...",
      "utc_time": "2024-01-01T00:00:00.000Z",
      "timestamp": "2024-01-01 08:00:00",
      "tx_hash": "0x...",
      "ledger_type": "transfer",
      "usdc": "100.0",
      "commission": "0.1",
      "sync_run_id": "uuid",
      "synced_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Vault positions
`GET /vaults/:vaultAddress/positions`

Response:
```json
{
  "items": [
    {
      "vault_address": "0x...",
      "symbol": "BTC",
      "side": "long",
      "leverage": "3",
      "quantity": "0.1",
      "entry_price": "30000",
      "mark_price": "31000",
      "position_value": "3100",
      "roe_percent": "0.05",
      "sync_run_id": "uuid",
      "synced_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Vault depositors
`GET /vaults/:vaultAddress/depositors`

Response:
```json
{
  "items": [
    {
      "vault_address": "0x...",
      "depositor_address": "0x...",
      "amount_usdc": "1000",
      "share_percent": "0.12",
      "sync_run_id": "uuid",
      "synced_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### Vault quantstats
`GET /vaults/:vaultAddress/quantstats`

Response:
```json
{
  "vault_address": "0x...",
  "nav_start": "10000",
  "nav_end": "12000",
  "balance": "12000",
  "annualized_return": "0.2",
  "sharpe": "1.5",
  "mdd": "-0.1",
  "win_rate": "0.6",
  "time_in_market": "0.9",
  "avg_hold_days": "10",
  "trader_age_hours": "800",
  "freq": "D",
  "metrics_mode": "full",
  "metrics_window": "all",
  "source": "vault_quantstat.csv",
  "formula_version": "quantstats-v1",
  "sync_run_id": "uuid",
  "created_at": "2024-01-01T00:00:00.000Z"
}
```

## Sync runs

### List sync runs
`GET /sync-runs`

Query:
- `limit` (number, default 50, max 200)

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "source": "csv",
      "started_at": "2024-01-01T00:00:00.000Z",
      "finished_at": "2024-01-01T00:00:00.000Z",
      "status": "success",
      "vault_count": 100,
      "success_count": 100,
      "failed_vaults": [],
      "websocket_vaults": [],
      "note": "vaults:100, success:100, failed:0",
      "reconcile_summary": {
        "csv_vaults_count": 100,
        "db_vaults_count": 100,
        "csv_trades_count": 1000,
        "db_trades_count": 1000,
        "csv_positions_count": null,
        "db_positions_count": 0,
        "csv_depositors_count": null,
        "db_depositors_count": 0,
        "diff_vaults_count": 0,
        "diff_trades_count": 0,
        "diff_positions_count": null,
        "diff_depositors_count": null
      }
    }
  ]
}
```

## CSV → DB Sync

### Trigger CSV sync
`POST /vaults/sync`

Response:
```json
{
  "syncRunId": "uuid",
  "status": "success"
}
```
