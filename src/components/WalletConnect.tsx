import { useState } from 'react';
import { Button } from './ui/button';
import { Wallet } from 'lucide-react';
import { Language } from '../types/trader';
import { t } from '../utils/translations';

interface WalletConnectProps {
  lang: Language;
}

export function WalletConnect({ lang }: WalletConnectProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [address, setAddress] = useState('');

  const connectWallet = async () => {
    // Mock wallet connection
    // In production, this would integrate with Web3 wallet like MetaMask
    const mockAddress = '0x' + Math.random().toString(16).substring(2, 42);
    setAddress(mockAddress);
    setIsConnected(true);
  };

  const disconnectWallet = () => {
    setAddress('');
    setIsConnected(false);
  };

  if (isConnected) {
    return (
      <div className="flex items-center gap-2">
        <div className="px-4 h-10 flex items-center bg-white/10 backdrop-blur-md border border-white/20 rounded-lg text-white text-sm">
          {address.substring(0, 6)}...{address.substring(address.length - 4)}
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

  return (
    <Button
      onClick={connectWallet}
      className="h-10 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
    >
      <Wallet className="w-4 h-4 mr-2" />
      {t('connectWallet', lang)}
    </Button>
  );
}