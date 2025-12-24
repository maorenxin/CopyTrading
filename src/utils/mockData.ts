import { Trader } from '../types/trader';

const DAY_MS = 24 * 60 * 60 * 1000;

const randBetween = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function generateAddress(): string {
  const hex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `0x${hex}`;
}

// Helper function to generate PnL data with optional bias
function generatePnLData(
  startDate: number,
  endDate: number,
  volatility: number,
  bias: number,
  startValue: number
): { timestamp: number; pnl: number; btcPnl: number }[] {
  const data = [] as { timestamp: number; pnl: number; btcPnl: number }[];
  let currentPnl = startValue;
  let currentBtcPnl = startValue;

  for (let time = startDate; time <= endDate; time += DAY_MS) {
    const change = (Math.random() - 0.5 + bias) * volatility;
    const btcChange = (Math.random() - 0.48) * (volatility * 0.8);
    currentPnl = currentPnl * (1 + change / 100);
    currentBtcPnl = currentBtcPnl * (1 + btcChange / 100);

    data.push({
      timestamp: time,
      pnl: Math.round(currentPnl * 100) / 100,
      btcPnl: Math.round(currentBtcPnl * 100) / 100,
    });
  }

  return data;
}

function calculateMaxDrawdown(pnlData: { pnl: number }[]): number {
  let peak = pnlData[0]?.pnl ?? 0;
  let maxDrawdown = 0;

  pnlData.forEach((point) => {
    if (point.pnl > peak) peak = point.pnl;
    const drawdown = peak > 0 ? (peak - point.pnl) / peak : 0;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  });

  return Math.round(maxDrawdown * 1000) / 10; // percentage, 1 decimal
}

// Helper function to generate trade history
function generateTrades(count: number, startDate: number, endDate: number): any[] {
  const trades = [] as any[];
  const timeRange = endDate - startDate;

  for (let i = 0; i < count; i++) {
    const timestamp = startDate + Math.random() * timeRange;
    const type = Math.random() > 0.5 ? 'long' : 'short';
    const entry = randBetween(20000, 80000);
    const exitMultiplier = Math.random() > 0.4 ? 1 + Math.random() * 0.12 : 1 - Math.random() * 0.06;
    const exit = entry * exitMultiplier;
    const size = randBetween(200, 2000);
    const pnl = type === 'long' ? (exit - entry) * size / entry : (entry - exit) * size / entry;

    trades.push({
      id: `trade-${i}`,
      timestamp: Math.floor(timestamp),
      type,
      entry: Math.round(entry * 100) / 100,
      exit: Math.round(exit * 100) / 100,
      pnl: Math.round(pnl * 100) / 100,
      size: Math.round(size * 100) / 100,
    });
  }

  return trades.sort((a, b) => b.timestamp - a.timestamp);
}

// Template traders with different characteristics
const traderTemplates = [
  {
    metrics: { traderAge: 5, annualReturn: 5, sharpe: 5, maxDrawdown: 5, balance: 5 },
    pnlVolatility: 2.5,
    pnlBias: 0.12,
    aiStrategy: {
      en: 'Momentum-based swing trading with strict risk management',
      cn: '基于动量的波段交易与严格风险管理',
    },
    aiTags: {
      en: ['Momentum Trading', 'Risk Management', 'Swing Trading', 'High Win Rate', 'Trend Following'],
      cn: ['动量交易', '风险管理', '波段交易', '高胜率', '趋势跟随'],
    },
    traderAgeDays: 720,
    baseTradesPerDay: 3,
  },
  {
    metrics: { traderAge: 4, annualReturn: 4, sharpe: 4, maxDrawdown: 4, balance: 4 },
    pnlVolatility: 4,
    pnlBias: 0.05,
    aiStrategy: {
      en: 'Mean reversion strategy with technical indicators',
      cn: '均值回归策略结合技术指标',
    },
    aiTags: {
      en: ['Mean Reversion', 'Technical Analysis', 'Day Trading', 'RSI Strategy', 'Support/Resistance'],
      cn: ['均值回归', '技术分析', '日内交易', 'RSI策略', '支撑阻力'],
    },
    traderAgeDays: 540,
    baseTradesPerDay: 5,
  },
  {
    metrics: { traderAge: 3, annualReturn: 3, sharpe: 3, maxDrawdown: 3, balance: 3 },
    pnlVolatility: 5,
    pnlBias: 0.01,
    aiStrategy: {
      en: 'Breakout trading with volume confirmation',
      cn: '突破交易结合成交量确认',
    },
    aiTags: {
      en: ['Breakout Strategy', 'Volume Analysis', 'Trend Following', 'Pattern Recognition', 'Volatility Trading'],
      cn: ['突破策略', '成交量分析', '趋势跟随', '形态识别', '波动率交易'],
    },
    traderAgeDays: 360,
    baseTradesPerDay: 4,
  },
  {
    metrics: { traderAge: 2, annualReturn: 2, sharpe: 2, maxDrawdown: 2, balance: 2 },
    pnlVolatility: 6,
    pnlBias: -0.03,
    aiStrategy: {
      en: 'Scalping strategy focused on quick profits',
      cn: '剥头皮策略专注快速获利',
    },
    aiTags: {
      en: ['Scalping', 'High Frequency', 'Quick Trades', 'Low Hold Time', 'Active Trading'],
      cn: ['剥头皮', '高频交易', '快速交易', '低持仓时间', '活跃交易'],
    },
    traderAgeDays: 180,
    baseTradesPerDay: 12,
  },
  {
    metrics: { traderAge: 1, annualReturn: 1, sharpe: 1, maxDrawdown: 1, balance: 1 },
    pnlVolatility: 8,
    pnlBias: -0.1,
    aiStrategy: {
      en: 'Experimental trading with high risk tolerance',
      cn: '实验性交易高风险承受能力',
    },
    aiTags: {
      en: ['High Risk', 'Experimental', 'Aggressive', 'Large Drawdown', 'Contrarian'],
      cn: ['高风险', '实验性', '激进型', '大回撤', '逆势交易'],
    },
    traderAgeDays: 90,
    baseTradesPerDay: 8,
  },
];

