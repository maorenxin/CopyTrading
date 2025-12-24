export interface MetricWindowValues {
  window: "7d" | "30d" | "90d" | "all";
  returnRate: number;
  annualReturnRate: number;
  sharpe: number;
  winRate: number;
  maxDrawdown: number;
  pnl: number;
}

export function normalizeMetricWindow(window: string): MetricWindowValues["window"] {
  if (window === "7d" || window === "30d" || window === "90d" || window === "all") {
    return window;
  }
  return "all";
}

export function calculateRadarScore(values: {
  traderAgeScore: number;
  annualReturnScore: number;
  sharpeScore: number;
  maxDrawdownScore: number;
  balanceScore: number;
}): number {
  const total =
    values.traderAgeScore +
    values.annualReturnScore +
    values.sharpeScore +
    values.maxDrawdownScore +
    values.balanceScore;
  return total / 5;
}
