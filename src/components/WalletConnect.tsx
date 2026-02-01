import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Wallet } from 'lucide-react';
import { Language } from '../types/trader';
import { t } from '../utils/translations';
import {
  getAccounts,
  getInjectedProvider,
  requestAccounts,
  requestWalletSignature,
  subscribeAccountsChanged,
} from '../utils/wallet';
import type { WalletStatus, WalletProviderInfo } from '../types/wallet';

const REAUTH_FLAG_KEY = 'wallet_force_reauth';

interface WalletConnectProps {
  lang: Language;
  onAddressChange?: (address: string) => void;
}

/**
 * 钱包连接按钮与状态展示。
 * @param props - 钱包组件参数。
 * @returns WalletConnect 组件。
 */
export function WalletConnect({ lang, onAddressChange }: WalletConnectProps) {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [providerInfo, setProviderInfo] = useState<WalletProviderInfo | null>(null);

  /**
   * 判断是否需要重新授权。
   * @returns 是否需要重新授权。
   */
  const needsReauth = () => localStorage.getItem(REAUTH_FLAG_KEY) === '1';

  /**
   * 生成钱包重新授权签名的提示文案。
   * @returns 签名文案。
   */
  const buildReauthMessage = () => `CopyTrading login confirmation\nTime: ${new Date().toISOString()}`;

  useEffect(() => {
    const info = getInjectedProvider();
    setProviderInfo(info);
    if (!info) {
      setStatus('unavailable');
      return;
    }

    let cleanup: () => void = () => { };

    const syncAccounts = async () => {
      const cachedAddress = localStorage.getItem('wallet_address') ?? '';
      try {
        const accounts = await getAccounts(info.provider);
        if (needsReauth()) {
          setAddress('');
          setStatus('disconnected');
          localStorage.removeItem('wallet_address');
          onAddressChange?.('');
          return;
        }
        if (accounts[0]) {
          setAddress(accounts[0]);
          setStatus('connected');
          localStorage.setItem('wallet_address', accounts[0]);
          onAddressChange?.(accounts[0]);
        } else if (cachedAddress) {
          setAddress(cachedAddress);
          setStatus('connected');
          onAddressChange?.(cachedAddress);
        } else {
          setAddress('');
          setStatus('disconnected');
          localStorage.removeItem('wallet_address');
          onAddressChange?.('');
        }
      } catch {
        setStatus('error');
      }
    };

    syncAccounts();
    cleanup = subscribeAccountsChanged(info.provider, (accounts) => {
      if (needsReauth()) {
        setAddress('');
        setStatus('disconnected');
        localStorage.removeItem('wallet_address');
        onAddressChange?.('');
        return;
      }
      if (accounts[0]) {
        setAddress(accounts[0]);
        setStatus('connected');
        localStorage.setItem('wallet_address', accounts[0]);
        onAddressChange?.(accounts[0]);
      } else {
        setAddress('');
        setStatus('disconnected');
        localStorage.setItem(REAUTH_FLAG_KEY, '1');
        localStorage.removeItem('wallet_address');
        onAddressChange?.('');
      }
    });

    return () => cleanup();
  }, []);

  const connectWallet = async () => {
    if (!providerInfo) {
      setStatus('unavailable');
      return;
    }

    setError('');
    setStatus('connecting');

    try {
      const accounts = await requestAccounts(providerInfo.provider);
      if (accounts[0]) {
        if (needsReauth()) {
          const signature = await requestWalletSignature(
            providerInfo.provider,
            accounts[0],
            buildReauthMessage(),
          );
          if (!signature) {
            setStatus('error');
            setError(t('connectFailed', lang));
            setAddress('');
            localStorage.removeItem('wallet_address');
            onAddressChange?.('');
            return;
          }
          localStorage.removeItem(REAUTH_FLAG_KEY);
        }
        setAddress(accounts[0]);
        setStatus('connected');
        localStorage.setItem('wallet_address', accounts[0]);
        onAddressChange?.(accounts[0]);
      } else {
        setStatus('disconnected');
        onAddressChange?.('');
      }
    } catch {
      setError(t('connectFailed', lang));
      setStatus('error');
    }
  };

  const disconnectWallet = () => {
    setAddress('');
    setStatus('disconnected');
    localStorage.setItem(REAUTH_FLAG_KEY, '1');
    localStorage.removeItem('wallet_address');
    onAddressChange?.('');
  };

  if (status === 'connected') {
    return (
      <Button
        onClick={disconnectWallet}
        variant="outline"
        className="h-10 bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20 cursor-pointer"
        style={{ backdropFilter: 'blur(10px)' }}
      >
        {t('disconnect', lang)}
      </Button>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          onClick={connectWallet}
          className="h-10 bg-white/10 border border-white/20 text-white"
          style={{ backdropFilter: 'blur(10px)' }}
        >
          <Wallet className="w-4 h-4 mr-2" />
          {t('installWallet', lang)}
        </Button>
        <span className="text-xs text-white/60">{t('walletUnavailable', lang)}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        onClick={connectWallet}
        className="h-10 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
      >
        <Wallet className="w-4 h-4 mr-2" />
        {status === 'connecting' ? t('connecting', lang) : t('connectWallet', lang)}
      </Button>
      {error && <span className="text-xs text-red-300">{error}</span>}
      {status === 'error' && !error && (
        <span className="text-xs text-red-300">{t('connectFailed', lang)}</span>
      )}
    </div>
  );
}
