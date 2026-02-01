import { Button } from './ui/button';
import { ArrowUpDown } from 'lucide-react';
import { ColorMode } from '../types/trader';
import { getPositiveColor, getNegativeColor } from '../utils/colorMode';

interface ColorModeSwitcherProps {
  currentMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
}

export function ColorModeSwitcher({ currentMode, onColorModeChange }: ColorModeSwitcherProps) {
  const toggleColorMode = () => {
    const newMode = currentMode === 'standard' ? 'inverted' : 'standard';
    onColorModeChange(newMode);
  };

  const upColor = getPositiveColor(currentMode);
  const downColor = getNegativeColor(currentMode);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleColorMode}
      className="border-white/20 bg-white/5 hover:bg-white/10 transition-colors text-[rgb(255,255,255)] flex items-center justify-center h-10 px-3"
      title={currentMode === 'standard' ? 'Up=Green, Down=Red' : 'Up=Red, Down=Green'}
    >
      <span className="text-xs flex items-center gap-1">
        <span className={upColor}>↑</span>
        <span className="text-white">/</span>
        <span className={downColor}>↓</span>
      </span>
    </Button>
  );
}
