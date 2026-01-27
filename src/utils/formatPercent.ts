/**
 * 格式化百分比，包含符号。
 * @param value - 原始数值。
 * @param digits - 小数位数。
 * @returns 格式化后的百分比字符串。
 */
export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${value < 0 ? '-' : ''}>1,000,000%`;
  }
  return `${value < 0 ? '-' : ''}${abs.toFixed(digits)}%`;
}

/**
 * 格式化百分比，不带符号。
 * @param value - 原始数值。
 * @param digits - 小数位数。
 * @returns 格式化后的百分比字符串。
 */
export function formatPercentAbs(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '--';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return '>1,000,000%';
  }
  return `${abs.toFixed(digits)}%`;
}

/**
 * 格式化百分比，带正负号。
 * @param value - 原始数值。
 * @param digits - 小数位数。
 * @returns 格式化后的百分比字符串。
 */
export function formatSignedPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return '--';
  const prefix = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${prefix}${formatPercentAbs(value, digits)}`;
}
