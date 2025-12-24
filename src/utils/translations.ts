import { Language } from '../types/trader';

export const translations = {
    en: {
        // Header
        platformTitle: 'Hyperliquid Vault Copy Trading',
        platformSubtitle: 'Follow professional traders and grow your portfolio',

        // Navigation
        myPortfolio: 'My Portfolio',

        // View controls
        cardView: 'Card View',
        tableView: 'Table View',
        sortBy: 'Sort by',

        // Sort options
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
        annualizedReturnLabel: 'ARR',
        sharpeLabel: 'Sharpe',
        maxDrawdownLabel: 'MDD',
        winRateLabel: 'Win Rate',
        balanceLabel: 'Balance',
        lastTrade: 'Last Trade',
        timeInMarketLabel: 'Time in Market',
        avgHoldDaysLabel: 'Avg. Hold Days',

        // Tooltip explanations
        arrTooltip: 'Annual Return Rate: A measure of the percentage return on investment over a one-year period, annualized from actual performance data.',
        sharpeTooltip: 'Sharpe Ratio: A metric that measures risk-adjusted returns by comparing excess return (above risk-free rate) to volatility. Higher values indicate better risk-adjusted performance.',
        mddTooltip: 'Max Drawdown: The maximum observed loss from a peak to a trough before a new peak is attained. It measures the largest single drop in portfolio value.',

        // Radar chart axes
        radarAge: 'Age',
        radarReturn: 'Return',
        radarSharpe: 'Sharpe',
        radarDrawdown: 'Drawdown',
        radarWinRate: 'Win Rate',

        // Table headers
        traderAddress: 'Trader Address',
        radarChart: 'Performance',
        aiStrategy: 'AI Investment Tag',
        cumulativeReturns: 'Cumulative Returns',

        // Time periods
        '7D': '7 Days',
        '30D': '30 Days',
        '90D': '90 Days',
        'ALL': 'All Time',

        // Copy trade modal
        copyTradeTitle: 'Copy Trade',
        copyTradeDescription: 'Automatically copy trades from this professional trader',
        investmentAmount: 'Investment Amount',
        selectAmount: 'Select amount or enter custom',
        maxBalance: 'Max',
        confirmInvestment: 'Confirm Investment',
        cancel: 'Cancel',

        // Detail modal
        traderDetails: 'Trader Details',
        traderDetailsDescription: 'Comprehensive trading performance and history',
        tradingHistory: 'Trading History',
        performanceMetrics: 'Performance Metrics',
        balanceChart: 'Balance vs Bitcoin',
        tradeHistory: 'Trade History',
        type: 'Type',
        entry: 'Entry',
        exit: 'Exit',
        pnl: 'PnL',
        size: 'Size',
        date: 'Date',
        long: 'Long',
        short: 'Short',

        // Wallet
    connectWallet: 'Connect Wallet',
    disconnect: 'Disconnect',
    connected: 'Connected',
    connecting: 'Connecting...',
    installWallet: 'Install Wallet',
    walletUnavailable: 'Wallet extension not detected',
    connectFailed: 'Connection failed',
    retry: 'Retry',

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
    },
    cn: {
        // Header
        platformTitle: 'Hyperliquid 保险库跟单交易',
        platformSubtitle: '跟随专业交易者，增长您的投资组合',

        // Navigation
        myPortfolio: '我的投资组合',

        // View controls
        cardView: '卡片视图',
        tableView: '表格视图',
        sortBy: '排序方式',

        // Sort options
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
        annualizedReturnLabel: 'ARR',
        sharpeLabel: '夏普',
        maxDrawdownLabel: 'MDD',
        winRateLabel: '胜率',
        balanceLabel: '管理余额',
        lastTrade: '最后交易',
        timeInMarketLabel: '在场时间占比',
        avgHoldDaysLabel: '平均持仓天数',

        // Tooltip explanations
        arrTooltip: '年度回报率：衡量投资在一个年度内的百分比回报，从实际表现数据中年化得出。',
        sharpeTooltip: '夏普比率：衡量风险调整后的回报率，通过比较超额回报（高于无风险利率）与波动性。较高的值表示更好的风险调整后的表现。',
        mddTooltip: '最大回撤：从峰值到谷值的最大观察到的损失，在达到新的峰值之前。它衡量投资组合价值的最大单次下跌。',

        // Radar chart axes
        radarAge: '年龄',
        radarReturn: '回报',
        radarSharpe: '夏普',
        radarDrawdown: '回撤',
        radarWinRate: '胜率',

        // Table headers
        traderAddress: '交易者地址',
        radarChart: '绩效',
        aiStrategy: 'AI投资标签',
        cumulativeReturns: '累计回报',

        // Time periods
        '7D': '7天',
        '30D': '30天',
        '90D': '90天',
        'ALL': '全部',

        // Copy trade modal
        copyTradeTitle: '跟单交易',
        copyTradeDescription: '自动复制此专业交易者的交易',
        investmentAmount: '投资金额',
        selectAmount: '选择金额或输入自定义',
        maxBalance: '最大',
        confirmInvestment: '确认投资',
        cancel: '取消',

        // Detail modal
        traderDetails: '交易者详情',
        traderDetailsDescription: '全面的交易表现和历史记录',
        tradingHistory: '交易历史',
        performanceMetrics: '绩效指标',
        balanceChart: '余额对比比特币',
        tradeHistory: '交易记录',
        type: '类型',
        entry: '入场',
        exit: '出场',
        pnl: '盈亏',
        size: '规模',
        date: '日期',
        long: '做多',
        short: '做空',

        // Wallet
    connectWallet: '连接钱包',
    disconnect: '断开连接',
    connected: '已连接',
    connecting: '连接中...',
    installWallet: '安装钱包',
    walletUnavailable: '未检测到钱包扩展',
    connectFailed: '连接失败',
    retry: '重试',

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
    }
};

export function t(key: string, lang: Language): string {
    return translations[lang][key as keyof typeof translations.en] || key;
}
