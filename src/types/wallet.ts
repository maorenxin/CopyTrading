export type WalletStatus = 'disconnected' | 'connecting' | 'connected' | 'unavailable' | 'error';

export interface WalletProvider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isOKXWallet?: boolean;
}

export interface WalletProviderInfo {
  provider: WalletProvider;
  name: 'OKX' | 'MetaMask' | 'Injected';
}
