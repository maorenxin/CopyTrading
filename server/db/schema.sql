-- 跟单平台基础表结构（PostgreSQL）

create table if not exists traders (
  id uuid primary key,
  vault_address text not null,
  display_name text,
  avatar_url text,
  status text not null,
  rank integer,
  trader_age_days integer,
  follower_count integer,
  all_time_return numeric,
  annualized_return numeric,
  max_drawdown_percent numeric,
  win_rate_percent numeric,
  avg_trades_per_day numeric,
  last_trade_timestamp timestamptz,
  balance_usdc numeric,
  time_in_market_percent numeric,
  avg_hold_days numeric,
  radar_score numeric,
  ai_strategy_en text,
  ai_strategy_cn text,
  ai_tags_en text[],
  ai_tags_cn text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists performance_metrics (
  id uuid primary key,
  trader_id uuid references traders(id),
  "window" text not null,
  return_rate numeric,
  annual_return_rate numeric,
  sharpe numeric,
  win_rate numeric,
  max_drawdown numeric,
  pnl numeric,
  pnl_volatility numeric,
  pnl_bias numeric,
  balance_score numeric,
  trader_age_score numeric,
  radar_score numeric,
  updated_at timestamptz default now()
);

create table if not exists trade_history (
  id uuid primary key,
  trader_id uuid references traders(id),
  tx_hash text unique,
  side text,
  size numeric,
  price numeric,
  pnl numeric,
  timestamp timestamptz
);

create table if not exists user_wallets (
  id uuid primary key,
  wallet_address text not null,
  telegram_user_id text,
  language text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists copy_orders (
  id uuid primary key,
  user_wallet_id uuid references user_wallets(id),
  trader_id uuid references traders(id),
  amount_usdc numeric not null,
  fee_usdc numeric not null,
  status text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists telegram_bindings (
  id uuid primary key,
  telegram_user_id text not null,
  wallet_address text not null,
  binding_status text not null,
  bound_at timestamptz
);

create index if not exists idx_traders_vault_address on traders(vault_address);
create index if not exists idx_metrics_trader on performance_metrics(trader_id, "window");
create index if not exists idx_trades_trader on trade_history(trader_id);
create index if not exists idx_orders_wallet on copy_orders(user_wallet_id);

-- Vault 同步相关表结构

drop table if exists vault_trades;
drop table if exists vault_funding;
drop table if exists vault_nonfunding_ledger;
drop table if exists vault_positions;
drop table if exists vault_depositors;
drop table if exists vault_info;
drop table if exists vaults;

create table if not exists vault_info (
  vault_address text primary key,
  name text,
  leader_address text,
  manager_address text,
  creator_address text,
  status text,
  is_closed boolean,
  relationship_type text,
  create_time_millis bigint,
  description text,
  tvl_usdc numeric,
  apr numeric,
  all_time_return numeric,
  annualized_return numeric,
  sharpe numeric,
  max_drawdown numeric,
  nav_start numeric,
  nav_end numeric,
  balance numeric,
  mdd numeric,
  win_rate numeric,
  time_in_market numeric,
  avg_hold_days numeric,
  trader_age_hours numeric,
  follower_count integer,
  avg_depositor_hold_days numeric,
  avg_trades_per_day numeric,
  freq text,
  metrics_mode text,
  metrics_window text,
  nav_json jsonb,
  radar_balance_score numeric,
  radar_mdd_score numeric,
  radar_sharpe_score numeric,
  radar_return_score numeric,
  radar_age_score numeric,
  radar_area numeric,
  ai_tags jsonb,
  last_trade_at timestamptz,
  last_ws_trade_at timestamptz,
  last_sync_run_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists vault_trades (
  vault_address text references vault_info(vault_address),
  tx_hash text not null,
  coin text,
  side text,
  price numeric,
  size numeric,
  start_position numeric,
  end_position numeric,
  pnl numeric,
  utc_time timestamptz,
  timestamp timestamp,
  source text,
  sync_run_id uuid,
  synced_at timestamptz default now(),
  primary key (vault_address, tx_hash)
);

create table if not exists vault_funding (
  vault_address text references vault_info(vault_address),
  utc_time timestamptz,
  timestamp timestamp,
  entry_type text,
  coin text,
  usdc numeric,
  szi numeric,
  funding_rate numeric,
  n_samples numeric,
  sync_run_id uuid,
  synced_at timestamptz default now(),
  primary key (vault_address, utc_time, coin, entry_type)
);

create table if not exists vault_nonfunding_ledger (
  vault_address text references vault_info(vault_address),
  utc_time timestamptz,
  timestamp timestamp,
  tx_hash text,
  ledger_type text,
  usdc numeric,
  commission numeric,
  sync_run_id uuid,
  synced_at timestamptz default now(),
  primary key (vault_address, tx_hash, utc_time, ledger_type)
);

create table if not exists vault_positions (
  vault_address text references vault_info(vault_address),
  symbol text,
  side text,
  leverage numeric,
  quantity numeric,
  entry_price numeric,
  mark_price numeric,
  position_value numeric,
  roe_percent numeric,
  sync_run_id uuid,
  synced_at timestamptz default now(),
  primary key (vault_address, symbol, side)
);

create table if not exists vault_depositors (
  vault_address text references vault_info(vault_address),
  depositor_address text,
  amount_usdc numeric,
  share_percent numeric,
  sync_run_id uuid,
  synced_at timestamptz default now(),
  primary key (vault_address, depositor_address)
);

create table if not exists sync_runs (
  id uuid primary key,
  source text,
  started_at timestamptz,
  finished_at timestamptz,
  status text,
  vault_count integer,
  success_count integer,
  failed_vaults text[],
  websocket_vaults text[],
  note text
);


create table if not exists reconcile_summaries (
  id uuid primary key,
  sync_run_id uuid,
  csv_vaults_count integer,
  db_vaults_count integer,
  csv_trades_count integer,
  db_trades_count integer,
  csv_positions_count integer,
  db_positions_count integer,
  csv_depositors_count integer,
  db_depositors_count integer,
  diff_vaults_count integer,
  diff_trades_count integer,
  diff_positions_count integer,
  diff_depositors_count integer,
  created_at timestamptz default now()
);

create table if not exists crypto_prices_1h (
  source text not null,
  symbol text not null,
  interval text not null,
  open_time_ms bigint not null,
  utc_time timestamptz,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric,
  updated_at timestamptz default now(),
  primary key (source, symbol, interval, open_time_ms)
);

create table if not exists crypto_sync_state (
  source text not null,
  symbol text not null,
  interval text not null,
  last_time bigint,
  updated_at timestamptz default now(),
  primary key (source, symbol, interval)
);

create index if not exists idx_vault_info_address on vault_info(vault_address);
create index if not exists idx_vault_info_sync_run on vault_info(last_sync_run_id);
create index if not exists idx_vault_trades_vault on vault_trades(vault_address);
create index if not exists idx_vault_trades_time on vault_trades(utc_time);
create index if not exists idx_vault_trades_sync_run on vault_trades(sync_run_id);
create index if not exists idx_vault_positions_vault on vault_positions(vault_address);
create index if not exists idx_vault_positions_sync_run on vault_positions(sync_run_id);
create index if not exists idx_vault_depositors_vault on vault_depositors(vault_address);
create index if not exists idx_vault_depositors_sync_run on vault_depositors(sync_run_id);
create index if not exists idx_vault_funding_vault on vault_funding(vault_address);
create index if not exists idx_vault_funding_time on vault_funding(utc_time);
create index if not exists idx_vault_ledger_vault on vault_nonfunding_ledger(vault_address);
create index if not exists idx_vault_ledger_time on vault_nonfunding_ledger(utc_time);
create index if not exists idx_sync_runs_started on sync_runs(started_at);
create unique index if not exists idx_reconcile_summaries_sync_run on reconcile_summaries(sync_run_id);
create index if not exists idx_crypto_prices_symbol_time on crypto_prices_1h(symbol, open_time_ms);
