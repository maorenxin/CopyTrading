import type { TimePeriod } from '../types/trader';

export async function fetchEquitySeries(traderId: string, period: TimePeriod) {
  const window = period.toLowerCase();
  const response = await fetch(`/api/traders/${traderId}/equity?window=${window}`);
  if (!response.ok) {
    throw new Error('净值数据加载失败');
  }
  return response.json();
}
