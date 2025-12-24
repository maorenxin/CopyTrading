export interface TelegramMessage {
  text: string;
}

export function formatPortfolioSummary(summary: {
  totalValue: number;
  activeOrders: number;
  pnl: number;
}): TelegramMessage {
  return {
    text: `资产总值: ${summary.totalValue}\n活跃订单: ${summary.activeOrders}\n盈亏: ${summary.pnl}`,
  };
}
