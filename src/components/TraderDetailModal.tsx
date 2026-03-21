import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Button } from './ui/button';
import { Trader, Language, ColorMode, TimePeriod } from '../types/trader';
import { RadarChart } from './RadarChart';
import { CumulativeReturnsChart } from './CumulativeReturnsChart';
import { MetricTabs } from './MetricTabs';
import { RiskNotice } from './RiskNotice';
import { t } from '../utils/translations';
import { getValueColor } from '../utils/colorMode';
import { formatTraderAge } from '../utils/formatTraderAge';
import { formatSignedPercent } from '../utils/formatPercent';
import { Users, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

interface TraderDetailModalProps {
  trader: Trader | null;
  isOpen: boolean;
  onClose: () => void;
  onCopyTrade: (trader: Trader) => void;
  lang: Language;
  colorMode: ColorMode;
}

export function TraderDetailModal({ trader, isOpen, onClose, onCopyTrade, lang, colorMode }: TraderDetailModalProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('ALL');
  const [showCopied, setShowCopied] = useState(false);

  const handleCopyAddress = async () => {
    if (!trader) return;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(trader.address);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = trader.address;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 800);
    } catch {
      // ignore
    }
  };

  // Filter pnlData by time period
  const filteredPnlData = (() => {
    if (!trader) return [];
    if (timePeriod === 'ALL') return trader.pnlData;
    const now = Date.now();
    const days = timePeriod === '7D' ? 7 : timePeriod === '30D' ? 30 : 90;
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return trader.pnlData.filter(p => p.timestamp >= cutoff);
  })();

  if (!trader) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="bg-[#0a0e17] border-[#00ff88]/20 text-white w-[92vw] sm:w-[80vw] md:w-[72vw] lg:w-[64vw] max-w-6xl h-full overflow-y-auto shadow-[-24px_0_48px_rgba(0,0,0,0.5)]"
        style={{
          backdropFilter: 'blur(10px)',
          background: 'rgba(10, 14, 23, 0.96)'
        }}
      >
        <SheetHeader className="px-4 pt-6">
          <SheetTitle className="text-white text-xl">
            {t('traderDetails', lang)}
          </SheetTitle>
          <SheetDescription className="text-[#94a3b8]">
            {t('traderDetailsDescription', lang)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-4 px-4 pb-6">
          {/* Trader Header */}
          <div className="flex items-start justify-between gap-4 p-4 bg-[#0f172a]/80 backdrop-blur-md border border-[#00ff88]/10 rounded-lg">
            <div className="flex-1">
              <p className="text-[#94a3b8] text-sm mb-1">{t('traderAddress', lang)}</p>
              <div className="flex items-center gap-2 mb-4">
                <Tooltip open={showCopied}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="text-white font-mono text-sm hover:text-[#00ff88] cursor-pointer transition-colors"
                    >
                      {trader.address}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#00ff88]/90 border-[#00ff88]/50 text-black backdrop-blur-sm">
                    {lang === 'en' ? 'Copied!' : '已复制！'}
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  {trader.allTimeReturn > 0 ? (
                    <TrendingUp className={`w-4 h-4 ${getValueColor(trader.allTimeReturn, colorMode)}`} />
                  ) : (
                    <TrendingDown className={`w-4 h-4 ${getValueColor(trader.allTimeReturn, colorMode)}`} />
                  )}
                  <span className="text-[#94a3b8] text-sm">{t('allTimeReturnLabel', lang)}:</span>
                  <span className={`font-mono ${getValueColor(trader.allTimeReturn, colorMode)}`}>
                    {formatSignedPercent(trader.allTimeReturn, 1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#00d4ff]" />
                  <span className="text-[#94a3b8] text-sm">{t('traderAgeLabel', lang)}:</span>
                  <span className="text-white">{formatTraderAge(trader.traderAgeDays, lang)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#00d4ff]" />
                  <span className="text-[#94a3b8] text-sm">{t('followers', lang)}:</span>
                  <span className="text-white">{trader.followerCount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Radar Chart */}
          <div className="p-4 bg-[#0f172a]/80 backdrop-blur-md border border-[#00ff88]/10 rounded-lg">
            <h3 className="text-white mb-4">{t('performanceMetrics', lang)}</h3>
            <div className="flex justify-center">
              <RadarChart metrics={trader.metrics} trader={trader} lang={lang} size={320} />
            </div>
          </div>

          <RiskNotice lang={lang} />

          {/* Cumulative Returns */}
          <div className="p-4 bg-[#0f172a]/80 backdrop-blur-md border border-[#00ff88]/10 rounded-lg">
            <div className="flex flex-col gap-3 mb-4">
              <h3 className="text-white">{lang === 'en' ? 'Cumulative Returns' : '累计收益'}</h3>
              <MetricTabs value={timePeriod} onChange={setTimePeriod} />
            </div>
            <CumulativeReturnsChart
              data={filteredPnlData}
              height={320}
              colorMode={colorMode}
              lang={lang}
              showBtcComparison={false}
            />
          </div>

          {/* Copy Trade Button */}
          <div className="p-4 bg-[#0f172a]/80 backdrop-blur-md border border-[#00ff88]/10 rounded-lg">
            <Button
              onClick={() => onCopyTrade(trader)}
              className="w-full bg-[#00d4ff] hover:bg-[#00b8e6] text-black font-semibold transition-all duration-200 cursor-pointer shadow-[0_0_12px_rgba(0,212,255,0.2)] hover:shadow-[0_0_20px_rgba(0,212,255,0.4)]"
            >
              {t('copyTrade', lang)}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
