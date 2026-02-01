import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Trader, Language, ColorMode } from '../types/trader';
import { CumulativeReturnsChart } from './CumulativeReturnsChart';
import { t } from '../utils/translations';
import { getLastTradeCategory } from '../utils/timeago';
import { getValueColor } from '../utils/colorMode';
import { formatBalance } from '../utils/formatBalance';
import { formatTraderAge } from '../utils/formatTraderAge';
import { formatPercentAbs, formatSignedPercent } from '../utils/formatPercent';
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Info } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

interface TraderTableViewProps {
  traders: Trader[];
  lang: Language;
  colorMode: ColorMode;
  onViewDetails: (trader: Trader) => void;
  onSort: (column: string) => void;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
}

/**
 * 交易员表格视图组件。
 * @param props - 组件入参。
 * @returns 表格视图 UI。
 */
export function TraderTableView({
  traders,
  lang,
  colorMode,
  onViewDetails,
  onSort,
  sortColumn,
  sortDirection
}: TraderTableViewProps) {

  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-5 h-5 text-white/40 ml-1.5 inline-block" />;
    }
    return sortDirection === 'desc'
      ? <ArrowDown className="w-5 h-5 text-blue-400 ml-1.5 inline-block" />
      : <ArrowUp className="w-5 h-5 text-blue-400 ml-1.5 inline-block" />;
  };

  const handleHeaderClick = (column: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onSort(column);
  };

  const formatAddress = (address: string) => {
    if (address.length < 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="border-white/20 hover:bg-white/5">
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('radarChart', e)}
            >
              <div className="flex items-center justify-center gap-1">
                <span>Rank</span>
                {renderSortIcon('radarChart')}
              </div>
            </TableHead>
            <TableHead className="text-white/70 text-center text-base">{t('traderAddress', lang)}</TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('annualizedReturn', e)}
            >
              <div className="flex items-center justify-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-white/50 hover:text-white/80 cursor-help" onClick={(e) => e.stopPropagation()} />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2D1B4E] border border-white/20 text-white max-w-xs">
                    {t('arrTooltip', lang)}
                  </TooltipContent>
                </Tooltip>
                <span>{t('annualizedReturnLabel', lang)}</span>
                {renderSortIcon('annualizedReturn')}
              </div>
            </TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('sharpe', e)}
            >
              <div className="flex items-center justify-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-white/50 hover:text-white/80 cursor-help" onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2D1B4E] border border-white/20 text-white max-w-xs">
                    {t('sharpeTooltip', lang)}
                  </TooltipContent>
                </Tooltip>
                <span>{t('sharpeLabel', lang)}</span>
                {renderSortIcon('sharpe')}
              </div>
            </TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('maxDrawdown', e)}
            >
              <div className="flex items-center justify-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-white/50 hover:text-white/80 cursor-help" onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#2D1B4E] border border-white/20 text-white max-w-xs">
                    {t('mddTooltip', lang)}
                  </TooltipContent>
                </Tooltip>
                <span>{t('maxDrawdownLabel', lang)}</span>
                {renderSortIcon('maxDrawdown')}
              </div>
            </TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('balance', e)}
            >
              {t('balanceLabel', lang)}
              {renderSortIcon('balance')}
            </TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('traderAge', e)}
            >
              {t('traderAgeLabel', lang)}
              {renderSortIcon('traderAge')}
            </TableHead>
            <TableHead className="text-white/70 text-center text-base">{t('aiStrategy', lang)}</TableHead>
            <TableHead className="text-white/70 text-center text-base min-w-[240px]">{t('cumulativeReturns', lang)}</TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('timeInMarket', e)}
            >
              {t('timeInMarketLabel', lang)}
              {renderSortIcon('timeInMarket')}
            </TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('followers', e)}
            >
              {t('followers', lang)}
              {renderSortIcon('followers')}
            </TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('winRate', e)}
            >
              {t('winRateLabel', lang)}
              {renderSortIcon('winRate')}
            </TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('avgHoldDays', e)}
            >
              {t('avgHoldDaysLabel', lang)}
              {renderSortIcon('avgHoldDays')}
            </TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('avgTradesPerDay', e)}
            >
              {t('avgTradesPerDay', lang)}
              {renderSortIcon('avgTradesPerDay')}
            </TableHead>
            <TableHead
              className="text-white/70 text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('lastTrade', e)}
            >
              {t('lastTrade', lang)}
              {renderSortIcon('lastTrade')}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {traders.map((trader) => {
            const isPositive = trader.allTimeReturn > 0;
            const isArrPositive = trader.annualizedReturn > 0;
            return (
              <TableRow
                key={trader.id}
                className="border-white/20 hover:bg-white/5 cursor-pointer"
                onClick={() => onViewDetails(trader)}
              >
                <TableCell className="text-white text-center">
                  <div className="flex items-center justify-center">
                    <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2 py-1 rounded text-sm">
                      #{trader.rank}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-white font-mono text-sm text-center">
                  <div className="max-w-[150px] truncate mx-auto">
                    {formatAddress(trader.address)}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center gap-1 justify-center">
                    {isArrPositive ? (
                      <TrendingUp className={`w-4 h-4 ${getValueColor(trader.annualizedReturn, colorMode)}`} />
                    ) : (
                      <TrendingDown className={`w-4 h-4 ${getValueColor(trader.annualizedReturn, colorMode)}`} />
                    )}
                    <span className={getValueColor(trader.annualizedReturn, colorMode)}>
                      {formatSignedPercent(trader.annualizedReturn, 1)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-white text-center">
                  {Number.isFinite(trader.sharpeRatio) ? trader.sharpeRatio.toFixed(2) : '--'}
                </TableCell>
                <TableCell className={`${getValueColor(-Math.abs(trader.maxDrawdownPercent), colorMode)} text-center`}>
                  {formatPercentAbs(trader.maxDrawdownPercent, 1)}
                </TableCell>
                <TableCell className="text-white text-center">
                  {formatBalance(trader.balance)}
                </TableCell>
                <TableCell className="text-white text-center">
                  {formatTraderAge(trader.traderAgeDays, lang)}
                </TableCell>
                <TableCell className="text-white text-center">
                  <div className="flex gap-1.5 flex-wrap justify-center">
                    {trader.aiTags[lang].map((tag, index) => (
                      <span
                        key={index}
                        className="bg-blue-500/20 text-blue-200 border border-blue-400/30 px-2 py-0.5 rounded whitespace-nowrap"
                        style={{ fontSize: '0.65rem' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="w-[240px] h-[120px] mx-auto">
                    <CumulativeReturnsChart data={trader.pnlData} height={120} colorMode={colorMode} lang={lang} />
                  </div>
                </TableCell>
                <TableCell className="text-white text-center">
                  {formatPercentAbs(trader.timeInMarketPercent, 1)}
                </TableCell>
                <TableCell className="text-white text-center">
                  {trader.followerCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-white text-center">
                  {formatPercentAbs(trader.winRatePercent, 1)}
                </TableCell>
                <TableCell className="text-white text-center">
                  {trader.avgHoldDays.toFixed(1)}
                </TableCell>
                <TableCell className="text-white text-center">
                  {trader.avgTradesPerDay.toFixed(1)}
                </TableCell>
                <TableCell className="text-white text-sm text-center">
                  {getLastTradeCategory(trader.lastTradeTimestamp, lang)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
