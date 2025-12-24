import { Trader } from '../types/trader';

// Helper function to generate PnL data with optional bias
function generatePnLData(startDate: number, endDate: number, volatility: number, bias: number = 0): any[] {
  const data = [];
  let currentPnl = 1000; // Start with $1000
  let currentBtcPnl = 1000;
  const dayInMs = 24 * 60 * 60 * 1000;
  
  for (let time = startDate; time <= endDate; time += dayInMs) {
    // bias allows us to shift the probability distribution
    // bias = 0: symmetric (-0.5 to 0.5)
    // bias < 0: negative tendency
    // bias > 0: positive tendency
    const change = (Math.random() - 0.5 + bias) * volatility;
    const btcChange = (Math.random() - 0.48) * (volatility * 0.8);
    currentPnl = currentPnl * (1 + change / 100);
    currentBtcPnl = currentBtcPnl * (1 + btcChange / 100);
    
    data.push({
      timestamp: time,
      pnl: Math.round(currentPnl * 100) / 100,
      btcPnl: Math.round(currentBtcPnl * 100) / 100
    });
  }
  
  return data;
}

// Helper function to generate trade history
function generateTrades(count: number, startDate: number, endDate: number): any[] {
  const trades = [];
  const timeRange = endDate - startDate;
  
  for (let i = 0; i < count; i++) {
    const timestamp = startDate + Math.random() * timeRange;
    const type = Math.random() > 0.5 ? 'long' : 'short';
    const entry = 30000 + Math.random() * 40000;
    const exitMultiplier = Math.random() > 0.4 ? 1 + Math.random() * 0.1 : 1 - Math.random() * 0.05;
    const exit = entry * exitMultiplier;
    const size = 100 + Math.random() * 900;
    const pnl = type === 'long' ? (exit - entry) * size / entry : (entry - exit) * size / entry;
    
    trades.push({
      id: `trade-${i}`,
      timestamp: Math.floor(timestamp),
      type,
      entry: Math.round(entry * 100) / 100,
      exit: Math.round(exit * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      size: Math.round(size * 100) / 100
    });
  }
  
  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

// Template traders with different characteristics
const traderTemplates = [
  {
    metrics: { traderAge: 5, annualReturn: 5, sharpe: 5, maxDrawdown: 5, balance: 5 },
    pnlVolatility: 3,
    pnlBias: 0.1, // Positive bias for high performers
    aiStrategy: {
      en: "Momentum-based swing trading with strict risk management",
      cn: "基于动量的波段交易与严格风险管理"
    },
    aiTags: {
      en: ["Momentum Trading", "Risk Management", "Swing Trading", "High Win Rate", "Trend Following"],
      cn: ["动量交易", "风险管理", "波段交易", "高胜率", "趋势跟随"]
    },
    traderAgeDays: 720, // 24 months = 720 days
    allTimeReturn: 250,
    annualizedReturn: 125,
    maxDrawdownPercent: 8,
    winRatePercent: 75,
    avgTradesPerDay: 3,
    tradeCount: 500,
    timeInMarketPercent: 85,
    avgHoldDays: 2.5
  },
  {
    metrics: { traderAge: 4, annualReturn: 4, sharpe: 4, maxDrawdown: 4, balance: 4 },
    pnlVolatility: 4,
    pnlBias: 0.05, // Slight positive bias
    aiStrategy: {
      en: "Mean reversion strategy with technical indicators",
      cn: "均值回归策略结合技术指标"
    },
    aiTags: {
      en: ["Mean Reversion", "Technical Analysis", "Day Trading", "RSI Strategy", "Support/Resistance"],
      cn: ["均值回归", "技术分析", "日内交易", "RSI策略", "支撑阻力"]
    },
    traderAgeDays: 540, // 18 months = 540 days
    allTimeReturn: 180,
    annualizedReturn: 95,
    maxDrawdownPercent: 12,
    winRatePercent: 68,
    avgTradesPerDay: 5,
    tradeCount: 800,
    timeInMarketPercent: 72,
    avgHoldDays: 1.2
  },
  {
    metrics: { traderAge: 3, annualReturn: 3, sharpe: 3, maxDrawdown: 3, balance: 3 },
    pnlVolatility: 5,
    pnlBias: 0, // No bias - neutral performance
    aiStrategy: {
      en: "Breakout trading with volume confirmation",
      cn: "突破交易结合成交量确认"
    },
    aiTags: {
      en: ["Breakout Strategy", "Volume Analysis", "Trend Following", "Pattern Recognition", "Volatility Trading"],
      cn: ["突破策略", "成交量分析", "趋势跟随", "形态识别", "波动率交易"]
    },
    traderAgeDays: 360, // 12 months = 360 days
    allTimeReturn: 85,
    annualizedReturn: 68,
    maxDrawdownPercent: 18,
    winRatePercent: 58,
    avgTradesPerDay: 4,
    tradeCount: 400,
    timeInMarketPercent: 65,
    avgHoldDays: 3.8
  },
  {
    metrics: { traderAge: 2, annualReturn: 2, sharpe: 2, maxDrawdown: 2, balance: 2 },
    pnlVolatility: 6,
    pnlBias: -0.05, // Slight negative bias
    aiStrategy: {
      en: "Scalping strategy focused on quick profits",
      cn: "剥头皮策略专注快速获利"
    },
    aiTags: {
      en: ["Scalping", "High Frequency", "Quick Trades", "Low Hold Time", "Active Trading"],
      cn: ["剥头皮", "高频交易", "快速交易", "低持仓时间", "活跃交易"]
    },
    traderAgeDays: 180, // 6 months = 180 days
    allTimeReturn: 25,
    annualizedReturn: 42,
    maxDrawdownPercent: 25,
    winRatePercent: 52,
    avgTradesPerDay: 12,
    tradeCount: 1500,
    timeInMarketPercent: 45,
    avgHoldDays: 0.3
  },
  {
    metrics: { traderAge: 1, annualReturn: 1, sharpe: 1, maxDrawdown: 1, balance: 1 },
    pnlVolatility: 8,
    pnlBias: -0.15, // Negative bias for poor performers
    aiStrategy: {
      en: "Experimental trading with high risk tolerance",
      cn: "实验性交易高风险承受能力"
    },
    aiTags: {
      en: ["High Risk", "Experimental", "Aggressive", "Large Drawdown", "Contrarian"],
      cn: ["高风险", "实验性", "激进型", "大回撤", "逆势交易"]
    },
    traderAgeDays: 90, // 3 months = 90 days
    allTimeReturn: -15,
    annualizedReturn: -28,
    maxDrawdownPercent: 40,
    winRatePercent: 42,
    avgTradesPerDay: 8,
    tradeCount: 600,
    timeInMarketPercent: 55,
    avgHoldDays: 0.8
  }
];

function generateTraders(count: number): Trader[] {
  const traders: Trader[] = [];
  const now = Date.now();
  const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
  
  for (let i = 0; i < count; i++) {
    const template = traderTemplates[i % traderTemplates.length];
    const variation = (Math.random() - 0.5) * 0.3;
    
    const trader: Trader = {
      id: `trader-${i}`,
      address: `0x${Math.random().toString(16).substring(2, 10)}`,
      rank: i + 1,
      metrics: {
        traderAge: Math.max(1, Math.min(5, template.metrics!.traderAge * (1 + variation * 0.5))),
        annualReturn: Math.max(1, Math.min(5, template.metrics!.annualReturn * (1 + variation * 0.5))),
        sharpe: Math.max(1, Math.min(5, template.metrics!.sharpe * (1 + variation * 0.5))),
        maxDrawdown: Math.max(1, Math.min(5, template.metrics!.maxDrawdown * (1 + variation * 0.5))),
        balance: Math.max(1, Math.min(5, template.metrics!.balance * (1 + variation * 0.5)))
      },
      // Pass the bias parameter to generatePnLData
      pnlData: generatePnLData(
        oneYearAgo, 
        now, 
        template.pnlVolatility! * (1 + variation),
        template.pnlBias! * (1 + variation * 0.5) // Add variation to bias as well
      ),
      aiStrategy: template.aiStrategy!,
      aiTags: template.aiTags!,
      traderAgeDays: Math.max(1, Math.floor(template.traderAgeDays! * (1 + variation * 0.8))),
      followerCount: Math.floor(Math.random() * 5000 + 100),
      allTimeReturn: template.allTimeReturn! * (1 + variation),
      annualizedReturn: template.annualizedReturn! * (1 + variation),
      maxDrawdownPercent: template.maxDrawdownPercent! * (1 + variation * 0.6),
      winRatePercent: Math.max(30, Math.min(90, template.winRatePercent! * (1 + variation * 0.5))),
      avgTradesPerDay: Math.max(0.5, template.avgTradesPerDay! * (1 + variation * 0.8)),
      lastTradeTimestamp: now - Math.floor(Math.random() * 24 * 60 * 60 * 1000),
      trades: generateTrades(template.tradeCount!, oneYearAgo, now),
      // Generate balance with varied ranges: some small ($100s), some medium ($1K-50K), some large ($1M-100M), some huge ($1B+)
      balance: Math.random() > 0.7 
        ? Math.floor(Math.random() * 100_000_000 + 1_000_000) // $1M - $101M (30% chance)
        : Math.random() > 0.9
          ? Math.floor(Math.random() * 10_000_000_000 + 1_000_000_000) // $1B - $11B (rare, ~3% chance)
          : Math.random() > 0.5
            ? Math.floor(Math.random() * 50_000 + 1_000) // $1K - $51K (35% chance)
            : Math.floor(Math.random() * 900 + 100), // $100 - $999 (32% chance)
      timeInMarketPercent: Math.max(40, Math.min(98, template.timeInMarketPercent! * (1 + variation * 0.3))),
      avgHoldDays: Math.max(0.1, template.avgHoldDays! * (1 + variation * 0.7)),
      radarScore: 0 // Will be calculated below
    };
    
    // Calculate radar score as average of all metrics
    trader.radarScore = (
      trader.metrics.traderAge +
      trader.metrics.annualReturn +
      trader.metrics.sharpe +
      trader.metrics.maxDrawdown +
      trader.metrics.balance
    ) / 5;
    
    traders.push(trader);
  }
  
  return traders;
}

export const mockTraders: Trader[] = generateTraders(50);