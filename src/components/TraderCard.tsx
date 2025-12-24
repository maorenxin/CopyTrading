import { Card } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Users, TrendingUp, TrendingDown, Clock, PieChart, Hourglass, Activity } from 'lucide-react';
import { Trader, Language, ColorMode } from '../types/trader';
import { RadarChart } from './RadarChart';
import { CumulativeReturnsChart } from './CumulativeReturnsChart';
import { t } from '../utils/translations';
import { getTimeAgo } from '../utils/timeago';
import { getValueColor } from '../utils/colorMode';
import { useState } from 'react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

interface TraderCardProps {
  trader: Trader;
  lang: Language;
  colorMode: ColorMode;
  onViewDetails: (trader: Trader) => void;
  onCopyTrade: (trader: Trader) => void;
}

export function TraderCard({ trader, lang, colorMode, onViewDetails, onCopyTrade }: TraderCardProps) {
  const isPositive = trader.allTimeReturn > 0;
  const [isStrategyExpanded, setIsStrategyExpanded] = useState(false);
  const [showCopiedTooltip, setShowCopiedTooltip] = useState(false);
  
  // Format address to 0x1234...5678
  const formatAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Copy address to clipboard
  const handleCopyAddress = () => {
    // Fallback method for clipboard copy (works without HTTPS)
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
      setTimeout(() => {
        setShowCopiedTooltip(false);
      }, 750);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
    
    document.body.removeChild(textArea);
  };

  return (
    <Card 
      className="p-5 bg-white/10 backdrop-blur-md border-white/20 transition-all duration-300 hover:shadow-lg hover:shadow-white/10"
      style={{ backdropFilter: 'blur(10px)' }}
    >
      {/* Trader Address - Single Row */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-white/70 text-xs">{t('traderAddress', lang)}:</p>
          <Tooltip open={showCopiedTooltip}>
            <TooltipTrigger asChild>
              <span 
                className="text-white font-mono text-sm cursor-pointer transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] inline-block"
                onClick={handleCopyAddress}
              >
                {formatAddress(trader.address)}
              </span>
            </TooltipTrigger>
            <TooltipContent className="bg-blue-500/90 border-blue-400/50 text-white backdrop-blur-sm">
              {lang === 'en' ? 'Copied!' : '已复制！'}
            </TooltipContent>
          </Tooltip>
        </div>
        <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30">
          #{trader.rank}
        </Badge>
      </div>

      {/* Radar Chart Section - Centered Five-Dimensional Chart */}
      <div className="mb-5 flex justify-center">
        <RadarChart 
          metrics={trader.metrics} 
          trader={trader}
          lang={lang} 
          size={320}
        />
      </div>

      {/* AI Tags - With Tooltip */}
      <div 
        className="-mt-3 mb-2 p-3 bg-blue-500/10 border border-blue-400/20 rounded-lg shadow-sm shadow-blue-500/10 transition-all duration-300"
        onMouseEnter={(e) => {
          const scrollDiv = e.currentTarget.querySelector('.ai-tags-scroll') as HTMLElement;
          if (scrollDiv) {
            scrollDiv.style.scrollbarColor = 'rgba(59, 130, 246, 0.5) transparent';
          }
        }}
        onMouseLeave={(e) => {
          const scrollDiv = e.currentTarget.querySelector('.ai-tags-scroll') as HTMLElement;
          if (scrollDiv) {
            scrollDiv.style.scrollbarColor = 'transparent transparent';
          }
        }}
      >
        <p className="text-blue-300 text-xs mb-2">
          {lang === 'en' ? 'AI Investment Tag' : 'AI投资标签'}
        </p>
        <div 
          className="flex gap-1.5 overflow-x-auto pb-1 ai-tags-scroll"
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: 'transparent transparent',
          }}
        >
          {trader.aiTags[lang].map((tag, index) => (
            <Badge 
              key={index}
              className="bg-blue-500/20 text-blue-200 border-blue-400/30 px-2 py-0.5 whitespace-nowrap shrink-0"
              style={{ fontSize: '0.65rem' }}
            >
              {tag}
            </Badge>
          ))}
        </div>
      </div>

      {/* Cumulative Returns Chart */}
      <div className="mb-4">
        <p className="text-white/70 text-xs mb-2">
          {lang === 'en' ? 'Cumulative Returns' : '累计收益'}
        </p>
        <CumulativeReturnsChart data={trader.pnlData} height={120} colorMode={colorMode} lang={lang} />
      </div>

      {/* All Metrics - Equal Priority */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {/* Time in Market */}
        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <PieChart className="w-3 h-3 text-purple-400" />
            <p className="text-white/70 text-xs">{t('timeInMarketLabel', lang)}</p>
          </div>
          <p className="text-white text-sm">
            {trader.timeInMarketPercent.toFixed(0)}%
          </p>
        </div>

        {/* Followers */}
        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <Users className="w-3 h-3 text-blue-400" />
            <p className="text-white/70 text-xs">{t('followers', lang)}</p>
          </div>
          <p className="text-white text-sm">{trader.followerCount.toLocaleString()}</p>
        </div>

        {/* All-Time Return */}
        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            {isPositive ? (
              <TrendingUp className={`w-3 h-3 ${getValueColor(trader.allTimeReturn, colorMode)}`} />
            ) : (
              <TrendingDown className={`w-3 h-3 ${getValueColor(trader.allTimeReturn, colorMode)}`} />
            )}
            <p className="text-white/70 text-xs">{t('allTimeReturnLabel', lang)}</p>
          </div>
          <p className={`text-sm ${getValueColor(trader.allTimeReturn, colorMode)}`}>
            {isPositive ? '+' : ''}{trader.allTimeReturn.toFixed(1)}%
          </p>
        </div>

        {/* Avg. Hold Days */}
        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <Hourglass className="w-3 h-3 text-orange-400" />
            <p className="text-white/70 text-xs">{t('avgHoldDaysLabel', lang)}</p>
          </div>
          <p className="text-white text-sm">
            {trader.avgHoldDays.toFixed(1)}
          </p>
        </div>

        {/* Avg Trades/Day */}
        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <Activity className="w-3 h-3 text-blue-400" />
            <p className="text-white/70 text-xs">{t('avgTradesPerDay', lang)}</p>
          </div>
          <p className="text-white text-sm">{trader.avgTradesPerDay.toFixed(1)}</p>
        </div>

        {/* Last Trade */}
        <div className="p-2 bg-white/5 rounded-lg">
          <div className="flex items-center gap-1 mb-1">
            <Clock className="w-3 h-3 text-green-400" />
            <p className="text-white/70 text-xs">{t('lastTrade', lang)}</p>
          </div>
          <p className="text-white text-sm">{getTimeAgo(trader.lastTradeTimestamp, lang)}</p>
        </div>
      </div>

      {/* Copy Trade Button Only */}
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onCopyTrade(trader);
        }}
        className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
      >
        {t('copyTrade', lang)}
      </Button>
    </Card>
  );
}
