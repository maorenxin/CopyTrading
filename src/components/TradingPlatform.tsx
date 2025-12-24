import { useState, useMemo, useEffect, useRef } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { LayoutGrid, Table as TableIcon, TrendingUp, Users, Target, DollarSign, Loader2 } from 'lucide-react';
import { Trader, Language, SortOption, ViewMode, ColorMode } from '../types/trader';
import { TraderCard } from './TraderCard';
import { TraderTableView } from './TraderTableView';
import { TraderDetailModal } from './TraderDetailModal';
import { CopyTradeModal } from './CopyTradeModal';
import { WalletConnect } from './WalletConnect';
import { LanguageSwitcher } from './LanguageSwitcher';
import { MobilePortfolioSheet } from './MobilePortfolioSheet';
import { Header } from './Header';
import { t } from '../utils/translations';
import { fetchTraders } from '../services/traders';

export function TradingPlatform() {
    const [lang, setLang] = useState<Language>('en');
    const [colorMode, setColorMode] = useState<ColorMode>('standard');
    const [viewMode, setViewMode] = useState<ViewMode>('card');
    const [sortBy, setSortBy] = useState<SortOption>('allTimeReturn');
    const [selectedTrader, setSelectedTrader] = useState<Trader | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isCopyTradeModalOpen, setIsCopyTradeModalOpen] = useState(false);
    const [copyTradeTrader, setCopyTradeTrader] = useState<Trader | null>(null);
    const [traders, setTraders] = useState<Trader[]>([]);
    const [displayCount, setDisplayCount] = useState(8);
    const [isLoading, setIsLoading] = useState(false);
    const [isFetching, setIsFetching] = useState(false);
    const loadingRef = useRef<HTMLDivElement>(null);

    // Table sorting state
    const [tableSortColumn, setTableSortColumn] = useState<string | null>('annualizedReturn');
    const [tableSortDirection, setTableSortDirection] = useState<'asc' | 'desc'>('desc');

    // Handle table column sort
    const handleTableSort = (column: string) => {
        if (tableSortColumn === column) {
            // Toggle direction
            setTableSortDirection(tableSortDirection === 'desc' ? 'asc' : 'desc');
        } else {
            // New column, set default direction to descending
            setTableSortColumn(column);
            setTableSortDirection('desc');
        }
    };

    // Sort traders
    const sortedTraders = useMemo(() => {
        const sortedTradersList = [...traders];

        // Table view sorting
        if (viewMode === 'table' && tableSortColumn) {
            return sortedTradersList.sort((a, b) => {
                let aValue: number;
                let bValue: number;

                switch (tableSortColumn) {
                    case 'radarChart':
                        aValue = a.radarScore;
                        bValue = b.radarScore;
                        break;
                    case 'traderAge':
                        aValue = a.traderAgeDays;
                        bValue = b.traderAgeDays;
                        break;
                    case 'annualizedReturn':
                        aValue = a.annualizedReturn;
                        bValue = b.annualizedReturn;
                        break;
                    case 'sharpe':
                        aValue = a.metrics.sharpe;
                        bValue = b.metrics.sharpe;
                        break;
                    case 'followers':
                        aValue = a.followerCount;
                        bValue = b.followerCount;
                        break;
                    case 'maxDrawdown':
                        aValue = a.maxDrawdownPercent;
                        bValue = b.maxDrawdownPercent;
                        break;
                    case 'winRate':
                        aValue = a.winRatePercent;
                        bValue = b.winRatePercent;
                        break;
                    case 'timeInMarket':
                        aValue = a.timeInMarketPercent;
                        bValue = b.timeInMarketPercent;
                        break;
                    case 'avgHoldDays':
                        aValue = a.avgHoldDays;
                        bValue = b.avgHoldDays;
                        break;
                    case 'avgTradesPerDay':
                        aValue = a.avgTradesPerDay;
                        bValue = b.avgTradesPerDay;
                        break;
                    case 'lastTrade':
                        aValue = a.lastTradeTimestamp;
                        bValue = b.lastTradeTimestamp;
                        break;
                    default:
                        return 0;
                }

                return tableSortDirection === 'desc' ? bValue - aValue : aValue - bValue;
            });
        }

        // Card view sorting
        switch (sortBy) {
            case 'sharpe':
                return sortedTradersList.sort((a, b) => b.metrics.sharpe - a.metrics.sharpe);
            case 'allTimeReturn':
                return sortedTradersList.sort((a, b) => b.allTimeReturn - a.allTimeReturn);
            case 'maxDrawdown':
                return sortedTradersList.sort((a, b) => a.maxDrawdownPercent - b.maxDrawdownPercent); // Lower is better
            case 'winRate':
                return sortedTradersList.sort((a, b) => b.winRatePercent - a.winRatePercent);
            case 'traderAge':
                return sortedTradersList.sort((a, b) => b.traderAgeDays - a.traderAgeDays);
            case 'followerCount':
                return sortedTradersList.sort((a, b) => b.followerCount - a.followerCount);
            default:
                return sortedTradersList;
        }
    }, [traders, sortBy, viewMode, tableSortColumn, tableSortDirection]);

    // Get displayed traders based on displayCount
    const displayedTraders = useMemo(() => {
        return sortedTraders.slice(0, displayCount);
    }, [sortedTraders, displayCount]);

    // 加载交易员数据（失败时使用本地 mock）
    useEffect(() => {
        let isActive = true;

        const loadTraders = async () => {
            setIsFetching(true);
            try {
                const items = await fetchTraders({
                    view: viewMode,
                    sort: sortBy,
                    order: 'desc',
                    lang,
                });
                if (isActive) {
                    setTraders(items);
                }
            } catch {
                if (isActive) {
                    setTraders([]);
                }
            } finally {
                if (isActive) {
                    setIsFetching(false);
                }
            }
        };

        loadTraders();

        return () => {
            isActive = false;
        };
    }, [lang, sortBy, viewMode]);

    // Infinite scroll handler
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                const target = entries[0];
                if (target.isIntersecting && !isLoading && displayCount < sortedTraders.length) {
                    setIsLoading(true);
                    // Simulate loading delay
                    setTimeout(() => {
                        setDisplayCount((prev: number) => Math.min(prev + 8, sortedTraders.length));
                        setIsLoading(false);
                    }, 800);
                }
            },
            {
                root: null,
                rootMargin: '100px',
                threshold: 0.1,
            }
        );

        if (loadingRef.current) {
            observer.observe(loadingRef.current);
        }

        return () => {
            if (loadingRef.current) {
                observer.unobserve(loadingRef.current);
            }
        };
    }, [isLoading, displayCount, sortedTraders.length]);

    // Reset displayCount when sortBy changes
    useEffect(() => {
        setDisplayCount(8);
    }, [sortBy]);

    // Reset displayCount when viewMode changes or table sort changes
    useEffect(() => {
        setDisplayCount(8);
    }, [viewMode, tableSortColumn, tableSortDirection]);

    const handleViewDetails = (trader: Trader) => {
        setSelectedTrader(trader);
        setIsDetailModalOpen(true);
    };

    const handleCopyTrade = (trader: Trader) => {
        setCopyTradeTrader(trader);
        setIsCopyTradeModalOpen(true);
    };

    return (
        <>
            {/* Global Header */}
            <Header lang={lang} onLanguageChange={setLang} colorMode={colorMode} onColorModeChange={setColorMode} />

            <div className="min-h-screen text-white p-4 md:p-6">
                <div className="max-w-[1800px] mx-auto">
                    {/* Controls */}
                    <div className="mb-8">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            {/* View Mode Toggle */}
                            <div className="flex gap-2 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-1">
                                <Button
                                    onClick={() => setViewMode('card')}
                                    variant="ghost"
                                    size="sm"
                                    className={`${viewMode === 'card'
                                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                                        : 'text-white/70 hover:text-white hover:bg-white/10'
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
                                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                                        : 'text-white/70 hover:text-white hover:bg-white/10'
                                        }`}
                                >
                                    <TableIcon className="w-4 h-4 mr-2" />
                                    {t('tableView', lang)}
                                </Button>
                            </div>

                            {/* Sort Control - Only show in Card View */}
                            {viewMode === 'card' && (
                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <span className="text-white/70 text-sm whitespace-nowrap">{t('sortBy', lang)}:</span>
                                    <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value as SortOption)}>
                                        <SelectTrigger className="w-full sm:w-[200px] bg-white/10 backdrop-blur-md border-white/20 text-white">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#1A0B2E] border-white/20 text-white">
                                            <SelectItem value="allTimeReturn">{t('allTimeReturn', lang)}</SelectItem>
                                            <SelectItem value="sharpe">{t('sharpe', lang)}</SelectItem>
                                            <SelectItem value="maxDrawdown">{t('maxDrawdown', lang)}</SelectItem>
                                            <SelectItem value="winRate">{t('winRate', lang)}</SelectItem>
                                            <SelectItem value="traderAge">{t('traderAge', lang)}</SelectItem>
                                            <SelectItem value="followerCount">{t('followerCount', lang)}</SelectItem>
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
                                    onCopyTrade={handleCopyTrade}
                                />
                            ))}
                            {isLoading && (
                                <div className="flex justify-center items-center col-span-full">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                            )}
                            <div ref={loadingRef} className="h-10"></div>
                        </div>
                    ) : (
                        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-lg p-4 overflow-x-auto">
                            <TraderTableView
                                traders={displayedTraders}
                                lang={lang}
                                colorMode={colorMode}
                                onViewDetails={handleViewDetails}
                                onSort={handleTableSort}
                                sortColumn={tableSortColumn}
                                sortDirection={tableSortDirection}
                            />
                            {isLoading && (
                                <div className="flex justify-center items-center py-4">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                            )}
                            <div ref={loadingRef} className="h-10"></div>
                        </div>
                    )}
                </div>

                {/* Modals */}
                <TraderDetailModal
                    trader={selectedTrader}
                    isOpen={isDetailModalOpen}
                    onClose={() => {
                        setIsDetailModalOpen(false);
                        setSelectedTrader(null);
                    }}
                    onCopyTrade={handleCopyTrade}
                    lang={lang}
                    colorMode={colorMode}
                />

                <CopyTradeModal
                    trader={copyTradeTrader}
                    isOpen={isCopyTradeModalOpen}
                    onClose={() => {
                        setIsCopyTradeModalOpen(false);
                        setCopyTradeTrader(null);
                    }}
                    lang={lang}
                />
            </div>
        </>
    );
}
