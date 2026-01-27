import { PortfolioPosition, PortfolioSummary, PnLDataPoint } from '../types/trader';

/**
 * 计算资产概览汇总信息。
 * @param positions - 跟单仓位列表。
 * @returns 资产汇总数据。
 */
export function buildPortfolioSummary(positions: PortfolioPosition[]): PortfolioSummary {
  const totalInvested = positions.reduce((sum, position) => sum + position.amount, 0);
  const totalProfit = positions.reduce(
    (sum, position) => sum + position.amount * (position.trader.allTimeReturn / 100),
    0,
  );
  const totalValue = totalInvested + totalProfit;
  const avgReturnPercent = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0;
  return {
    totalInvested,
    totalProfit,
    totalValue,
    avgReturnPercent,
    activeCopies: positions.length,
  };
}

/**
 * 汇总各跟单曲线为组合净值曲线。
 * @param positions - 跟单仓位列表。
 * @returns 组合净值曲线。
 */
export function buildPortfolioSeries(positions: PortfolioPosition[]): PnLDataPoint[] {
  if (positions.length === 0) return [];

  const seriesByPosition = positions.map((position) => {
    const sorted = [...(position.trader.pnlData ?? [])].sort((a, b) => a.timestamp - b.timestamp);
    if (sorted.length === 0) {
      return { amount: position.amount, points: [] as Array<{ timestamp: number; value: number }> };
    }
    const baseValue = sorted[0]?.pnl;
    const base = typeof baseValue === 'number' && baseValue !== 0 ? baseValue : 1;
    const points = sorted.map((point) => ({
      timestamp: point.timestamp,
      value: position.amount * (point.pnl / base),
    }));
    return { amount: position.amount, points };
  });

  const timestampSet = new Set<number>();
  seriesByPosition.forEach((series) => {
    series.points.forEach((point) => timestampSet.add(point.timestamp));
  });
  const timestamps = Array.from(timestampSet).sort((a, b) => a - b);

  if (timestamps.length === 0) {
    const now = Date.now();
    const total = positions.reduce((sum, position) => sum + position.amount, 0);
    return [
      { timestamp: now - 24 * 60 * 60 * 1000, pnl: total },
      { timestamp: now, pnl: total },
    ];
  }

  const pointers = seriesByPosition.map(() => 0);
  const lastValues = seriesByPosition.map(
    (series) => series.points[0]?.value ?? series.amount,
  );
  const result: PnLDataPoint[] = [];
  timestamps.forEach((timestamp) => {
    seriesByPosition.forEach((series, index) => {
      while (pointers[index] < series.points.length && series.points[pointers[index]].timestamp <= timestamp) {
        lastValues[index] = series.points[pointers[index]].value;
        pointers[index] += 1;
      }
    });
    const total = lastValues.reduce((sum, value) => sum + value, 0);
    result.push({ timestamp, pnl: total });
  });

  if (result.length > 120) {
    const step = Math.ceil(result.length / 120);
    return result.filter((_, index) => index % step === 0 || index === result.length - 1);
  }

  return result;
}
