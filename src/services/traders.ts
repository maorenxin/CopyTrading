import type { Trader } from '../types/trader';

export async function fetchTraders(): Promise<Trader[]> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/traders.json`);
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}
