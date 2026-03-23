import { Language } from '../types/trader';

export const translations = {
    en: {
        // Header
        platformTitle: 'Hyperliquid Copy Trading',
        platformSubtitle: 'Discover top-performing vaults and start copy trading',

        // View controls
        cardView: 'Card View',
        tableView: 'Table View',
        sortBy: 'Sort by',

        // Sort options
        compositeRank: 'Overall Rank',
        arr: 'Annual Return Ratio(ARR)',
        sharpe: 'Sharpe Ratio',
        maxDrawdown: 'Max Drawdown(MDD)',
        balance: 'Balance',
        winRate: 'Win Rate',
        traderAge: 'Trader Age',
        timeInMarket: 'Time in Market',
        followerCount: 'Followers',
        avgHoldDays: 'Avg. Hold Days',
        avgTradesPerDay: 'Avg. Trades/Day',

        // Trader card
        copyTrade: 'Copy Trade',
        followers: 'Followers',
        viewDetails: 'View Details',

        // Metrics
        traderAgeLabel: 'Trader Age',
        months: 'months',
        allTimeReturnLabel: 'All-Time Return',
        annualizedReturnLabel: 'APR',
        sharpeLabel: 'Sharpe',
        maxDrawdownLabel: 'MDD',
        winRateLabel: 'Win Rate',
        balanceLabel: 'Balance',
        lastTrade: 'Last Trade',
        timeInMarketLabel: 'Time in Market',
        avgHoldDaysLabel: 'Avg. Hold Days',

        // Tooltip explanations
        aprTooltip: 'Annual Percentage Rate: Hyperliquid official annualized return based on vault share price. This is the actual return an investor would receive.',
        sharpeTooltip: 'Sharpe Ratio: A metric that measures risk-adjusted returns by comparing excess return (above risk-free rate) to volatility. Higher values indicate better risk-adjusted performance (approximate, derived from reconstructed NAV).',
        mddTooltip: 'Max Drawdown: The maximum observed loss from a peak to a trough before a new peak is attained. It measures the largest single drop in portfolio value (approximate, derived from reconstructed NAV).',

        // Radar chart axes
        radarAge: 'Age',
        radarReturn: 'Return',
        radarSharpe: 'Sharpe',
        radarDrawdown: 'Drawdown',
        radarWinRate: 'Win Rate',

        // Table headers
        traderAddress: 'Trader Address',
        radarChart: 'Performance',
        cumulativeReturns: 'Cumulative Returns',

        // Time periods
        '7D': '7 Days',
        '30D': '30 Days',
        '90D': '90 Days',
        'ALL': 'All Time',

        // Detail modal
        traderDetails: 'Trader Details',
        traderDetailsDescription: 'Comprehensive trading performance and history',
        performanceMetrics: 'Performance Metrics',
        type: 'Type',
        date: 'Date',
        long: 'Long',
        short: 'Short',

        // Time ago
        minutesAgo: 'minutes ago',
        hoursAgo: 'hours ago',
        daysAgo: 'days ago',
        weeksAgo: 'weeks ago',
        monthsAgo: 'months ago',
        yearsAgo: 'years ago',

        // Stats
        totalTraders: 'Total Traders',
        activeTraders: 'Active Traders',
        totalFollowers: 'Total Followers',
        avgReturn: 'Avg Return',

        // MCP Banner
        mcpTitle: 'AI Agent Skill',
        mcpDescription: 'Copy the prompt below and send it to any AI agent (Claude, ChatGPT, etc.) to let it analyze Vault data for you',
        mcpCopied: 'Copied!',
    },
    cn: {
        // Header
        platformTitle: 'Hyperliquid跟单',
        platformSubtitle: '发现优质保险库，一键跟单',

        // View controls
        cardView: '卡片视图',
        tableView: '表格视图',
        sortBy: '排序方式',

        // Sort options
        compositeRank: '综合排名',
        arr: '年化收益(ARR)',
        sharpe: '夏普比率',
        maxDrawdown: '最大回撤(MDD)',
        balance: '管理余额',
        winRate: '胜率',
        traderAge: '交易年龄',
        timeInMarket: '在场时间占比',
        followerCount: '跟单人数',
        avgHoldDays: '平均持仓天数',
        avgTradesPerDay: '日均交易次数',

        // Trader card
        copyTrade: '跟单',
        followers: '跟单人数',
        viewDetails: '查看详情',

        // Metrics
        traderAgeLabel: '交易年龄',
        months: '个月',
        allTimeReturnLabel: '累计回报',
        annualizedReturnLabel: 'APR',
        sharpeLabel: '夏普',
        maxDrawdownLabel: 'MDD',
        winRateLabel: '胜率',
        balanceLabel: '管理余额',
        lastTrade: '最后交易',
        timeInMarketLabel: '在场时间占比',
        avgHoldDaysLabel: '平均持仓天数',

        // Tooltip explanations
        aprTooltip: '年化收益率（APR）：Hyperliquid 官方基于份额净值计算的年化收益率，是投资者实际获得的收益率。',
        sharpeTooltip: '夏普比率：衡量风险调整后的回报率，通过比较超额回报（高于无风险利率）与波动性。较高的值表示更好的风险调整后的表现（近似值，基于重建的净值序列计算）。',
        mddTooltip: '最大回撤：从峰值到谷值的最大观察到的损失，在达到新的峰值之前。它衡量投资组合价值的最大单次下跌（近似值，基于重建的净值序列计算）。',

        // Radar chart axes
        radarAge: '年龄',
        radarReturn: '回报',
        radarSharpe: '夏普',
        radarDrawdown: '回撤',
        radarWinRate: '胜率',

        // Table headers
        traderAddress: '交易者地址',
        radarChart: '绩效',
        cumulativeReturns: '累计回报',

        // Time periods
        '7D': '7天',
        '30D': '30天',
        '90D': '90天',
        'ALL': '全部',

        // Detail modal
        traderDetails: '交易者详情',
        traderDetailsDescription: '全面的交易表现和历史记录',
        performanceMetrics: '绩效指标',
        type: '类型',
        date: '日期',
        long: '做多',
        short: '做空',

        // Time ago
        minutesAgo: '分钟前',
        hoursAgo: '小时前',
        daysAgo: '天前',
        weeksAgo: '周前',
        monthsAgo: '月前',
        yearsAgo: '年前',

        // Stats
        totalTraders: '交易者总数',
        activeTraders: '活跃交易者',
        totalFollowers: '总跟单数',
        avgReturn: '平均回报',

        // MCP Banner
        mcpTitle: 'AI Agent 技能',
        mcpDescription: '复制下方提示词发送给任意 AI（Claude、ChatGPT 等），即可让 AI 帮你分析 Vault 数据',
        mcpCopied: '已复制！',
    }
};

export function t(key: string, lang: Language): string {
    return translations[lang][key as keyof typeof translations.en] || key;
}
