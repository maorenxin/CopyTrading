import { ColorMode, Language, PortfolioPosition, PortfolioSummary, PnLDataPoint } from '../types/trader';
import { WalletConnect } from './WalletConnect';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ColorModeSwitcher } from './ColorModeSwitcher';
import { MobilePortfolioSheet } from './MobilePortfolioSheet';
import { PortfolioDialog } from './PortfolioDialog';
import { t } from '../utils/translations';

interface HeaderProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  portfolioSummary: PortfolioSummary;
  portfolioSeries: PnLDataPoint[];
  portfolioPositions: PortfolioPosition[];
  onCloseCopy: (positionId: string) => void;
  walletAddress?: string;
  onWalletAddressChange?: (address: string) => void;
}

/**
 * 顶部导航区块，负责语言与主题切换，并根据钱包状态展示入口。
 * @param props - Header 所需参数。
 * @returns Header 组件。
 */
export function Header({
  lang,
  onLanguageChange,
  colorMode,
  onColorModeChange,
  portfolioSummary,
  portfolioSeries,
  portfolioPositions,
  onCloseCopy,
  walletAddress,
  onWalletAddressChange,
}: HeaderProps) {
  const isWalletConnected = Boolean(walletAddress);

  return (
    <header className="sticky top-0 z-50 bg-[#1A0B2E]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-[1800px] mx-auto px-4 md:px-6 py-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl text-white mb-2">
              {t('platformTitle', lang)}
            </h1>
            <p className="text-gray-300">
              {t('platformSubtitle', lang)}
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 [&>*]:h-10">
            <ColorModeSwitcher currentMode={colorMode} onColorModeChange={onColorModeChange} />
            <LanguageSwitcher currentLang={lang} onLanguageChange={onLanguageChange} />
            {isWalletConnected && (
              <div className="hidden md:flex">
                <PortfolioDialog
                  lang={lang}
                  colorMode={colorMode}
                  summary={portfolioSummary}
                  series={portfolioSeries}
                  positions={portfolioPositions}
                  onCloseCopy={onCloseCopy}
                  walletAddress={walletAddress}
                />
              </div>
            )}
            {isWalletConnected && (
              <div className="md:hidden">
                <MobilePortfolioSheet
                  lang={lang}
                  colorMode={colorMode}
                  summary={portfolioSummary}
                  series={portfolioSeries}
                  positions={portfolioPositions}
                  onCloseCopy={onCloseCopy}
                  walletAddress={walletAddress}
                />
              </div>
            )}
            <WalletConnect lang={lang} onAddressChange={onWalletAddressChange} />
          </div>
        </div>
      </div>
    </header>
  );
}
