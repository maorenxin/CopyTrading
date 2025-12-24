import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Trader, Language, ColorMode } from '../types/trader';
import { RadarChart } from './RadarChart';
import { CumulativeReturnsChart } from './CumulativeReturnsChart';
import { t } from '../utils/translations';
import { getValueColor } from '../utils/colorMode';
import { formatTraderAge } from '../utils/formatTraderAge';
import { Users, TrendingUp, TrendingDown, Calendar, Target, PieChart, Hourglass, Activity } from 'lucide-react';

interface TraderDetailModalProps {
  trader: Trader | null;
  isOpen: boolean;
  onClose: () => void;
  onCopyTrade: (trader: Trader) => void;
  lang: Language;
  colorMode: ColorMode;
}

export function TraderDetailModal({ trader, isOpen, onClose, onCopyTrade, lang, colorMode }: TraderDetailModalProps) {
  if (!trader) return null;

  const isPositive = trader.allTimeReturn > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="bg-[#1A0B2E] border-white/20 text-white max-w-5xl max-h-[90vh] overflow-y-auto"
        style={{ 
          backdropFilter: 'blur(10px)',
          background: 'rgba(26, 11, 46, 0.95)'
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-white text-xl">
            {t('traderDetails', lang)}
          </DialogTitle>
          <DialogDescription className="text-white/70">
            {t('traderDetailsDescription', lang)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Trader Header */}
          <div className="flex items-start justify-between gap-4 p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <div className="flex-1">
              <p className="text-white/70 text-sm mb-1">{t('traderAddress', lang)}</p>
              <p className="text-white font-mono mb-4">{trader.address}</p>
              
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-white/70 text-sm">{t('followers', lang)}:</span>
                  <span className="text-white">{trader.followerCount.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-purple-400" />
                  <span className="text-white/70 text-sm">{t('traderAgeLabel', lang)}:</span>
                  <span className="text-white">{formatTraderAge(trader.traderAgeDays, lang)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {isPositive ? (
                    <TrendingUp className={`w-4 h-4 ${getValueColor(trader.allTimeReturn, colorMode)}`} />
                  ) : (
                    <TrendingDown className={`w-4 h-4 ${getValueColor(trader.allTimeReturn, colorMode)}`} />
                  )}
                  <span className="text-white/70 text-sm">{t('allTimeReturnLabel', lang)}:</span>
                  <span className={getValueColor(trader.allTimeReturn, colorMode)}>
                    {isPositive ? '+' : ''}{trader.allTimeReturn.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            <Button
              onClick={() => onCopyTrade(trader)}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
            >
              {t('copyTrade', lang)}
            </Button>
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
              <h3 className="text-white mb-4">{t('performanceMetrics', lang)}</h3>
              <RadarChart 
                metrics={trader.metrics} 
                trader={trader} 
                lang={lang} 
                size={250}
              />
            </div>

            {/* Key Metrics */}
            <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
              <h3 className="text-white mb-4">{t('performanceMetrics', lang)}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-white/70 text-sm mb-1">{t('allTimeReturnLabel', lang)}</p>
                  <p className={`text-xl ${getValueColor(trader.allTimeReturn, colorMode)}`}>
                    {isPositive ? '+' : ''}{trader.allTimeReturn.toFixed(1)}%
                  </p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-white/70 text-sm mb-1">{t('maxDrawdownLabel', lang)}</p>
                  <p className={`text-xl ${getValueColor(-Math.abs(trader.maxDrawdownPercent), colorMode)}`}>
                    {trader.maxDrawdownPercent.toFixed(1)}%
                  </p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-white/70 text-sm mb-1">{t('winRateLabel', lang)}</p>
                  <p className="text-xl text-white">{trader.winRatePercent.toFixed(1)}%</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg">
                  <p className="text-white/70 text-sm mb-1">{t('avgTradesPerDay', lang)}</p>
                  <p className="text-xl text-white">{trader.avgTradesPerDay.toFixed(1)}</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg col-span-2">
                  <p className="text-white/70 text-sm mb-1">{lang === 'en' ? 'Current Balance' : '当前余额'}</p>
                  <p className="text-xl text-white">${trader.balance.toLocaleString()} USDC</p>
                </div>
              </div>
            </div>
          </div>

          {/* AI Strategy */}
          <div className="p-4 bg-purple-500/10 border border-purple-400/20 rounded-lg">
            <h3 className="text-purple-300 mb-2">AI {t('aiStrategy', lang)}</h3>
            <p className="text-white/90">{trader.aiStrategy[lang]}</p>
          </div>

          {/* Balance Chart vs Bitcoin */}
          <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <h3 className="text-white mb-4">{t('balanceChart', lang)}</h3>
            <CumulativeReturnsChart data={trader.pnlData} height={300} showBtcComparison={true} colorMode={colorMode} />
          </div>

          {/* Trade History */}
          <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <h3 className="text-white mb-4">{t('tradeHistory', lang)}</h3>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-white/20">
                    <TableHead className="text-white/70">{t('date', lang)}</TableHead>
                    <TableHead className="text-white/70">{t('type', lang)}</TableHead>
                    <TableHead className="text-white/70">{t('entry', lang)}</TableHead>
                    <TableHead className="text-white/70">{t('exit', lang)}</TableHead>
                    <TableHead className="text-white/70">{t('size', lang)}</TableHead>
                    <TableHead className="text-white/70">{t('pnl', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trader.trades.slice(0, 50).map((trade) => (
                    <TableRow key={trade.id} className="border-white/20">
                      <TableCell className="text-white text-sm">
                        {new Date(trade.timestamp).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN')}
                      </TableCell>
                      <TableCell>
                        <Badge className={
                          trade.type === 'long' 
                            ? 'bg-green-500/20 text-green-300 border-green-400/30'
                            : 'bg-red-500/20 text-red-300 border-red-400/30'
                        }>
                          {trade.type === 'long' ? t('long', lang) : t('short', lang)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-white text-sm">
                        ${trade.entry.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-white text-sm">
                        ${trade.exit.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-white text-sm">
                        ${trade.size.toLocaleString()}
                      </TableCell>
                      <TableCell className={getValueColor(trade.pnl, colorMode)}>
                        {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}