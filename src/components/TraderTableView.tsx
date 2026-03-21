import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Button } from './ui/button';
import { Trader, Language, ColorMode } from '../types/trader';
import { CumulativeReturnsChart } from './CumulativeReturnsChart';
import { t } from '../utils/translations';
import { getLastTradeCategory } from '../utils/timeago';
import { getValueColor } from '../utils/colorMode';
import { formatBalance } from '../utils/formatBalance';
import { formatTraderAge } from '../utils/formatTraderAge';
import { formatPercentAbs, formatSignedPercent } from '../utils/formatPercent';
import { TrendingUp, TrendingDown, ArrowUpDown, ArrowUp, ArrowDown, Info, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';

interface TraderTableViewProps {
  traders: Trader[];
  lang: Language;
  colorMode: ColorMode;
  onViewDetails: (trader: Trader) => void;
  onCopyTrade: (trader: Trader) => void;
  onSort: (column: string) => void;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
}

export function TraderTableView({
  traders,
  lang,
  colorMode,
  onViewDetails,
  onCopyTrade,
  onSort,
  sortColumn,
  sortDirection
}: TraderTableViewProps) {

  const renderSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return <ArrowUpDown className="w-5 h-5 text-[#94a3b8]/40 ml-1.5 inline-block" />;
    }
    return sortDirection === 'desc'
      ? <ArrowDown className="w-5 h-5 text-[#00d4ff] ml-1.5 inline-block" />
      : <ArrowUp className="w-5 h-5 text-[#00d4ff] ml-1.5 inline-block" />;
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
          <TableRow className="border-[#00ff88]/10 hover:bg-[#00ff88]/5">
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('radarChart', e)}
            >
              <div className="flex items-center justify-center gap-1">
                <span>Rank</span>
                {renderSortIcon('radarChart')}
              </div>
            </TableHead>
            <TableHead className="text-[#94a3b8] text-center text-base">{t('traderAddress', lang)}</TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('annualizedReturn', e)}
            >
              <div className="flex items-center justify-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-[#94a3b8]/50 hover:text-[#94a3b8]/80 cursor-help" onClick={(e) => e.stopPropagation()} />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#0f172a] border border-[#00ff88]/20 text-white max-w-xs">
                    {t('arrTooltip', lang)}
                  </TooltipContent>
                </Tooltip>
                <span>{t('annualizedReturnLabel', lang)}</span>
                {renderSortIcon('annualizedReturn')}
              </div>
            </TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('sharpe', e)}
            >
              <div className="flex items-center justify-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-[#94a3b8]/50 hover:text-[#94a3b8]/80 cursor-help" onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#0f172a] border border-[#00ff88]/20 text-white max-w-xs">
                    {t('sharpeTooltip', lang)}
                  </TooltipContent>
                </Tooltip>
                <span>{t('sharpeLabel', lang)}</span>
                {renderSortIcon('sharpe')}
              </div>
            </TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('maxDrawdown', e)}
            >
              <div className="flex items-center justify-center gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-4 h-4 text-[#94a3b8]/50 hover:text-[#94a3b8]/80 cursor-help" onClick={(e: React.MouseEvent) => e.stopPropagation()} />
                  </TooltipTrigger>
                  <TooltipContent className="bg-[#0f172a] border border-[#00ff88]/20 text-white max-w-xs">
                    {t('mddTooltip', lang)}
                  </TooltipContent>
                </Tooltip>
                <span>{t('maxDrawdownLabel', lang)}</span>
                {renderSortIcon('maxDrawdown')}
              </div>
            </TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('balance', e)}
            >
              {t('balanceLabel', lang)}
              {renderSortIcon('balance')}
            </TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('traderAge', e)}
            >
              {t('traderAgeLabel', lang)}
              {renderSortIcon('traderAge')}
            </TableHead>
            <TableHead className="text-[#94a3b8] text-center text-base min-w-[240px]">{t('cumulativeReturns', lang)}</TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('timeInMarket', e)}
            >
              {t('timeInMarketLabel', lang)}
              {renderSortIcon('timeInMarket')}
            </TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('followers', e)}
            >
              {t('followers', lang)}
              {renderSortIcon('followers')}
            </TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('winRate', e)}
            >
              {t('winRateLabel', lang)}
              {renderSortIcon('winRate')}
            </TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('avgHoldDays', e)}
            >
              {t('avgHoldDaysLabel', lang)}
              {renderSortIcon('avgHoldDays')}
            </TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('avgTradesPerDay', e)}
            >
              {t('avgTradesPerDay', lang)}
              {renderSortIcon('avgTradesPerDay')}
            </TableHead>
            <TableHead
              className="text-[#94a3b8] text-center cursor-pointer hover:text-white transition-colors text-base"
              onClick={(e) => handleHeaderClick('lastTrade', e)}
            >
              {t('lastTrade', lang)}
              {renderSortIcon('lastTrade')}
            </TableHead>
            <TableHead className="text-[#94a3b8] text-center text-base">{t('copyTrade', lang)}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {traders.map((trader) => {
            const isArrPositive = trader.annualizedReturn > 0;
            return (
              <TableRow
                key={trader.id}
                className="border-[#00ff88]/10 hover:bg-[#00ff88]/5 cursor-pointer"
                onClick={() => onViewDetails(trader)}
              >
                <TableCell className="text-white text-center">
                  <div className="flex items-center justify-center">
                    <span className="bg-[#00ff88]/20 text-[#00ff88] border border-[#00ff88]/30 px-2 py-1 rounded text-sm font-mono">
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
                  <div className="flex items-center gap-1 justify-center font-mono">
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
                <TableCell className="text-white text-center font-mono">
                  {Number.isFinite(trader.sharpeRatio) ? trader.sharpeRatio.toFixed(2) : '--'}
                </TableCell>
                <TableCell className={`${getValueColor(-Math.abs(trader.maxDrawdownPercent), colorMode)} text-center font-mono`}>
                  {formatPercentAbs(trader.maxDrawdownPercent, 1)}
                </TableCell>
                <TableCell className="text-white text-center font-mono">
                  {formatBalance(trader.balance)}
                </TableCell>
                <TableCell className="text-white text-center">
                  {formatTraderAge(trader.traderAgeDays, lang)}
                </TableCell>
                <TableCell className="text-center">
                  <div className="w-[240px] h-[120px] mx-auto">
                    <CumulativeReturnsChart data={trader.pnlData} height={120} colorMode={colorMode} lang={lang} />
                  </div>
                </TableCell>
                <TableCell className="text-white text-center font-mono">
                  {formatPercentAbs(trader.timeInMarketPercent, 1)}
                </TableCell>
                <TableCell className="text-white text-center font-mono">
                  {trader.followerCount.toLocaleString()}
                </TableCell>
                <TableCell className="text-white text-center font-mono">
                  {formatPercentAbs(trader.winRatePercent, 1)}
                </TableCell>
                <TableCell className="text-white text-center font-mono">
                  {trader.avgHoldDays.toFixed(1)}
                </TableCell>
                <TableCell className="text-white text-center font-mono">
                  {trader.avgTradesPerDay.toFixed(1)}
                </TableCell>
                <TableCell className="text-white text-sm text-center">
                  {getLastTradeCategory(trader.lastTradeTimestamp, lang)}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCopyTrade(trader);
                    }}
                    className="bg-gradient-to-r from-[#00ff88] to-[#00d4ff] hover:from-[#00ff88]/90 hover:to-[#00d4ff]/90 text-black font-semibold text-xs px-3 py-1 hover:shadow-[0_0_12px_rgba(0,255,136,0.3)]"
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    {t('copyTrade', lang)}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
