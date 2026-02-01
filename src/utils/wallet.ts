import type { WalletProvider, WalletProviderInfo } from '../types/wallet';

const OKX_KEY = 'okxwallet';

function pickProviderFromList(providers: WalletProvider[]): WalletProviderInfo | null {
  const okx = providers.find((p) => p.isOkxWallet || p.isOKXWallet);
  if (okx) {
    return { provider: okx, name: 'OKX' };
  }
  const metamask = providers.find((p) => p.isMetaMask);
  if (metamask) {
    return { provider: metamask, name: 'MetaMask' };
  }
  return providers.length ? { provider: providers[0], name: 'Injected' } : null;
}

export function getInjectedProvider(): WalletProviderInfo | null {
  if (typeof window === 'undefined') return null;
  const anyWindow = window as unknown as Record<string, unknown>;

  const okxProvider = anyWindow[OKX_KEY] as WalletProvider | undefined;
  if (okxProvider) {
    return { provider: okxProvider, name: 'OKX' };
  }

  const ethereum = (anyWindow as any).ethereum as WalletProvider | undefined;
  if (!ethereum) return null;

  const providerList = (ethereum as any).providers as WalletProvider[] | undefined;
  if (providerList?.length) {
    return pickProviderFromList(providerList);
  }

  if (ethereum.isMetaMask) {
    return { provider: ethereum, name: 'MetaMask' };
  }

  return { provider: ethereum, name: 'Injected' };
}

export async function requestAccounts(provider: WalletProvider): Promise<string[]> {
  const result = await provider.request({ method: 'eth_requestAccounts' });
  return Array.isArray(result) ? (result as string[]) : [];
}

export async function getAccounts(provider: WalletProvider): Promise<string[]> {
  const result = await provider.request({ method: 'eth_accounts' });
  return Array.isArray(result) ? (result as string[]) : [];
}

/**
 * 请求钱包签名以触发用户确认。
 * @param provider - 钱包 provider。
 * @param account - 签名账户。
 * @param message - 签名消息。
 * @returns 签名字符串，失败时返回 null。
 */
export async function requestWalletSignature(
  provider: WalletProvider,
  account: string,
  message: string,
): Promise<string | null> {
  try {
    const signature = await provider.request({
      method: 'personal_sign',
      params: [message, account],
    });
    return typeof signature === 'string' ? signature : null;
  } catch {
    try {
      const signature = await provider.request({
        method: 'personal_sign',
        params: [account, message],
      });
      return typeof signature === 'string' ? signature : null;
    } catch {
      return null;
    }
  }
}

export function subscribeAccountsChanged(
  provider: WalletProvider,
  handler: (accounts: string[]) => void
): () => void {
  if (!provider.on) return () => undefined;

  const listener = (accounts: unknown) => {
    handler(Array.isArray(accounts) ? (accounts as string[]) : []);
  };

  provider.on('accountsChanged', listener);

  return () => {
    provider.removeListener?.('accountsChanged', listener);
  };
}

const USDC_CONTRACT = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_DECIMALS = 6;

/**
 * 获取连接钱包的首个地址。
 * @param provider - 钱包 provider。
 * @returns 钱包地址或空字符串。
 */
export async function getPrimaryAccount(provider: WalletProvider): Promise<string> {
  const accounts = await getAccounts(provider);
  return accounts[0] ?? '';
}

/**
 * 读取钱包 USDC 余额（默认 Arbitrum USDC）。
 * @param provider - 钱包 provider。
 * @param account - 钱包地址。
 * @returns USDC 余额，失败时返回 null。
 */
export async function fetchUsdcBalance(
  provider: WalletProvider,
  account: string,
): Promise<number | null> {
  if (!account) return null;
  const clean = account.toLowerCase().replace('0x', '').padStart(64, '0');
  const data = `0x70a08231${clean}`;
  try {
    const result = await provider.request({
      method: 'eth_call',
      params: [{ to: USDC_CONTRACT, data }, 'latest'],
    });
    if (typeof result !== 'string') return null;
    const raw = BigInt(result);
    const divisor = BigInt(10) ** BigInt(USDC_DECIMALS);
    const whole = raw / divisor;
    const fraction = raw % divisor;
    const value = Number(whole) + Number(fraction) / Number(divisor);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}
