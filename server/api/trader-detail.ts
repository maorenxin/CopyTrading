import type { RouteDefinition } from './router';
import { getSupabaseClient } from '../services/supabase';

const normalizeWindow = (value?: string) => {
  if (!value) return 'all';
  const lower = value.toLowerCase();
  if (['7d', '30d', '90d', 'all'].includes(lower)) return lower;
  return 'all';
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveWindowDays = (window: string) => {
  switch (window) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
    case 'all':
    default:
      return 180;
  }
};

function buildEquitySeries(balance: number, returnRate: number, window: string) {
  const points: { timestamp: string; vault_equity: number; btc_equity: number }[] = [];
  const days = resolveWindowDays(window);
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const start = balance / (1 + returnRate / 100);
  const delta = (balance - start) / days;

  for (let i = days; i >= 0; i--) {
    const timestamp = new Date(now - i * dayMs).toISOString();
    const base = start + delta * (days - i);
    const noise = base * (Math.random() * 0.01 - 0.005);
    points.push({
      timestamp,
      vault_equity: Math.round((base + noise) * 100) / 100,
      btc_equity: Math.round((base * (0.95 + Math.random() * 0.1)) * 100) / 100,
    });
  }

  return points;
}

export const traderDetailRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/traders/:traderId',
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const traderId = params.traderId;
      const supabase = getSupabaseClient();

      const { data, error } = await supabase.from('traders').select('*').eq('id', traderId).single();

      if (error || !data) {
        return { id: traderId, metrics: {} };
      }

      return {
        id: data.id,
        address: data.vault_address,
        display_name: data.display_name,
        metrics: {},
        risk_notice: '',
      };
    },
  },
  {
    method: 'GET',
    path: '/traders/:traderId/metrics',
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const query = (request as any)?.query ?? {};
      const traderId = params.traderId;
      const window = normalizeWindow(query.window);
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('performance_metrics')
        .select('*')
        .eq('trader_id', traderId)
        .eq('window', window)
        .single();

      if (error || !data) {
        return { window };
      }

      return {
        window,
        return_rate: toNumber(data.return_rate),
        annual_return_rate: toNumber(data.annual_return_rate),
        sharpe: toNumber(data.sharpe),
        win_rate: toNumber(data.win_rate),
        max_drawdown: toNumber(data.max_drawdown),
        pnl: toNumber(data.pnl),
      };
    },
  },
  {
    method: 'GET',
    path: '/traders/:traderId/trades',
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const query = (request as any)?.query ?? {};
      const traderId = params.traderId;
      const limit = Math.min(Number(query.limit ?? 50), 200);
      const supabase = getSupabaseClient();

      const { data } = await supabase
        .from('trade_history')
        .select('*')
        .eq('trader_id', traderId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      return { items: data ?? [] };
    },
  },
  {
    method: 'GET',
    path: '/traders/:traderId/equity',
    handler: async (request) => {
      const params = (request as any)?.params ?? {};
      const query = (request as any)?.query ?? {};
      const traderId = params.traderId;
      const window = normalizeWindow(query.window);
      const supabase = getSupabaseClient();

      const [{ data: traderRow }, { data: metricRow }] = await Promise.all([
        supabase.from('traders').select('*').eq('id', traderId).single(),
        supabase.from('performance_metrics').select('*').eq('trader_id', traderId).eq('window', window).single(),
      ]);

      const balance = toNumber(traderRow?.balance_usdc, 1000);
      const returnRate = toNumber(metricRow?.return_rate ?? traderRow?.all_time_return, 0);

      return { points: buildEquitySeries(balance, returnRate, window) };
    },
  },
];
