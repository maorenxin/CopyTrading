import { PortfolioPosition, PortfolioSummary, PnLDataPoint } from '../types/trader';

/**
 * 计算资产概览汇总信息。
 * @param positions - 跟单仓位列表。
 * @returns 资产汇总数据。
 */
export function buildPortfolioSummary(positions: PortfolioPosition[]): PortfolioSummary {
  const totalInvested = positions.reduce((sum, position) => sum + position.amount, 0);
  const totalProfit = 0;
  const totalValue = totalInvested;
  const avgReturnPercent = 0;
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

  const sorted = [...positions].sort((a, b) => a.createdAt - b.createdAt);
  const result: PnLDataPoint[] = [];
  let runningTotal = 0;
  sorted.forEach((position) => {
    runningTotal += position.amount;
    result.push({ timestamp: position.createdAt, pnl: runningTotal });
  });

  if (result.length === 1) {
    const only = result[0];
    result.unshift({ timestamp: only.timestamp - 60 * 60 * 1000, pnl: only.pnl });
  }

  result.push({ timestamp: Date.now(), pnl: runningTotal });
  return result;
}
