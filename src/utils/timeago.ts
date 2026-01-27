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

export function getLastTradeCategory(timestamp: number, lang: Language): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  const labels = {
    en: {
      day: '1 day',
      week: '7 days',
      month: '30 days',
      quarter: '90 days',
      year: '1 year',
      long: '1+ year',
    },
    cn: {
      day: '1天',
      week: '7天',
      month: '30天',
      quarter: '90天',
      year: '1年',
      long: '1年以上',
    },
  };

  if (!Number.isFinite(days) || days < 0) {
    return lang === 'en' ? '--' : '--';
  }
  if (days <= 1) return labels[lang].day;
  if (days <= 7) return labels[lang].week;
  if (days <= 30) return labels[lang].month;
  if (days <= 90) return labels[lang].quarter;
  if (days <= 365) return labels[lang].year;
  return labels[lang].long;
}
