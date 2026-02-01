import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
import { Button } from './ui/button';
import { ColorMode, Language, PortfolioPosition, PortfolioSummary, PnLDataPoint } from '../types/trader';
import { t } from '../utils/translations';
import { PortfolioOverview } from './PortfolioOverview';
import { formatWalletAddress } from '../utils/formatWalletAddress';

interface MobilePortfolioSheetProps {
  lang: Language;
  colorMode: ColorMode;
  summary: PortfolioSummary;
  series: PnLDataPoint[];
  positions: PortfolioPosition[];
  onCloseCopy?: (positionId: string) => void;
  walletAddress?: string;
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
  onCloseCopy,
  walletAddress,
}: MobilePortfolioSheetProps) {
  const labelAddress = walletAddress ? ` (${formatWalletAddress(walletAddress)})` : '';
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="h-10 bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20 hover:text-white cursor-pointer"
        >
          {t('myPortfolio', lang)}{labelAddress}
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
            {t('myPortfolio', lang)}{labelAddress}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          <PortfolioOverview
            lang={lang}
            colorMode={colorMode}
            summary={summary}
            series={series}
            positions={positions}
            onCloseCopy={onCloseCopy}
            layout="mobile"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
