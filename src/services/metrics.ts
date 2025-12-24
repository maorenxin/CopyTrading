import type { TimePeriod } from '../types/trader';

export async function fetchTraderMetrics(traderId: string, period: TimePeriod) {
  const window = period.toLowerCase();
  const response = await fetch(`/api/traders/${traderId}/metrics?window=${window}`);
  if (!response.ok) {
    throw new Error('指标数据加载失败');
  }
  return response.json();
}
