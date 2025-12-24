import { Language } from '../types/trader';
import { Button } from './ui/button';
import { Globe } from 'lucide-react';

interface LanguageSwitcherProps {
  currentLang: Language;
  onLanguageChange: (lang: Language) => void;
}

export function LanguageSwitcher({ currentLang, onLanguageChange }: LanguageSwitcherProps) {
  const toggleLanguage = () => {
    const newLang = currentLang === 'en' ? 'cn' : 'en';
    onLanguageChange(newLang);
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleLanguage}
      className="border-white/20 bg-white/5 hover:bg-white/10 transition-colors text-[rgb(255,255,255)] flex items-center justify-center gap-2 h-10"
      title={currentLang === 'en' ? 'Switch to Chinese' : '切换到英文'}
    >
      <Globe className="w-4 h-4 text-white" />
      <span className="text-sm text-white">{currentLang === 'en' ? 'EN' : '中文'}</span>
    </Button>
  );
}