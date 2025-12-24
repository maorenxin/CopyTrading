import { Language, ColorMode } from '../types/trader';
import { WalletConnect } from './WalletConnect';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ColorModeSwitcher } from './ColorModeSwitcher';
import { MobilePortfolioSheet } from './MobilePortfolioSheet';
import { t } from '../utils/translations';

interface HeaderProps {
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
}

export function Header({ lang, onLanguageChange, colorMode, onColorModeChange }: HeaderProps) {
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
            <div className="md:hidden">
              <MobilePortfolioSheet lang={lang} />
            </div>
            <WalletConnect lang={lang} />
          </div>
        </div>
      </div>
    </header>
  );
}