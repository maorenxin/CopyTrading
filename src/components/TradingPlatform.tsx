import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from './ui/select';
import { LayoutGrid, Table as TableIcon, Loader2 } from 'lucide-react';
import { Trader, Language, SortOption, ViewMode, ColorMode } from '../types/trader';
import { TraderCard } from './TraderCard';
import { TraderTableView } from './TraderTableView';
import { TraderDetailModal } from './TraderDetailModal';
import { Header } from './Header';
import { McpBanner } from './McpBanner';
import { t } from '../utils/translations';
import { fetchTraders } from '../services/traders';

export function TradingPlatform() {
  const [lang, setLang] = useState<Language>('cn');
  const [colorMode, setColorMode] = useState<ColorMode>('standard');
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [sortBy, setSortBy] = useState<SortOption>('radarScore');
  const [selectedTrader, setSelectedTrader] = useState<Trader | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [traders, setTraders] = useState<Trader[]>([]);
  const [displayCount, setDisplayCount] = useState(8);
  const [isLoading, setIsLoading] = useState(false);
  const loadingRef = useRef<HTMLDivElement>(null);

  // Table sorting state
  const [tableSortColumn, setTableSortColumn] = useState<string | null>('radarChart');
  const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleTableSort = (column: string) => {
    if (tableSortColumn === column) {
      setTableSortDirection(tableSortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setTableSortColumn(column);
      setTableSortDirection('desc');
    }
  };

  const sortedTraders = useMemo(() => {
    const sorted = [...traders];

    if (viewMode === 'table' && tableSortColumn) {
      return sorted.sort((a, b) => {
        let aValue: number;
        let bValue: number;

        switch (tableSortColumn) {
          case 'radarChart': aValue = a.radarScore; bValue = b.radarScore; break;
          case 'traderAge': aValue = a.traderAgeDays; bValue = b.traderAgeDays; break;
          case 'annualizedReturn': aValue = a.annualizedReturn; bValue = b.annualizedReturn; break;
          case 'sharpe': aValue = a.sharpeRatio; bValue = b.sharpeRatio; break;
          case 'followers': aValue = a.followerCount; bValue = b.followerCount; break;
          case 'maxDrawdown': aValue = a.maxDrawdownPercent; bValue = b.maxDrawdownPercent; break;
          case 'winRate': aValue = a.winRatePercent; bValue = b.winRatePercent; break;
          case 'timeInMarket': aValue = a.timeInMarketPercent; bValue = b.timeInMarketPercent; break;
          case 'avgHoldDays': aValue = a.avgHoldDays; bValue = b.avgHoldDays; break;
          case 'avgTradesPerDay': aValue = a.avgTradesPerDay; bValue = b.avgTradesPerDay; break;
          case 'lastTrade': aValue = a.lastTradeTimestamp; bValue = b.lastTradeTimestamp; break;
          default: return 0;
        }
        return tableSortDirection === 'desc' ? bValue - aValue : aValue - bValue;
      });
    }

    switch (sortBy) {
      case 'radarScore': return sorted.sort((a, b) => b.radarScore - a.radarScore);
      case 'annualizedReturn': return sorted.sort((a, b) => b.annualizedReturn - a.annualizedReturn);
      case 'sharpe': return sorted.sort((a, b) => b.sharpeRatio - a.sharpeRatio);
      case 'maxDrawdown': return sorted.sort((a, b) => a.maxDrawdownPercent - b.maxDrawdownPercent);
      case 'balance': return sorted.sort((a, b) => b.balance - a.balance);
      case 'traderAge': return sorted.sort((a, b) => b.traderAgeDays - a.traderAgeDays);
      case 'timeInMarket': return sorted.sort((a, b) => b.timeInMarketPercent - a.timeInMarketPercent);
      case 'followerCount': return sorted.sort((a, b) => b.followerCount - a.followerCount);
      case 'winRate': return sorted.sort((a, b) => b.winRatePercent - a.winRatePercent);
      case 'avgHoldDays': return sorted.sort((a, b) => b.avgHoldDays - a.avgHoldDays);
      case 'avgTradesPerDay': return sorted.sort((a, b) => b.avgTradesPerDay - a.avgTradesPerDay);
      default: return sorted;
    }
  }, [traders, sortBy, viewMode, tableSortColumn, tableSortDirection]);

  const displayedTraders = useMemo(() => {
    return sortedTraders.slice(0, displayCount);
  }, [sortedTraders, displayCount]);

  useEffect(() => {
    let isActive = true;
    const loadTraders = async () => {
      try {
        const items = await fetchTraders();
        if (isActive) setTraders(items);
      } catch {
        if (isActive) setTraders([]);
      }
    };
    loadTraders();
    return () => { isActive = false; };
  }, []);

  // Infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (target.isIntersecting && !isLoading && displayCount < sortedTraders.length) {
          setIsLoading(true);
          setTimeout(() => {
            setDisplayCount((prev: number) => Math.min(prev + 8, sortedTraders.length));
            setIsLoading(false);
          }, 800);
        }
      },
      { root: null, rootMargin: '100px', threshold: 0.1 }
    );
    if (loadingRef.current) observer.observe(loadingRef.current);
    return () => { if (loadingRef.current) observer.unobserve(loadingRef.current); };
  }, [isLoading, displayCount, sortedTraders.length]);

  useEffect(() => { setDisplayCount(8); }, [sortBy]);
  useEffect(() => { setDisplayCount(8); }, [viewMode, tableSortColumn, tableSortDirection]);

  const handleViewDetails = (trader: Trader) => {
    setSelectedTrader(trader);
    setIsDetailModalOpen(true);
  };

  const openHyperliquidVault = (trader: Trader) => {
    const url = (trader as any).hyperliquidUrl
      || `https://app.hyperliquid.xyz/vaults/${trader.address}?ref=COPYTRADING`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <Header
        lang={lang}
        onLanguageChange={setLang}
        colorMode={colorMode}
        onColorModeChange={setColorMode}
      />

      <div className="min-h-screen text-white p-4 md:p-6">
        <div className="max-w-[1800px] mx-auto">
          <McpBanner lang={lang} />

          {/* Controls */}
          <div className="mb-8 mt-6">
            <div className="flex items-center justify-between gap-3 flex-nowrap">
              <div className="flex gap-2 bg-[#0f172a]/80 backdrop-blur-md border border-[#00ff88]/10 rounded-lg p-1 shrink-0">
                <Button
                  onClick={() => setViewMode('card')}
                  variant="ghost"
                  size="sm"
                  className={`${viewMode === 'card'
                    ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40 shadow-[0_0_8px_rgba(0,255,136,0.15)]'
                    : 'text-[#94a3b8] hover:text-white hover:bg-white/10'
                  }`}
                >
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  {t('cardView', lang)}
                </Button>
                <Button
                  onClick={() => setViewMode('table')}
                  variant="ghost"
                  size="sm"
                  className={`${viewMode === 'table'
                    ? 'bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/40 shadow-[0_0_8px_rgba(0,255,136,0.15)]'
                    : 'text-[#94a3b8] hover:text-white hover:bg-white/10'
                  }`}
                >
                  <TableIcon className="w-4 h-4 mr-2" />
                  {t('tableView', lang)}
                </Button>
              </div>

              {viewMode === 'card' && (
                <div className="flex items-center gap-2 ml-auto shrink-0">
                  <span className="text-[#94a3b8] text-sm whitespace-nowrap">{t('sortBy', lang)}:</span>
                  <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value as SortOption)}>
                    <SelectTrigger className="w-[160px] bg-[#0f172a]/80 backdrop-blur-md border-[#00ff88]/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0a0e17] border-[#00ff88]/20 text-white">
                      <SelectItem value="radarScore">{t('compositeRank', lang)}</SelectItem>
                      <SelectSeparator className="my-1 h-px bg-[#00ff88]/10" />
                      <SelectItem value="annualizedReturn">{t('arr', lang)}</SelectItem>
                      <SelectItem value="sharpe">{t('sharpe', lang)}</SelectItem>
                      <SelectItem value="maxDrawdown">{t('maxDrawdown', lang)}</SelectItem>
                      <SelectItem value="balance">{t('balance', lang)}</SelectItem>
                      <SelectItem value="traderAge">{t('traderAge', lang)}</SelectItem>
                      <SelectItem value="timeInMarket">{t('timeInMarket', lang)}</SelectItem>
                      <SelectItem value="followerCount">{t('followerCount', lang)}</SelectItem>
                      <SelectItem value="winRate">{t('winRate', lang)}</SelectItem>
                      <SelectItem value="avgHoldDays">{t('avgHoldDays', lang)}</SelectItem>
                      <SelectItem value="avgTradesPerDay">{t('avgTradesPerDay', lang)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          {viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
              {displayedTraders.map((trader) => (
                <TraderCard
                  key={trader.id}
                  trader={trader}
                  lang={lang}
                  colorMode={colorMode}
                  onViewDetails={handleViewDetails}
                  onCopyTrade={openHyperliquidVault}
                />
              ))}
              {isLoading && (
                <div className="flex justify-center items-center col-span-full">
                  <Loader2 className="w-6 h-6 animate-spin text-[#00ff88]" />
                </div>
              )}
              <div ref={loadingRef} className="h-10"></div>
            </div>
          ) : (
            <div className="bg-[#0f172a]/80 backdrop-blur-md border border-[#00ff88]/10 rounded-lg p-4 overflow-x-auto">
              <TraderTableView
                traders={displayedTraders}
                lang={lang}
                colorMode={colorMode}
                onViewDetails={handleViewDetails}
                onCopyTrade={openHyperliquidVault}
                onSort={handleTableSort}
                sortColumn={tableSortColumn}
                sortDirection={tableSortDirection}
              />
              {isLoading && (
                <div className="flex justify-center items-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-[#00ff88]" />
                </div>
              )}
              <div ref={loadingRef} className="h-10"></div>
            </div>
          )}
        </div>

        <TraderDetailModal
          trader={selectedTrader}
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedTrader(null);
          }}
          onCopyTrade={openHyperliquidVault}
          lang={lang}
          colorMode={colorMode}
        />
      </div>
    </>
  );
}
