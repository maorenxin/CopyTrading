import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Users, TrendingUp, TrendingDown, PieChart, Hourglass, Activity, Target } from 'lucide-react';
import { Trader, Language, ColorMode } from '../types/trader';
import { RadarChart } from './RadarChart';
import { CumulativeReturnsChart } from './CumulativeReturnsChart';
import { t } from '../utils/translations';
import { getValueColor } from '../utils/colorMode';
import { useState } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { formatPercentAbs, formatSignedPercent } from '../utils/formatPercent';

interface TraderCardProps {
  trader: Trader;
  lang: Language;
  colorMode: ColorMode;
  onViewDetails: (trader: Trader) => void;
  onCopyTrade: (trader: Trader) => void;
}

export function TraderCard({ trader, lang, colorMode, onViewDetails, onCopyTrade }: TraderCardProps) {
  const isPositive = trader.allTimeReturn > 0;
  const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);

  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const handleCopyAddress = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation();
    const textArea = document.createElement('textarea');
    textArea.value = trader.address;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setShowCopiedTooltip(true);
      setTimeout(() => setShowCopiedTooltip(false), 750);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
    document.body.removeChild(textArea);
  };

  return (
    <Card
      className="p-5 bg-[#0f172a]/80 backdrop-blur-md border-[#00ff88]/10 transition-all duration-300 hover:shadow-lg hover:shadow-[#00ff88]/10 hover:border-[#00ff88]/30 cursor-pointer"
      role="button"
      tabIndex={0}
      onClick={() => onViewDetails(trader)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onViewDetails(trader);
        }
      }}
    >
      {/* Trader Address */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-[#94a3b8] text-xs">{t('traderAddress', lang)}:</p>
          <Tooltip open={showCopiedTooltip}>
            <TooltipTrigger asChild>
              <span
                className="text-white font-mono text-sm cursor-pointer transition-all duration-300 hover:text-[#00ff88] hover:scale-[1.02] active:scale-[0.98] inline-block"
                onClick={handleCopyAddress}
              >
                {formatAddress(trader.address)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="bg-[#00ff88]/90 border-[#00ff88]/50 text-black backdrop-blur-sm">
              {lang === 'en' ? 'Copied!' : '已复制！'}
            </TooltipContent>
          </Tooltip>
        </div>
        <Badge className="bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30">
          #{trader.rank}
        </Badge>
      </div>

      {/* Radar Chart */}
      <div className="mb-5 flex justify-center">
        <RadarChart metrics={trader.metrics} trader={trader} lang={lang} size={320} />
      </div>

      {/* Cumulative Returns Chart */}
      <div className="mb-4">
        <p className="text-[#94a3b8] text-xs mb-2">
          {lang === 'en' ? 'Cumulative Returns' : '累计收益'}
        </p>
        <CumulativeReturnsChart data={trader.pnlData} height={120} colorMode={colorMode} lang={lang} />
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <Users className="w-3 h-3 text-[#00d4ff]" />
            <p className="text-[#94a3b8] text-xs">{t('followers', lang)}</p>
          </div>
          <p className="text-white text-lg font-mono">{trader.followerCount.toLocaleString()}</p>
        </div>

        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <Target className="w-3 h-3 text-[#00ff88]" />
            <p className="text-[#94a3b8] text-xs">{t('winRateLabel', lang)}</p>
          </div>
          <p className="text-white text-lg font-mono">{formatPercentAbs(trader.winRatePercent, 1)}</p>
        </div>

        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            {isPositive ? (
              <TrendingUp className={`w-3 h-3 ${getValueColor(trader.allTimeReturn, colorMode)}`} />
            ) : (
              <TrendingDown className={`w-3 h-3 ${getValueColor(trader.allTimeReturn, colorMode)}`} />
            )}
            <p className="text-[#94a3b8] text-xs">{t('allTimeReturnLabel', lang)}</p>
          </div>
          <p className={`text-lg font-mono ${getValueColor(trader.allTimeReturn, colorMode)}`}>
            {formatSignedPercent(trader.allTimeReturn, 1)}
          </p>
        </div>

        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <PieChart className="w-3 h-3 text-[#00d4ff]" />
            <p className="text-[#94a3b8] text-xs">{t('timeInMarketLabel', lang)}</p>
          </div>
          <p className="text-white text-lg font-mono">{formatPercentAbs(trader.timeInMarketPercent, 0)}</p>
        </div>

        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <Hourglass className="w-3 h-3 text-[#00d4ff]" />
            <p className="text-[#94a3b8] text-xs">{t('avgHoldDaysLabel', lang)}</p>
          </div>
          <p className="text-white text-lg font-mono">{trader.avgHoldDays.toFixed(1)}</p>
        </div>

        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <Activity className="w-3 h-3 text-[#00d4ff]" />
            <p className="text-[#94a3b8] text-xs">{t('avgTradesPerDay', lang)}</p>
          </div>
          <p className="text-white text-lg font-mono">{trader.avgTradesPerDay.toFixed(1)}</p>
        </div>
      </div>

      {/* Copy Trade Button */}
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onCopyTrade(trader);
        }}
        className="w-full bg-[#00d4ff] hover:bg-[#00d4ff]/80 text-black font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer hover:shadow-[0_0_20px_rgba(0,212,255,0.3)]"
      >
        {t('copyTrade', lang)}
      </Button>
    </Card>
  );
}
