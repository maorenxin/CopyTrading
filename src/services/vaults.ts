import type {
  VaultDepositor,
  VaultDetail,
  VaultListResponse,
  VaultPosition,
  VaultTrade,
} from '../types/vault';

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.set(key, String(value));
  });
  const query = search.toString();
  return query ? `?${query}` : '';
};

export async function fetchVaults(options?: {
  limit?: number;
  cursor?: string | null;
}): Promise<VaultListResponse> {
  const query = buildQuery({ limit: options?.limit, cursor: options?.cursor ?? undefined });
  const response = await fetch(`/api/vaults${query}`);
  if (!response.ok) {
    throw new Error('Vault 列表加载失败');
  }
  return response.json();
}

export async function fetchVaultDetail(vaultAddress: string): Promise<VaultDetail> {
  const response = await fetch(`/api/vaults/${vaultAddress}`);
  if (!response.ok) {
    throw new Error('Vault 详情加载失败');
  }
  return response.json();
}

export async function fetchVaultTrades(vaultAddress: string, limit = 50): Promise<VaultTrade[]> {
  const query = buildQuery({ limit });
  const response = await fetch(`/api/vaults/${vaultAddress}/trades${query}`);
  if (!response.ok) {
    throw new Error('Vault 交易加载失败');
  }
  const data = await response.json();
  return data.items ?? [];
}

export async function fetchVaultPositions(vaultAddress: string): Promise<VaultPosition[]> {
  const response = await fetch(`/api/vaults/${vaultAddress}/positions`);
  if (!response.ok) {
    throw new Error('Vault 持仓加载失败');
  }
  const data = await response.json();
  return data.items ?? [];
}

export async function fetchVaultDepositors(vaultAddress: string): Promise<VaultDepositor[]> {
  const response = await fetch(`/api/vaults/${vaultAddress}/depositors`);
  if (!response.ok) {
    throw new Error('Vault 存款人加载失败');
  }
  const data = await response.json();
  return data.items ?? [];
}
