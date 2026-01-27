import { Trade } from '../types/trader';

export async function fetchVaultTrades(vaultAddress: string, limit = 50): Promise<{ items: Trade[] }> {
  const response = await fetch(`/api/vaults/${vaultAddress}/trades?limit=${limit}`);
  if (!response.ok) {
    throw new Error('交易历史加载失败');
  }
  return response.json();
}