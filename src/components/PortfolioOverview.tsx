import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { TrendingUp, TrendingDown, Layers, Wallet, Sparkles } from 'lucide-react';
import { ColorMode, Language, PortfolioPosition, PortfolioSummary } from '../types/trader';
import { PnLChart } from './PnLChart';
import { getValueColor } from '../utils/colorMode';
import { formatWalletAddress } from '../utils/formatWalletAddress';
import { formatBalance } from '../utils/formatBalance';
import { formatSignedPercent } from '../utils/formatPercent';

interface PortfolioOverviewProps {
  lang: Language;
  colorMode: ColorMode;
  summary: PortfolioSummary;
  series: { timestamp: number; pnl: number }[];
  positions: PortfolioPosition[];
  onCloseCopy?: (positionId: string) => void;
  layout?: 'mobile' | 'desktop';
}

/**
 * 资产组合概览内容。
 * @param props - 组件参数。
 * @returns PortfolioOverview 组件。
 */
export function PortfolioOverview({
  lang,
  colorMode,
  summary,
  series,
  positions,
  onCloseCopy,
  layout = 'mobile',
}: PortfolioOverviewProps) {
  const profitText = `${summary.totalProfit >= 0 ? '+' : ''}${summary.totalProfit.toFixed(2)} USDC`;
  const returnText = formatSignedPercent(summary.avgReturnPercent, 1);
  const profitColor = getValueColor(summary.totalProfit, colorMode);
  const hasPositions = positions.length > 0;

  return (
    <div className={`space-y-5 text-white ${layout === 'desktop' ? 'lg:space-y-6' : ''}`}>
      <div className={layout === 'desktop' ? 'grid gap-5 lg:grid-cols-[1.15fr_0.85fr]' : ''}>
        <div className="space-y-4">
          <Card className="p-4 bg-white/10 backdrop-blur-md border-white/20 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-white/60 text-xs mb-1">
                  {lang === 'en' ? 'Portfolio Value' : '投资组合总值'}
                </p>
                <p className="text-3xl text-white">{formatBalance(summary.totalValue)}</p>
              </div>
              <div className="flex items-center gap-2">
                {summary.totalProfit >= 0 ? (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
                <span className={`text-sm ${profitColor}`}>{profitText}</span>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-white/70">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>{lang === 'en' ? 'Current return' : '当前收益率'}</span>
              <span className={profitColor}>{returnText}</span>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3 bg-white/10 backdrop-blur-md border-white/20">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-blue-400" />
                <p className="text-white/70 text-xs">{lang === 'en' ? 'Active Copies' : '活跃跟单'}</p>
              </div>
              <p className="text-xl text-white">{summary.activeCopies}</p>
            </Card>
            <Card className="p-3 bg-white/10 backdrop-blur-md border-white/20">
              <div className="flex items-center gap-2 mb-2">
                <Wallet className="w-4 h-4 text-purple-400" />
                <p className="text-white/70 text-xs">{lang === 'en' ? 'Total Invested' : '累计跟单'}</p>
              </div>
              <p className="text-xl text-white">{formatBalance(summary.totalInvested)}</p>
            </Card>
          </div>

          <Card className="p-4 bg-white/10 backdrop-blur-md border-white/20 text-white">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white">{lang === 'en' ? 'Funds Trend' : '资金走势'}</p>
              <Badge className="bg-blue-500/20 text-blue-200 border-blue-400/30">
                {lang === 'en' ? 'All Time' : '全部'}
              </Badge>
            </div>
            {series.length === 0 ? (
              <p className="text-white/60 text-sm">{lang === 'en' ? 'No data yet' : '暂无曲线数据'}</p>
            ) : (
              <PnLChart data={series} height={180} colorMode={colorMode} lang={lang} />
            )}
          </Card>
        </div>

        <Card className="p-4 bg-white/10 backdrop-blur-md border-white/20 text-white mt-4 lg:mt-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white">{lang === 'en' ? 'Active Copies' : '跟单列表'}</h3>
            <Badge className="bg-white/10 text-white/70 border-white/20">
              {summary.activeCopies}
            </Badge>
          </div>
          {!hasPositions ? (
            <div className="text-white/60 text-sm">
              {lang === 'en' ? 'Start copying to build your portfolio.' : '开始跟单后这里会展示你的持仓。'}
            </div>
          ) : (
            <div className="space-y-3">
              {positions.map((position) => {
                const allocation =
                  summary.totalInvested > 0 ? (position.amount / summary.totalInvested) * 100 : 0;
                return (
                  <div
                    key={position.id}
                    className="p-3 rounded-lg bg-white/5 border border-white/10"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-white text-sm font-mono">
                          {formatWalletAddress(position.trader.address)}
                        </p>
                        <p className="text-white/60 text-xs">
                          {lang === 'en' ? 'Invested' : '跟单金额'} {formatBalance(position.amount)}
                        </p>
                      </div>
                      <Badge className="bg-blue-500/20 text-blue-200 border-blue-400/30">
                        {allocation.toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>
                        {lang === 'en' ? 'Since' : '开始于'} {new Date(position.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN')}
                      </span>
                      <span>{lang === 'en' ? 'Active' : '跟单中'}</span>
                    </div>
                    <Button
                      variant="ghost"
                      className="mt-3 w-full bg-red-500/20 text-red-200 hover:bg-red-500/30"
                      onClick={() => onCloseCopy?.(position.id)}
                    >
                      {lang === 'en' ? 'Close Position' : '清仓'}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
