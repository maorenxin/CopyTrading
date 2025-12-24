import { Language } from '../types/trader';
import { t } from './translations';

export function getTimeAgo(timestamp: number, lang: Language): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (minutes < 60) {
    return `${minutes} ${t('minutesAgo', lang)}`;
  } else if (hours < 24) {
    return `${hours} ${t('hoursAgo', lang)}`;
  } else if (days < 7) {
    return `${days} ${t('daysAgo', lang)}`;
  } else if (weeks < 4) {
    return `${weeks} ${t('weeksAgo', lang)}`;
  } else if (months < 12) {
    return `${months} ${t('monthsAgo', lang)}`;
  } else {
    return `${years} ${t('yearsAgo', lang)}`;
  }
}

export function getLastTradeCategory(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days <= 1) return '1 day';
  if (days <= 7) return '7 days';
  if (days <= 30) return '30 days';
  if (days <= 90) return '90 days';
  if (days <= 365) return '1 year';
  return '1+ year';
}
