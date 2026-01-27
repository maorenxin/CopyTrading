export interface TraderMetrics {
  traderAge: number; // 1-5 scale
  annualReturn: number; // 1-5 scale
  sharpe: number; // 1-5 scale
  maxDrawdown: number; // 1-5 scale (for MDD)
  balance: number; // 1-5 scale
}

export interface PnLDataPoint {
  timestamp: number;
  pnl: number;
  btcPnl?: number; // For comparison
}

export interface Trade {
  id: string;
  timestamp: number;
  type: "long" | "short";
  entry: number;
  exit: number;
  pnl: number;
  size: number;
  symbol?: string;
  leverage?: number;
  price?: number;
}

export interface Trader {
  id: string;
  address: string;
  rank: number; // Ranking from backend
  metrics: TraderMetrics;
  pnlData: PnLDataPoint[];
  aiStrategy: {
    en: string;
    cn: string;
  };
  aiTags: {
    en: string[];
    cn: string[];
  };
  traderAgeDays: number; // Trader age in days
  followerCount: number;
  allTimeReturn: number; // percentage
  annualizedReturn: number; // ARR - Annual Return Rate percentage
  sharpeRatio: number; // raw sharpe ratio
  maxDrawdownPercent: number; // percentage
  winRatePercent: number; // percentage
  avgTradesPerDay: number;
  lastTradeTimestamp: number;
  trades: Trade[];
  balance: number; // Current balance in USDC
  timeInMarketPercent: number; // percentage of time in market
  avgHoldDays: number; // average holding period in days
  radarScore: number; // Radar area score for ranking
}

export type SortOption =
  | "radarScore"
  | "sharpe"
  | "allTimeReturn"
  | "annualizedReturn"
  | "maxDrawdown"
  | "winRate"
  | "traderAge"
  | "followerCount"
  | "balance"
  | "timeInMarket"
  | "avgHoldDays"
  | "avgTradesPerDay";

export type ViewMode = "card" | "table";
export type Language = "en" | "cn";
export type TimePeriod = "7D" | "30D" | "90D" | "ALL";
export type ColorMode = "standard" | "inverted"; // standard: up=green, down=red; inverted: up=red, down=green

export interface PortfolioPosition {
  id: string;
  trader: Trader;
  amount: number;
  createdAt: number;
}

export interface PortfolioSummary {
  totalInvested: number;
  totalValue: number;
  totalProfit: number;
  avgReturnPercent: number;
  activeCopies: number;
}
