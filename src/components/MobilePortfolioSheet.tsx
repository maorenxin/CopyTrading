import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { TrendingUp, DollarSign, Target, Users } from 'lucide-react';
import { Language } from '../types/trader';
import { t } from '../utils/translations';
import { PnLChart } from './PnLChart';

interface MobilePortfolioSheetProps {
  lang: Language;
}

export function MobilePortfolioSheet({ lang }: MobilePortfolioSheetProps) {
  // Mock portfolio data
  const mockPnlData = Array.from({ length: 30 }, (_, i) => ({
    timestamp: Date.now() - (29 - i) * 24 * 60 * 60 * 1000,
    pnl: 5000 + Math.random() * 2000 + i * 50
  }));

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20"
        >
          {t('myPortfolio', lang)}
        </Button>
      </SheetTrigger>
      <SheetContent 
        side="right"
        className="bg-[#1A0B2E] border-white/20 text-white w-full sm:w-[400px] overflow-y-auto"
        style={{ 
          backdropFilter: 'blur(10px)',
          background: 'rgba(26, 11, 46, 0.95)'
        }}
      >
        <SheetHeader>
          <SheetTitle className="text-white">
            {t('myPortfolio', lang)}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {/* Portfolio Value */}
          <Card className="p-4 bg-white/10 backdrop-blur-md border-white/20">
            <p className="text-white/70 text-sm mb-1">
              {lang === 'en' ? 'Total Portfolio Value' : '投资组合总值'}
            </p>
            <p className="text-3xl text-white mb-2">$7,542.50</p>
            <div className="flex items-center gap-1 text-green-400 text-sm">
              <TrendingUp className="w-4 h-4" />
              <span>+12.5% (30d)</span>
            </div>
          </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-3 bg-white/10 backdrop-blur-md border-white/20">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-blue-400" />
                <p className="text-white/70 text-xs">
                  {lang === 'en' ? 'Active Copies' : '活跃跟单'}
                </p>
              </div>
              <p className="text-xl text-white">3</p>
            </Card>

            <Card className="p-3 bg-white/10 backdrop-blur-md border-white/20">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-green-400" />
                <p className="text-white/70 text-xs">
                  {lang === 'en' ? 'Total Profit' : '总收益'}
                </p>
              </div>
              <p className="text-xl text-green-400">+$542.50</p>
            </Card>
          </div>

          {/* Performance Chart */}
          <Card className="p-4 bg-white/10 backdrop-blur-md border-white/20">
            <p className="text-white mb-3">
              {lang === 'en' ? '30-Day Performance' : '30天绩效'}
            </p>
            <PnLChart data={mockPnlData} height={150} />
          </Card>

          {/* Active Positions */}
          <div>
            <h3 className="text-white mb-3">
              {lang === 'en' ? 'Active Positions' : '活跃头寸'}
            </h3>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="p-3 bg-white/10 backdrop-blur-md border-white/20">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="text-white text-sm font-mono">
                        0x742d35...f0bEb
                      </p>
                      <p className="text-white/70 text-xs">
                        $1,000 USDC
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-green-400 text-sm">+15.2%</p>
                      <p className="text-white/70 text-xs">+$152.00</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
