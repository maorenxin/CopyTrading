import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Trader, Language } from '../types/trader';
import { t } from '../utils/translations';
import { formatTraderAge } from '../utils/formatTraderAge';
import { DollarSign, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import { formatSignedPercent } from '../utils/formatPercent';
import {
  fetchUsdcBalance,
  getInjectedProvider,
  getPrimaryAccount,
  requestAccounts,
  requestWalletSignature,
} from '../utils/wallet';

interface CopyTradeModalProps {
  trader: Trader | null;
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onConfirmCopy?: (trader: Trader, amount: number) => void;
}

/**
 * 跟单确认弹窗。
 * @param props - 弹窗参数。
 * @returns CopyTradeModal 组件。
 */
export function CopyTradeModal({ trader, isOpen, onClose, lang, onConfirmCopy }: CopyTradeModalProps) {
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState('100');
  const [copyInstantly, setCopyInstantly] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletAddress, setWalletAddress] = useState('');
  const [balanceLoading, setBalanceLoading] = useState(false);

  const maxBalance = useMemo(() => {
    if (walletBalance === null || !Number.isFinite(walletBalance)) return 0;
    return Math.max(0, walletBalance);
  }, [walletBalance]);

  useEffect(() => {
    if (!isOpen) {
      setIsSubmitting(false);
      return;
    }
    setCopyInstantly(true);

    let active = true;

    const loadBalance = async () => {
      const providerInfo = getInjectedProvider();
      if (!providerInfo) {
        if (active) {
          setWalletAddress('');
          setWalletBalance(null);
          setBalanceLoading(false);
        }
        return;
      }

      setBalanceLoading(true);
      try {
        const account = await getPrimaryAccount(providerInfo.provider);
        if (!active) return;
        setWalletAddress(account);
        if (!account) {
          setWalletBalance(null);
          setBalanceLoading(false);
          return;
        }
        const balance = await fetchUsdcBalance(providerInfo.provider, account);
        if (!active) return;
        setWalletBalance(balance);
      } finally {
        if (active) setBalanceLoading(false);
      }
    };

    loadBalance();

    return () => {
      active = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (walletBalance === null || !Number.isFinite(walletBalance)) return;
    if (walletBalance > 0 && amount > walletBalance) {
      setAmount(walletBalance);
      setCustomAmount(walletBalance.toString());
    }
  }, [walletBalance, amount]);

  if (!trader) return null;

  const presetAmounts = [100, 500, 1000];
  const returnColor = trader.allTimeReturn >= 0 ? 'text-green-400' : 'text-red-400';
  const ReturnIcon = trader.allTimeReturn >= 0 ? TrendingUp : TrendingDown;

  /**
   * 为异步流程加上超时保护。
   * @param promise - 原始 Promise。
   * @param ms - 超时时间毫秒。
   * @returns Promise 结果或 null。
   */
  const withTimeout = async <T,>(promise: Promise<T>, ms: number): Promise<T | null> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await new Promise<T | null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
        promise
          .then((value) => resolve(value))
          .catch(() => resolve(null));
      });
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  };

  /**
   * 拉起钱包完成交互签名。
   * @returns 是否完成签名。
   */
  const requestWalletFlow = async () => {
    const providerInfo = getInjectedProvider();
    if (!providerInfo) {
      toast.error(lang === 'en' ? 'Wallet not detected' : '未检测到钱包');
      return false;
    }
    const accounts = await requestAccounts(providerInfo.provider);
    const account = accounts[0];
    if (!account) {
      toast.error(lang === 'en' ? 'Wallet connection failed' : '钱包连接失败');
      return false;
    }
    const modeLabel = copyInstantly
      ? (lang === 'en' ? 'Instant market copy' : '立刻市价复制仓位')
      : (lang === 'en' ? 'Follow future trades only' : '仅跟随后续交易');
    const message = lang === 'en'
      ? `Confirm copy trade for ${trader.address} with $${amount} USDC.\nMode: ${modeLabel}`
      : `确认跟单 ${trader.address}，金额 $${amount} USDC。\n模式：${modeLabel}`;
    const signature = await withTimeout(
      requestWalletSignature(providerInfo.provider, account, message),
      12000,
    );
    if (!signature) {
      toast.error(lang === 'en' ? 'Wallet signature canceled' : '已取消钱包签名');
      return false;
    }
    return true;
  };

  /**
   * 处理跟单确认。
   * @returns 异步处理结果。
   */
  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await requestWalletFlow();
      if (!ok) return;
      toast.success(
        lang === 'en'
          ? `Copy plan created for $${amount} USDC`
          : `已创建 $${amount} USDC 跟单计划`,
        {
          description: lang === 'en'
            ? `Mode: ${copyInstantly ? 'Instant market copy' : 'Follow future trades only'}`
            : `模式：${copyInstantly ? '立刻市价复制仓位' : '仅跟随后续交易'}`,
        },
      );
      if (copyInstantly) {
        onConfirmCopy?.(trader, amount);
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePresetClick = (value: number) => {
    setAmount(value);
    setCustomAmount(value.toString());
  };

  const handleMaxClick = () => {
    setAmount(maxBalance);
    setCustomAmount(maxBalance.toString());
  };

  const handleCustomChange = (value: string) => {
    setCustomAmount(value);
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue > 0) {
      setAmount(numValue);
    }
  };

  /**
   * 切换立即复制仓位选项。
   */
  const toggleCopyInstantly = () => {
    setCopyInstantly((prev) => !prev);
  };

  const availableBalanceLabel = balanceLoading
    ? lang === 'en'
      ? 'Loading wallet balance...'
      : '正在读取钱包余额...'
    : walletAddress
      ? lang === 'en'
        ? `Available balance: $${maxBalance.toLocaleString()} USDC`
        : `可用余额: $${maxBalance.toLocaleString()} USDC`
      : lang === 'en'
        ? 'Connect wallet to view USDC balance'
        : '连接钱包后显示 USDC 余额';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent 
        className="bg-[#1A0B2E] border-white/20 text-white max-w-md"
        style={{ 
          backdropFilter: 'blur(10px)',
          background: 'rgba(26, 11, 46, 0.95)'
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-white text-xl">
            {t('copyTradeTitle', lang)}
          </DialogTitle>
          <DialogDescription className="text-white/50 text-sm">
            {t('copyTradeDescription', lang)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Trader Info */}
          <div className="p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-lg">
            <p className="text-white/70 text-sm mb-1">{t('traderAddress', lang)}</p>
            <p className="text-white font-mono text-sm truncate mb-3">
              {trader.address}
            </p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white/70 text-xs">{t('allTimeReturnLabel', lang)}</p>
                <div className="flex items-center gap-1">
                  <ReturnIcon className={`w-4 h-4 ${returnColor}`} />
                  <p className={returnColor}>{formatSignedPercent(trader.allTimeReturn, 1)}</p>
                </div>
              </div>
              <div>
                <p className="text-white/70 text-xs">{t('traderAgeLabel', lang)}</p>
                <p className="text-white">{formatTraderAge(trader.traderAgeDays, lang)}</p>
              </div>
              <div>
                <p className="text-white/70 text-xs">{t('followers', lang)}</p>
                <p className="text-white">{trader.followerCount}</p>
              </div>
            </div>
          </div>

          {/* Investment Amount */}
          <div>
            <label htmlFor="copyTradeAmount" className="text-white mb-2 block">
              {t('investmentAmount', lang)}
            </label>
            
            {/* Preset Amounts */}
            <div className="grid grid-cols-4 gap-2 mb-3">
              {presetAmounts.map((value) => (
                <Button
                  key={value}
                  onClick={() => handlePresetClick(value)}
                  variant="outline"
                  className={`${
                    amount === value
                      ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-600'
                      : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                  }`}
                >
                  ${value}
                </Button>
              ))}
              <Button
                onClick={handleMaxClick}
                variant="outline"
                className={`${
                  amount === maxBalance
                    ? 'bg-blue-500 border-blue-400 text-white hover:bg-blue-600'
                    : 'bg-white/10 border-white/20 text-white hover:bg-white/20'
                }`}
                disabled={maxBalance <= 0}
              >
                {t('maxBalance', lang)}
              </Button>
            </div>

            {/* Custom Amount Input */}
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/50 w-4 h-4" />
              <Input
                id="copyTradeAmount"
                name="copyTradeAmount"
                type="number"
                value={customAmount}
                onChange={(e) => handleCustomChange(e.target.value)}
                className="pl-10 bg-white/10 border-white/20 text-white placeholder-white/50"
                placeholder={t('selectAmount', lang)}
                min="1"
                max={maxBalance > 0 ? maxBalance : undefined}
              />
            </div>
            
            <p className="text-white/50 text-xs mt-2">{availableBalanceLabel}</p>
          </div>

          <div
            role="button"
            tabIndex={0}
            onClick={toggleCopyInstantly}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleCopyInstantly();
              }
            }}
            className={`p-4 rounded-lg border space-y-3 transition-colors cursor-pointer ${
              copyInstantly
                ? 'bg-blue-500/10 border-blue-400/40'
                : 'bg-white/10 border-white/20'
            }`}
          >
            <div className="flex items-center gap-3">
              <Checkbox
                checked={copyInstantly}
                onCheckedChange={(value: boolean | 'indeterminate') =>
                  setCopyInstantly(Boolean(value))
                }
                onClick={(event) => event.stopPropagation()}
                className="border-white/50"
              />
              <span className="text-white text-sm">
                {lang === 'en' ? 'Copy positions at market now' : '立刻市价复制仓位'}
              </span>
            </div>
            <p className="text-white/50 text-xs">
              {lang === 'en'
                ? copyInstantly
                  ? 'We will open your wallet to confirm the contract interaction.'
                  : 'You will only follow new trades after confirmation.'
                : copyInstantly
                  ? '点击交易后将拉起钱包进行合约确认。'
                  : '确认后仅跟随后续交易，不会立刻建仓。'}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
            >
              {t('cancel', lang)}
            </Button>
            <Button
              onClick={handleConfirm}
              className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
              disabled={isSubmitting}
            >
              {isSubmitting ? (lang === 'en' ? 'Opening wallet...' : '拉起钱包中...') : t('confirmInvestment', lang)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
