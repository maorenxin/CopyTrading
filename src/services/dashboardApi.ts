/**
 * API client for paper trading dashboard backend.
 */

const API_BASE = '/api';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`API ${path}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface StrategyStatus {
  mode: string;
  equity: number;
  daily_pnl: number;
  cumulative_pnl: number;
  drawdown: number;
  leverage: number;
  positions: Position[];
  last_rebalance: string | null;
  running_days: number;
  nav_updated_at: string | null;
}

export interface Position {
  id: number;
  date: string;
  coin: string;
  side: 'long' | 'short';
  notional: number;
  entry_price: number;
  signal_score: number;
  daily_pnl: number;
  mark_price?: number | null;
  unrealized_pnl?: number;
}

export interface DailySnapshot {
  date: string;
  equity: number;
  daily_pnl: number;
  cumulative_pnl: number;
  drawdown: number;
  leverage: number;
  n_longs: number;
  n_shorts: number;
  fees: number;
  mode: string;
}

export interface Trade {
  id: number;
  date: string;
  coin: string;
  action: string;
  notional: number;
  price: number;
  fee: number;
}

export interface Signal {
  date: string;
  coin: string;
  momentum_score: number;
  rank: number;
  selected: 'long' | 'short' | null;
}

export interface Metrics {
  sharpe: number;
  arr: number;
  mdd: number;
  sortino: number;
  win_rate: number;
  days: number;
  total_return?: number;
}

export interface StrategyConfig {
  mode: string;
  initial_capital: number;
  n_long: number;
  n_short: number;
  leverage: number;
  momentum_window: number;
  fee_bps: number;
  exclude_coins: string[];
  rebalance_hour_utc: number;
}

export const dashboardApi = {
  getStatus: () => fetchJSON<StrategyStatus>('/status'),
  getPositions: () => fetchJSON<Position[]>('/positions'),
  getHistory: (days = 365) => fetchJSON<DailySnapshot[]>(`/history?days=${days}`),
  getTrades: (days = 30) => fetchJSON<Trade[]>(`/trades?days=${days}`),
  getSignals: (date?: string) => fetchJSON<Signal[]>(date ? `/signals?date=${date}` : '/signals'),
  getMetrics: () => fetchJSON<Metrics>('/metrics'),
  getConfig: () => fetchJSON<StrategyConfig>('/config'),
  triggerRebalance: (date?: string) =>
    fetch(`${API_BASE}/rebalance${date ? `?date=${date}` : ''}`, { method: 'POST' }).then(r => r.json()),
};
