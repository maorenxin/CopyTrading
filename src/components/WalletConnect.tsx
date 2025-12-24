import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Wallet } from 'lucide-react';
import { Language } from '../types/trader';
import { t } from '../utils/translations';
import { formatWalletAddress } from '../utils/formatWalletAddress';
import {
  getAccounts,
  getInjectedProvider,
  requestAccounts,
  subscribeAccountsChanged,
} from '../utils/wallet';
import type { WalletStatus, WalletProviderInfo } from '../types/wallet';

interface WalletConnectProps {
  lang: Language;
  web3Mock: boolean;
}

export function WalletConnect({ lang, web3Mock }: WalletConnectProps) {
  const [status, setStatus] = useState<WalletStatus>('disconnected');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const [providerInfo, setProviderInfo] = useState<WalletProviderInfo | null>(null);

  useEffect(() => {
    if (web3Mock) {
      setStatus('disconnected');
      return;
    }

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
        if (accounts[0]) {
          setAddress(accounts[0]);
          setStatus('connected');
          localStorage.setItem('wallet_address', accounts[0]);
        } else if (cachedAddress) {
          setAddress(cachedAddress);
          setStatus('connected');
        } else {
          setAddress('');
          setStatus('disconnected');
          localStorage.removeItem('wallet_address');
        }
      } catch {
        setStatus('error');
      }
    };

    syncAccounts();
    cleanup = subscribeAccountsChanged(info.provider, (accounts) => {
      if (accounts[0]) {
        setAddress(accounts[0]);
        setStatus('connected');
        localStorage.setItem('wallet_address', accounts[0]);
      } else {
        setAddress('');
        setStatus('disconnected');
        localStorage.removeItem('wallet_address');
      }
    });

    return () => cleanup();
  }, [web3Mock]);

  const connectWallet = async () => {
    if (web3Mock) {
      const mockAddress = `0x${Math.random().toString(16).slice(2, 42)}`;
      setAddress(mockAddress);
      setStatus('connected');
      localStorage.setItem('wallet_address', mockAddress);
      return;
    }

    if (!providerInfo) {
      setStatus('unavailable');
      return;
    }

    setError('');
    setStatus('connecting');

    try {
      const accounts = await requestAccounts(providerInfo.provider);
      if (accounts[0]) {
        setAddress(accounts[0]);
        setStatus('connected');
        localStorage.setItem('wallet_address', accounts[0]);
      } else {
        setStatus('disconnected');
      }
    } catch {
      setError(t('connectFailed', lang));
      setStatus('error');
    }
  };

  const disconnectWallet = () => {
    setAddress('');
    setStatus('disconnected');
    localStorage.removeItem('wallet_address');
  };

  if (status === 'connected') {
    return (
      <div className="flex items-center gap-2">
        <div className="px-4 h-10 flex items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-lg text-white text-sm">
          {formatWalletAddress(address)}
        </div>
        <Button
          onClick={disconnectWallet}
          variant="outline"
          className="h-10 bg-white/10 backdrop-blur-md border-white/20 text-white hover:bg-white/20"
          style={{ backdropFilter: 'blur(10px)' }}
        >
          {t('disconnect', lang)}
        </Button>
      </div>
    );
  }

  if (!web3Mock && status === 'unavailable') {
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
