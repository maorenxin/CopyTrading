import React, { useState, useEffect } from 'react';
import { TraderDetailModal } from '../components/TraderDetailModal';
import { Button } from '../components/ui/button';
import { Language, ColorMode, Trader } from '../types/trader';
import { fetchVaultTrades } from '../services/vaultTrades';



export function DebugTraderDetailModal() {
  const [isOpen, setIsOpen] = useState(true);
  const [lang] = useState<Language>('cn');
  const [colorMode] = useState<ColorMode>('standard');
  const [trader, setTrader] = useState<Trader | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 初始化交易者数据
    const initializeTraderData = async () => {
      try {
        // 首先创建基本的交易者对象
        const baseTrader: Trader = {
          id: '0xf36e402dbc9e6e904e719f680dc056c9d57cca24',
          address: '0xf36e402dbc9e6e904e719f680dc056c9d57cca24',
          rank: 1,
          allTimeReturn: 0.8542,
          traderAgeDays: 245,
          followerCount: 2847,
          annualizedReturn: 1.35,
          sharpeRatio: 1.8,
          maxDrawdownPercent: -0.12,
          winRatePercent: 0.72,
          avgTradesPerDay: 4.2,
          lastTradeTimestamp: Date.now() - 1800000, // 30分钟前
          balance: 285670.25,
          timeInMarketPercent: 0.75,
          avgHoldDays: 1.8,
          radarScore: 4.6,
          metrics: {
            traderAge: 4.8,
            annualReturn: 4.9,
            sharpe: 4.2,
            maxDrawdown: 4.5,
            balance: 4.7
          },
          pnlData: [
            { timestamp: Date.now() - 86400000 * 30, pnl: 15000, btcPnl: 0.75 },
            { timestamp: Date.now() - 86400000 * 25, pnl: 18500, btcPnl: 0.92 },
            { timestamp: Date.now() - 86400000 * 20, pnl: 22000, btcPnl: 1.10 },
            { timestamp: Date.now() - 86400000 * 15, pnl: 19500, btcPnl: 0.98 },
            { timestamp: Date.now() - 86400000 * 10, pnl: 24800, btcPnl: 1.24 },
            { timestamp: Date.now() - 86400000 * 5, pnl: 28300, btcPnl: 1.42 },
            { timestamp: Date.now(), pnl: 32500, btcPnl: 1.63 }
          ],
          trades: [], // 初始为空，稍后从数据库加载
          aiStrategy: {
            en: 'High-performance algorithmic trading strategy with strict risk management and dynamic position sizing',
            cn: '高性能算法交易策略，具有严格的风险管理和动态头寸调整'
          },
          aiTags: {
            en: ['High ROI', 'Low Risk', 'BTC Focus', 'Algorithmic', 'Momentum'],
            cn: ['高回报', '低风险', '比特币专注', '算法交易', '动量策略']
          }
        };

        // 从数据库加载真实的交易数据
        const vaultTradesResponse = await fetchVaultTrades(baseTrader.address, 50);

        // 将vault_trades格式转换为Trader所需的trades格式
        const transformedTrades = vaultTradesResponse.items.map((trade: any, index: number) => {
          // 根据side字段确定交易类型
          let type: 'long' | 'short' = 'long';
          if (trade.side && typeof trade.side === 'string') {
            type = trade.side.toLowerCase() === 'b' ? 'short' : 'long';
          }

          return {
            id: trade.tx_hash || `trade-${index}`,
            timestamp: new Date(trade.timestamp || trade.utc_time || Date.now()).getTime(),
            type,
            entry: trade.price || 0,
            exit: trade.price || 0, // 实际上交易记录可能是开仓和平仓分开的
            pnl: trade.pnl || 0,
            size: trade.size || 0,
            symbol: trade.coin || 'BTC',
            price: trade.price || 0
          };
        });

        // 更新交易者数据，合并从数据库获取的真实交易数据
        setTrader({
          ...baseTrader,
          trades: transformedTrades.length > 0 ? transformedTrades : baseTrader.trades
        });
      } catch (error) {
        console.error('加载交易数据失败:', error);
        // 如果加载失败，使用默认数据
        const defaultTrader: Trader = {
          id: '0xf36e402dbc9e6e904e719f680dc056c9d57cca24',
          address: '0xf36e402dbc9e6e904e719f680dc056c9d57cca24',
          rank: 1,
          allTimeReturn: 0.8542,
          traderAgeDays: 245,
          followerCount: 2847,
          annualizedReturn: 1.35,
          sharpeRatio: 1.8,
          maxDrawdownPercent: -0.12,
          winRatePercent: 0.72,
          avgTradesPerDay: 4.2,
          lastTradeTimestamp: Date.now() - 1800000, // 30分钟前
          balance: 285670.25,
          timeInMarketPercent: 0.75,
          avgHoldDays: 1.8,
          radarScore: 4.6,
          metrics: {
            traderAge: 4.8,
            annualReturn: 4.9,
            sharpe: 4.2,
            maxDrawdown: 4.5,
            balance: 4.7
          },
          pnlData: [
            { timestamp: Date.now() - 86400000 * 30, pnl: 15000, btcPnl: 0.75 },
            { timestamp: Date.now() - 86400000 * 25, pnl: 18500, btcPnl: 0.92 },
            { timestamp: Date.now() - 86400000 * 20, pnl: 22000, btcPnl: 1.10 },
            { timestamp: Date.now() - 86400000 * 15, pnl: 19500, btcPnl: 0.98 },
            { timestamp: Date.now() - 86400000 * 10, pnl: 24800, btcPnl: 1.24 },
            { timestamp: Date.now() - 86400000 * 5, pnl: 28300, btcPnl: 1.42 },
            { timestamp: Date.now(), pnl: 32500, btcPnl: 1.63 }
          ],
          trades: [], // 空数组表示加载失败
          aiStrategy: {
            en: 'High-performance algorithmic trading strategy with strict risk management and dynamic position sizing',
            cn: '高性能算法交易策略，具有严格的风险管理和动态头寸调整'
          },
          aiTags: {
            en: ['High ROI', 'Low Risk', 'BTC Focus', 'Algorithmic', 'Momentum'],
            cn: ['高回报', '低风险', '比特币专注', '算法交易', '动量策略']
          }
        };
        setTrader(defaultTrader);
      } finally {
        setLoading(false);
      }
    };

    initializeTraderData();
  }, []);

  const handleCopyTrade = (trader: Trader) => {
    console.log('跟单交易被点击，交易者ID:', trader.id);
  };

  if (loading) {
    return (
      <div className="p-8 bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">加载交易数据中...</div>
      </div>
    );
  }

  if (!trader) {
    return (
      <div className="p-8 bg-gray-900 min-h-screen flex items-center justify-center">
        <div className="text-white text-xl">无法加载交易者数据</div>
      </div>
    );
  }

  return (
    <div className="p-8 bg-gray-900 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-6">交易者详情模态框调试器</h1>
        <p className="text-gray-300 mb-8">
          此页面永久打开交易者详情模态框以供调试使用。
          您可以检查、修改和测试组件，无需点击任何内容。
        </p>

        <div className="mb-8 p-6 bg-gray-800 rounded-lg">
          <h2 className="text-xl font-semibold text-white mb-4">当前交易者数据</h2>
          <pre className="text-xs text-gray-300 bg-gray-900 p-4 rounded overflow-auto">
            {JSON.stringify(trader, null, 2)}
          </pre>
        </div>

        <div className="flex gap-4 mb-8">
          <Button
            onClick={() => setIsOpen(!isOpen)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {isOpen ? '隐藏模态框' : '显示模态框'}
          </Button>
          <Button
            onClick={() => console.log('当前交易者数据:', trader)}
            variant="outline"
            className="border-gray-600 text-white hover:bg-gray-700"
          >
            输出交易者数据
          </Button>
        </div>

        {/* 常驻显示的 Trader Detail Modal */}
        <TraderDetailModal
          trader={trader}
          isOpen={isOpen}
          onClose={() => { }} // 在调试模式下，什么都不做，保持模态框常驻
          onCopyTrade={handleCopyTrade}
          lang={lang}
          colorMode={colorMode}
        />
      </div>
    </div>
  );
}
