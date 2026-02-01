import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { Trader, Language, ColorMode, TimePeriod, Trade } from '../types/trader';
import { RadarChart } from './RadarChart';
import { CumulativeReturnsChart } from './CumulativeReturnsChart';
import { MetricTabs } from './MetricTabs';
import { RiskNotice } from './RiskNotice';
import { fetchTraderTrades } from '../services/trades';
import { fetchEquitySeries } from '../services/equity';
import { fetchVaultPositions } from '../services/vaults';
import { t } from '../utils/translations';
import { getValueColor } from '../utils/colorMode';
import { formatTraderAge } from '../utils/formatTraderAge';
import { formatSignedPercent } from '../utils/formatPercent';
import { Users, TrendingUp, TrendingDown, Calendar } from 'lucide-react';

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTimestamp = (value: unknown) => {
  const time = new Date(value as any).getTime();
  return Number.isFinite(time) ? time : 0;
};

interface TraderDetailModalProps {
  trader: Trader | null;
  isOpen: boolean;
  onClose: () => void;
  onCopyTrade: (trader: Trader) => void;
  lang: Language;
  colorMode: ColorMode;
}

interface PositionRow {
  id: string;
  symbol: string;
  type: 'long' | 'short';
  quantity: number;
  positionValue: number;
  entryPrice: number;
  markPrice: number;
  pnl: number;
  roe: number;
}

/**
 * 标准化持仓数据为 UI 行结构。
 * @param vaultAddress - Vault 地址。
 * @param raw - 原始持仓数组。
 * @returns 标准化后的持仓行。
 */
const normalizePositionRows = (vaultAddress: string, raw: any[]): PositionRow[] => {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const sideRaw = String(item?.side ?? item?.dir ?? item?.type ?? '').toLowerCase();
    const type: 'long' | 'short' =
      sideRaw.includes('short') || sideRaw === 's' || sideRaw === 'sell' ? 'short' : 'long';
    const quantity = toNumber(item?.quantity ?? item?.sz ?? item?.size, 0);
    const entryPrice = toNumber(item?.entry_price ?? item?.entryPrice ?? item?.entry, 0);
    const markPrice = toNumber(item?.mark_price ?? item?.markPrice ?? item?.mark, entryPrice);
    const positionValue = toNumber(
      item?.position_value ?? item?.positionValue,
      markPrice * quantity,
    );
    const direction = type === 'short' ? -1 : 1;
    const pnl = (markPrice - entryPrice) * quantity * direction;
    const roeFallback = positionValue > 0 ? (pnl / positionValue) * 100 : 0;
    const roe = toNumber(item?.roe_percent ?? item?.roePercent, roeFallback);
    return {
      id: item?.id ?? item?.position_id ?? `${vaultAddress}-${index}`,
      symbol: item?.symbol ?? item?.coin ?? item?.asset ?? 'BTC',
      type,
      quantity,
      positionValue,
      entryPrice,
      markPrice,
      pnl,
      roe,
    };
  });
};

