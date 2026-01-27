export interface VaultSummary {
  vault_address: string;
  name?: string | null;
  status?: string | null;
  tvl_usdc?: number | null;
  annualized_return?: number | null;
  sharpe?: number | null;
  max_drawdown?: number | null;
  last_trade_at?: string | null;
  last_sync_run_id?: string | null;
}

export interface VaultDetail extends VaultSummary {
  manager_address?: string | null;
  creator_address?: string | null;
  description?: string | null;
  all_time_return?: number | null;
  last_ws_trade_at?: string | null;
}

export interface VaultTrade {
  vault_address: string;
  tx_hash: string;
  coin?: string | null;
  side?: string | null;
  price?: number | null;
  size?: number | null;
  start_position?: number | null;
  end_position?: number | null;
  pnl?: number | null;
  utc_time?: string | null;
  timestamp?: string | null;
  source?: string | null;
  sync_run_id?: string | null;
}

export interface VaultPosition {
  vault_address: string;
  symbol?: string | null;
  side?: string | null;
  leverage?: number | null;
  quantity?: number | null;
  entry_price?: number | null;
  mark_price?: number | null;
  position_value?: number | null;
  roe_percent?: number | null;
  sync_run_id?: string | null;
}

export interface VaultDepositor {
  vault_address: string;
  depositor_address?: string | null;
  amount_usdc?: number | null;
  share_percent?: number | null;
  sync_run_id?: string | null;
}

export interface VaultListResponse {
  items: VaultSummary[];
  nextCursor?: string | null;
  next_cursor?: string | null;
}
