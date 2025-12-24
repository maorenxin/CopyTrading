import { ColorMode } from '../types/trader';

/**
 * Get the appropriate color class for positive/upward values based on color mode
 * @param colorMode - 'standard' (up=green) or 'inverted' (up=red)
 * @returns Tailwind CSS color class
 */
export function getPositiveColor(colorMode: ColorMode): string {
  return colorMode === 'standard' ? 'text-green-400' : 'text-red-400';
}

/**
 * Get the appropriate color class for negative/downward values based on color mode
 * @param colorMode - 'standard' (down=red) or 'inverted' (down=green)
 * @returns Tailwind CSS color class
 */
export function getNegativeColor(colorMode: ColorMode): string {
  return colorMode === 'standard' ? 'text-red-400' : 'text-green-400';
}

/**
 * Get the appropriate color class based on value and color mode
 * @param value - The numeric value to evaluate
 * @param colorMode - 'standard' or 'inverted'
 * @returns Tailwind CSS color class
 */
export function getValueColor(value: number, colorMode: ColorMode): string {
  return value >= 0 ? getPositiveColor(colorMode) : getNegativeColor(colorMode);
}

/**
 * Get chart stroke color for positive values
 */
export function getPositiveStrokeColor(colorMode: ColorMode): string {
  return colorMode === 'standard' ? '#22c55e' : '#ef4444';
}

/**
 * Get chart stroke color for negative values
 */
export function getNegativeStrokeColor(colorMode: ColorMode): string {
  return colorMode === 'standard' ? '#ef4444' : '#22c55e';
}
