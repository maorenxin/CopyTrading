import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { Button } from './ui/button';
import { ColorMode, Language, PortfolioPosition, PortfolioSummary, PnLDataPoint } from '../types/trader';
import { t } from '../utils/translations';
import { PortfolioOverview } from './PortfolioOverview';

interface MobilePortfolioSheetProps {
  lang: Language;
  colorMode: ColorMode;
  summary: PortfolioSummary;
  series: PnLDataPoint[];
  positions: PortfolioPosition[];
  onCopyTrade: (trader: PortfolioPosition['trader']) => void;
}

/**
 * 移动端资产概览抽屉。
 * @param props - 组件参数。
 * @returns MobilePortfolioSheet 组件。
 */
export function MobilePortfolioSheet({
  lang,
  colorMode,
  summary,
  series,
  positions,
  onCopyTrade,
}: MobilePortfolioSheetProps) {
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

        <div className="mt-6">
          <PortfolioOverview
            lang={lang}
            colorMode={colorMode}
            summary={summary}
            series={series}
            positions={positions}
            onCopyTrade={onCopyTrade}
            layout="mobile"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
