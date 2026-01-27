import { useState } from 'react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { ColorMode, Language, PortfolioPosition, PortfolioSummary, PnLDataPoint } from '../types/trader';
import { t } from '../utils/translations';
import { PortfolioOverview } from './PortfolioOverview';

interface PortfolioDialogProps {
  lang: Language;
  colorMode: ColorMode;
  summary: PortfolioSummary;
  series: PnLDataPoint[];
  positions: PortfolioPosition[];
  onCopyTrade: (trader: PortfolioPosition['trader']) => void;
}

/**
 * 桌面端资产组合弹窗。
 * @param props - 组件参数。
 * @returns PortfolioDialog 组件。
 */
export function PortfolioDialog({
  lang,
  colorMode,
  summary,
  series,
  positions,
  onCopyTrade,
}: PortfolioDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20"
        >
          {t('myPortfolio', lang)}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="bg-[#1A0B2E] border-white/20 text-white max-w-6xl w-[96vw] max-h-[88vh] overflow-y-auto [&_[data-slot=dialog-close]]:text-white/80 [&_[data-slot=dialog-close]]:hover:text-white"
        style={{
          backdropFilter: 'blur(10px)',
          background: 'rgba(26, 11, 46, 0.96)',
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-white">{t('myPortfolio', lang)}</DialogTitle>
          <DialogDescription className="text-white/60">
            {lang === 'en'
              ? 'Review your portfolio, then tap a copy button to place a trade. Close anytime with the top-right icon or below.'
              : '查看组合概览，点击列表里的跟单即可下单，右上角或下方按钮可退出。'}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <PortfolioOverview
            lang={lang}
            colorMode={colorMode}
            summary={summary}
            series={series}
            positions={positions}
            onCopyTrade={onCopyTrade}
            layout="desktop"
          />
        </div>
        <div className="mt-6 flex justify-end">
          <DialogClose asChild>
            <Button
              variant="outline"
              className="bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              {lang === 'en' ? 'Close' : '关闭'}
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
