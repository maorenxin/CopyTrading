import type { RouteDefinition } from './router';
import { getSupabaseClient } from '../services/supabase';

type SortKey =
  | 'sharpe'
  | 'allTimeReturn'
  | 'maxDrawdown'
  | 'winRate'
  | 'traderAge'
  | 'followerCount';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function scoreFromReturn(rate?: number): number {
  if (typeof rate !== 'number') return 3;
  return clamp(rate / 20 + 1, 1, 5);
}

function scoreFromDrawdown(drawdown?: number): number {
  if (typeof drawdown !== 'number') return 3;
  return clamp(5 - drawdown / 10, 1, 5);
}

function scoreFromBalance(balance?: number): number {
  if (typeof balance !== 'number' || balance <= 0) return 3;
  return clamp(Math.log10(balance) / 2, 1, 5);
}

function buildEquitySeries(balance: number, returnRate: number): { timestamp: number; pnl: number; btcPnl: number }[] {
  const points: { timestamp: number; pnl: number; btcPnl: number }[] = [];
  const days = 30;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const start = balance / (1 + returnRate / 100);
  const delta = (balance - start) / days;

  for (let i = days; i >= 0; i--) {
    const timestamp = now - i * dayMs;
    const base = start + delta * (days - i);
    const noise = base * (Math.random() * 0.01 - 0.005);
    points.push({
      timestamp,
      pnl: Math.round((base + noise) * 100) / 100,
      btcPnl: Math.round((base * (0.95 + Math.random() * 0.1)) * 100) / 100,
    });
  }

  return points;
}

export const tradersRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/traders',
    handler: async (request) => {
      const query = (request as any)?.query ?? {};
      const sort: SortKey = query.sort ?? 'allTimeReturn';
      const order: 'asc' | 'desc' = query.order === 'asc' ? 'asc' : 'desc';

      const supabase = getSupabaseClient();
      const { data: traderRows, error } = await supabase
        .from('traders')
        .select('*')
        .limit(200);

      if (error || !traderRows) {
        return { items: [] };
      }

      const traderIds = traderRows.map((row) => row.id);
      const { data: metricRows } = await supabase
        .from('performance_metrics')
        .select('*')
        .in('trader_id', traderIds)
        .eq('window', 'all');

      const metricsByTrader = new Map<string, any>();
      (metricRows ?? []).forEach((row) => metricsByTrader.set(row.trader_id, row));

      const items = traderRows.map((row) => {
        const metric = metricsByTrader.get(row.id) ?? {};
        const balance = Number(row.balance_usdc ?? 0);
        const returnRate = Number(metric.return_rate ?? row.all_time_return ?? 0);

        const metrics = {
          traderAge: metric.trader_age_score ?? scoreFromReturn(row.trader_age_days / 30),
          annualReturn: metric.annual_return_rate ?? scoreFromReturn(row.annualized_return),
          sharpe: clamp(Number(metric.sharpe ?? 3), 1, 5),
          maxDrawdown: metric.max_drawdown ?? scoreFromDrawdown(row.max_drawdown_percent),
          balance: metric.balance_score ?? scoreFromBalance(balance),
        };

        const radarScore = metric.radar_score ?? (metrics.traderAge + metrics.annualReturn + metrics.sharpe + metrics.maxDrawdown + metrics.balance) / 5;

        return {
          id: row.id,
          address: row.vault_address,
          rank: row.rank ?? 0,
          metrics,
          pnlData: buildEquitySeries(balance || 1000, returnRate),
          aiStrategy: {
            en: row.ai_strategy_en ?? '',
            cn: row.ai_strategy_cn ?? '',
          },
          aiTags: {
            en: row.ai_tags_en ?? [],
            cn: row.ai_tags_cn ?? [],
          },
          traderAgeDays: row.trader_age_days ?? 0,
          followerCount: row.follower_count ?? 0,
          allTimeReturn: row.all_time_return ?? returnRate,
          annualizedReturn: row.annualized_return ?? 0,
          maxDrawdownPercent: row.max_drawdown_percent ?? 0,
          winRatePercent: row.win_rate_percent ?? (metric.win_rate ?? 0),
          avgTradesPerDay: row.avg_trades_per_day ?? 0,
          lastTradeTimestamp: row.last_trade_timestamp ?? Date.now(),
          trades: [],
          balance: balance || 0,
          timeInMarketPercent: row.time_in_market_percent ?? 0,
          avgHoldDays: row.avg_hold_days ?? 0,
          radarScore,
        };
      });

      const sortValue = (item: any) => {
        switch (sort) {
          case 'sharpe':
            return item.metrics.sharpe;
          case 'maxDrawdown':
            return item.maxDrawdownPercent;
          case 'winRate':
            return item.winRatePercent;
          case 'traderAge':
            return item.traderAgeDays;
          case 'followerCount':
            return item.followerCount;
          case 'allTimeReturn':
          default:
            return item.allTimeReturn;
        }
      };

      items.sort((a, b) => {
        const aValue = sortValue(a);
        const bValue = sortValue(b);
        return order === 'asc' ? aValue - bValue : bValue - aValue;
      });

      return { items };
    },
  },
];