function generateTraders(count: number): Trader[] {
  const traders: Trader[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const template = traderTemplates[i % traderTemplates.length];
    const variation = (Math.random() - 0.5) * 0.3;
    const traderAgeDays = Math.max(30, Math.floor(template.traderAgeDays * (1 + variation * 0.8)));
    const startDate = now - traderAgeDays * DAY_MS;
    const startValue = randBetween(800, 5000) * (1 + variation * 0.5);

    const pnlData = generatePnLData(
      startDate,
      now,
      template.pnlVolatility * (1 + variation),
      template.pnlBias * (1 + variation * 0.5),
      startValue
    );

    const tradeCount = Math.max(50, Math.floor(traderAgeDays * template.baseTradesPerDay));
    const trades = generateTrades(tradeCount, startDate, now);
    const wins = trades.filter((trade) => trade.pnl > 0).length;
    const winRatePercent = trades.length > 0 ? (wins / trades.length) * 100 : 0;

    const allTimeReturn = pnlData.length
      ? ((pnlData[pnlData.length - 1].pnl - pnlData[0].pnl) / pnlData[0].pnl) * 100
      : 0;
    const annualizedReturn = traderAgeDays > 30 ? (allTimeReturn / traderAgeDays) * 365 : allTimeReturn;
    const maxDrawdownPercent = calculateMaxDrawdown(pnlData);

    const balance = pnlData[pnlData.length - 1]?.pnl ?? startValue;

    const trader: Trader = {
      id: `trader-${i}`,
      address: generateAddress(),
      rank: i + 1,
      metrics: {
        traderAge: clamp(template.metrics.traderAge * (1 + variation * 0.5), 1, 5),
        annualReturn: clamp(template.metrics.annualReturn * (1 + variation * 0.5), 1, 5),
        sharpe: clamp(template.metrics.sharpe * (1 + variation * 0.5), 1, 5),
        maxDrawdown: clamp(template.metrics.maxDrawdown * (1 + variation * 0.5), 1, 5),
        balance: clamp(template.metrics.balance * (1 + variation * 0.5), 1, 5),
      },
      pnlData,
      aiStrategy: template.aiStrategy,
      aiTags: template.aiTags,
      traderAgeDays,
      followerCount: Math.floor(randBetween(120, 8000)),
      allTimeReturn: Math.round(allTimeReturn * 10) / 10,
      annualizedReturn: Math.round(annualizedReturn * 10) / 10,
      maxDrawdownPercent,
      winRatePercent: Math.round(winRatePercent * 10) / 10,
      avgTradesPerDay: Math.round((tradeCount / traderAgeDays) * 10) / 10,
      lastTradeTimestamp: trades[0]?.timestamp ?? now,
      trades,
      balance: Math.round(balance * 100) / 100,
      timeInMarketPercent: clamp(randBetween(40, 95), 30, 99),
      avgHoldDays: Math.round(randBetween(0.2, 4.5) * 10) / 10,
      radarScore: 0,
    };

    trader.radarScore =
      (trader.metrics.traderAge +
        trader.metrics.annualReturn +
        trader.metrics.sharpe +
        trader.metrics.maxDrawdown +
        trader.metrics.balance) /
      5;

    traders.push(trader);
  }

  return traders;
}

export const mockTraders: Trader[] = generateTraders(50);
