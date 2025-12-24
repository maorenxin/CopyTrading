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