export function TraderDetailModal({ trader, isOpen, onClose, onCopyTrade, lang, colorMode }: TraderDetailModalProps) {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('ALL');
  const [detailTrades, setDetailTrades] = useState<Trade[]>(trader?.trades ?? []);
  const [equitySeries, setEquitySeries] = useState(trader?.pnlData ?? []);
  const [detailPositions, setDetailPositions] = useState<PositionRow[]>([]);
  const [showCopied, setShowCopied] = useState(false);
  const [tradePage, setTradePage] = useState(1);
  const [positionPage, setPositionPage] = useState(1);

  useEffect(() => {
    if (!trader) {
      setDetailTrades([]);
      setEquitySeries([]);
      setDetailPositions([]);
      return;
    }
    setDetailTrades(trader.trades);
    setEquitySeries(trader.pnlData);
    setDetailPositions([]);
    setTradePage(1);
    setPositionPage(1);
  }, [trader]);

  useEffect(() => {
    if (!trader) return;
    let isActive = true;

    const loadDetails = async () => {
      try {
        const [trades, equity, positions] = await Promise.all([
          fetchTraderTrades(trader.id),
          fetchEquitySeries(trader.id, timePeriod),
          fetchVaultPositions(trader.id),
        ]);

        if (!isActive) return;
        if (Array.isArray(trades?.items)) {
          setDetailTrades(
            trades.items.map((item: any, index: number) => ({
              id: item.id ?? item.tx_hash ?? `trade-${index}`,
              timestamp: toTimestamp(item.timestamp),
              type: item.side ?? item.type ?? 'long',
              entry: toNumber(item.entry ?? item.entry_price ?? item.price, 0),
              exit: toNumber(item.exit ?? item.exit_price ?? item.price, 0),
              pnl: toNumber(item.pnl, 0),
              size: toNumber(item.size ?? item.quantity, 0),
              symbol: item.symbol ?? item.coin ?? item.asset ?? 'BTC',
              price: toNumber(item.price ?? item.entry ?? item.entry_price, 0),
            }))
          );
        }

        if (Array.isArray(equity?.points)) {
          setEquitySeries(
            equity.points.map((point: any) => ({
              timestamp: toTimestamp(point.timestamp),
              pnl: toNumber(point.vault_equity ?? point.vaultEquity, 0),
              btcPnl: toNumber(point.btc_equity ?? point.btcEquity, 0),
            }))
          );
        }

        if (Array.isArray(positions)) {
          setDetailPositions(normalizePositionRows(trader.id, positions));
        }
      } catch {
        if (!isActive || !trader) return;
        setDetailTrades(trader.trades);
        setEquitySeries(trader.pnlData);
        setDetailPositions([]);
      }
    };

    loadDetails();

    return () => {
      isActive = false;
    };
  }, [trader, timePeriod]);

  /**
   * 复制交易者地址到剪贴板。
   * @returns void
   */
  const handleCopyAddress = async () => {
    if (!trader) return;
    const address = trader.address;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(address);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = address;
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

  const pageSize = 10;
  const tradePages = Math.max(1, Math.ceil(detailTrades.length / pageSize));
  const positionRows = detailPositions;
  const positionPages = Math.max(1, Math.ceil(positionRows.length / pageSize));
  const pagedTrades = detailTrades.slice((tradePage - 1) * pageSize, tradePage * pageSize);
  const pagedPositions = positionRows.slice((positionPage - 1) * pageSize, positionPage * pageSize);

  if (!trader) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="bg-[#1A0B2E] border-white/20 text-white w-[92vw] sm:w-[80vw] md:w-[72vw] lg:w-[64vw] max-w-6xl h-full overflow-y-auto shadow-[-24px_0_48px_rgba(0,0,0,0.5)]"
        style={{
          backdropFilter: 'blur(10px)',
          background: 'rgba(26, 11, 46, 0.96)'
        }}
      >
        <SheetHeader className="px-4 pt-6">
          <SheetTitle className="text-white text-xl">
            {t('traderDetails', lang)}
          </SheetTitle>
          <SheetDescription className="text-white/70">
            {t('traderDetailsDescription', lang)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-4 px-4 pb-6">
          {/* Copy Trade Primary */}
          <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <Button
              onClick={() => onCopyTrade(trader)}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
            >
              {t('copyTrade', lang)}
            </Button>
          </div>

          {/* Trader Header */}
          <div className="flex items-start justify-between gap-4 p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <div className="flex-1">
              <p className="text-white/70 text-sm mb-1">{t('traderAddress', lang)}</p>
              <div className="flex items-center gap-2 mb-4">
                <Tooltip open={showCopied}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="text-white font-mono text-sm hover:text-white/80 cursor-pointer"
                    >
                      {trader.address}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-blue-500/90 border-blue-400/50 text-white backdrop-blur-sm">
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
                  <span className="text-white/70 text-sm">{t('allTimeReturnLabel', lang)}:</span>
                  <span className={getValueColor(trader.allTimeReturn, colorMode)}>
                    {formatSignedPercent(trader.allTimeReturn, 1)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <span className="text-white/70 text-sm">{t('traderAgeLabel', lang)}:</span>
                  <span className="text-white">{formatTraderAge(trader.traderAgeDays, lang)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-white/70 text-sm">{t('followers', lang)}:</span>
                  <span className="text-white">{trader.followerCount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <h3 className="text-white mb-4">{t('performanceMetrics', lang)}</h3>
            <div className="flex justify-center">
              <RadarChart
                metrics={trader.metrics}
                trader={trader}
                lang={lang}
                size={320}
              />
            </div>
          </div>

          {/* AI Strategy */}
          <div className="p-4 bg-purple-500/10 border border-purple-400/20 rounded-lg">
            <h3 className="text-purple-300 mb-3">{lang === 'en' ? 'AI Investment Tags' : 'AI投资标签'}</h3>
            <div className="flex flex-wrap gap-2">
              {trader.aiTags[lang].slice(0, 5).map((tag, index) => (
                <Badge
                  key={index}
                  className="bg-purple-500/20 text-purple-200 border-purple-400/30 px-2 py-1"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          <RiskNotice lang={lang} />

          {/* Cumulative Returns */}
          <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <div className="flex flex-col gap-3 mb-4">
              <h3 className="text-white">{lang === 'en' ? 'Cumulative Returns' : '累计收益'}</h3>
              <MetricTabs value={timePeriod} onChange={setTimePeriod} />
            </div>
            <CumulativeReturnsChart
              data={equitySeries}
              height={320}
              colorMode={colorMode}
              lang={lang}
              showBtcComparison={true}
            />
          </div>

          {/* Trade History / Positions */}
          <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <Tabs
              defaultValue="trades"
              onValueChange={(value: string) => {
                if (value === 'trades') {
                  setTradePage(1);
                }
                if (value === 'positions') {
                  setPositionPage(1);
                }
              }}
            >
              <TabsList className="bg-white/5 border border-white/15 mb-4">
                <TabsTrigger
                  value="trades"
                  className="text-white/60 border border-transparent data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/30 data-[state=active]:to-purple-500/30 data-[state=active]:border-blue-300/50 data-[state=active]:shadow-[0_0_20px_rgba(59,130,246,0.25)]"
                >
                  {lang === 'en' ? 'Trades' : '交易记录'}
                </TabsTrigger>
                <TabsTrigger
                  value="positions"
                  className="text-white/60 border border-transparent data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500/30 data-[state=active]:to-purple-500/30 data-[state=active]:border-blue-300/50 data-[state=active]:shadow-[0_0_20px_rgba(59,130,246,0.25)]"
                >
                  {lang === 'en' ? 'Latest Positions' : '最新仓位'}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="trades">
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  {pagedTrades.length === 0 ? (
                    <div className="text-white/60 text-sm py-6 text-center">
                      {lang === 'en' ? 'No trade records yet' : '暂无交易记录'}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/20">
                          <TableHead className="text-white/70">{t('date', lang)}</TableHead>
                          <TableHead className="text-white/70">{lang === 'en' ? 'Symbol' : '币种'}</TableHead>
                          <TableHead className="text-white/70">{t('type', lang)}</TableHead>
                          <TableHead className="text-white/70">{lang === 'en' ? 'Price' : '价格'}</TableHead>
                          <TableHead className="text-white/70">{lang === 'en' ? 'Quantity' : '数量'}</TableHead>
                          <TableHead className="text-white/70">{lang === 'en' ? 'Notional' : '成交价值'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedTrades.map((trade) => {
                          const price = trade.price ?? trade.entry;
                          const quantity = trade.size ?? 0;
                          const notional = price * quantity;
                          return (
                            <TableRow key={trade.id} className="border-white/20">
                              <TableCell className="text-white text-sm">
                                {new Date(trade.timestamp).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN')}
                              </TableCell>
                              <TableCell className="text-white text-sm">
                                {trade.symbol ?? 'BTC'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    trade.type === 'long'
                                      ? 'bg-green-500/20 text-green-300 border-green-400/30'
                                      : 'bg-red-500/20 text-red-300 border-red-400/30'
                                  }
                                >
                                  {trade.type === 'long' ? t('long', lang) : t('short', lang)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-white text-sm">
                                ${price.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-white text-sm">
                                {quantity.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-white text-sm">
                                ${notional.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
                {pagedTrades.length > 0 && (
                  <div className="flex items-center justify-between mt-3">
                    <Button
                      variant="outline"
                      className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                      disabled={tradePage <= 1}
                      onClick={() => setTradePage((prev) => Math.max(1, prev - 1))}
                    >
                      {lang === 'en' ? 'Prev' : '上一页'}
                    </Button>
                    <span className="text-white/60 text-sm">
                      {tradePage} / {tradePages}
                    </span>
                    <Button
                      variant="outline"
                      className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                      disabled={tradePage >= tradePages}
                      onClick={() => setTradePage((prev) => Math.min(tradePages, prev + 1))}
                    >
                      {lang === 'en' ? 'Next' : '下一页'}
                    </Button>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="positions">
                <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                  {pagedPositions.length === 0 ? (
                    <div className="text-white/60 text-sm py-6 text-center">
                      {lang === 'en' ? 'No position data yet' : '暂无仓位数据'}
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow className="border-white/20">
                          <TableHead className="text-white/70">{lang === 'en' ? 'Symbol' : '币种'}</TableHead>
                          <TableHead className="text-white/70">{t('type', lang)}</TableHead>
                          <TableHead className="text-white/70">{lang === 'en' ? 'Quantity' : '数量'}</TableHead>
                          <TableHead className="text-white/70">{lang === 'en' ? 'Position Value' : '仓位价值'}</TableHead>
                          <TableHead className="text-white/70">{lang === 'en' ? 'Entry Price' : '开仓价格'}</TableHead>
                          <TableHead className="text-white/70">{lang === 'en' ? 'Mark Price' : '标记价格'}</TableHead>
                          <TableHead className="text-white/70">{lang === 'en' ? 'PnL (ROE%)' : '盈亏(ROE%)'}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedPositions.map((position) => {
                          const pnlText = `${position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)} (${position.roe.toFixed(1)}%)`;
                          return (
                            <TableRow key={position.id} className="border-white/20">
                              <TableCell className="text-white text-sm">{position.symbol}</TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    position.type === 'long'
                                      ? 'bg-green-500/20 text-green-300 border-green-400/30'
                                      : 'bg-red-500/20 text-red-300 border-red-400/30'
                                  }
                                >
                                  {position.type === 'long' ? t('long', lang) : t('short', lang)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-white text-sm">{position.quantity.toLocaleString()}</TableCell>
                              <TableCell className="text-white text-sm">
                                ${position.positionValue.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-white text-sm">
                                ${position.entryPrice.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-white text-sm">
                                ${position.markPrice.toLocaleString()}
                              </TableCell>
                              <TableCell className={getValueColor(position.pnl, colorMode)}>
                                {pnlText}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
                <div className="flex items-center justify-between mt-3">
                  <Button
                    variant="outline"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                    disabled={positionPage <= 1}
                    onClick={() => setPositionPage((prev) => Math.max(1, prev - 1))}
                  >
                    {lang === 'en' ? 'Prev' : '上一页'}
                  </Button>
                  <span className="text-white/60 text-sm">
                    {positionPage} / {positionPages}
                  </span>
                  <Button
                    variant="outline"
                    className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                    disabled={positionPage >= positionPages}
                    onClick={() => setPositionPage((prev) => Math.min(positionPages, prev + 1))}
                  >
                    {lang === 'en' ? 'Next' : '下一页'}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Copy Trade Secondary */}
          <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <Button
              onClick={() => onCopyTrade(trader)}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
            >
              {t('copyTrade', lang)}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
