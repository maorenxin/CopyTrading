-- 跟单平台基础表结构（Supabase/Postgres）

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
  window text not null,
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
create index if not exists idx_metrics_trader on performance_metrics(trader_id, window);
create index if not exists idx_trades_trader on trade_history(trader_id);
create index if not exists idx_orders_wallet on copy_orders(user_wallet_id);
