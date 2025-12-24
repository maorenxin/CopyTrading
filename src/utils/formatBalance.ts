/**
 * Format balance with dynamic units ($, K, M, B)
 * @param balance - The balance amount as a number
 * @returns Formatted string like "$435", "$3.4K", "$32.9M", "$98.3B"
 */
export function formatBalance(balance: number): string {
  const absBalance = Math.abs(balance);
  
  if (absBalance >= 1_000_000_000) {
    // Billions
    return `$${(balance / 1_000_000_000).toFixed(1)}B`;
  } else if (absBalance >= 1_000_000) {
    // Millions
    return `$${(balance / 1_000_000).toFixed(1)}M`;
  } else if (absBalance >= 1_000) {
    // Thousands
    return `$${(balance / 1_000).toFixed(1)}K`;
  } else {
    // Less than 1000
    return `$${Math.round(balance)}`;
  }
}
