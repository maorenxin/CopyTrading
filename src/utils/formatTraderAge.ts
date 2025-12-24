import { Language } from '../types/trader';

/**
 * Format trader age in days
 * @param days - The trader age in days
 * @param lang - Language setting
 * @returns Formatted string like "17天" / "17d" for ≤30 days, "1.5月" / "1.5mo" for >30 days
 */
export function formatTraderAge(days: number, lang: Language): string {
  if (days <= 30) {
    // Display in days
    return lang === 'en' ? `${Math.round(days)}d` : `${Math.round(days)}天`;
  } else {
    // Display in months (days / 30)
    const months = days / 30;
    return lang === 'en' ? `${months.toFixed(1)}mo` : `${months.toFixed(1)}月`;
  }
}
