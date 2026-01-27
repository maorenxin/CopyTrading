import { useState } from 'react';
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
import { getInjectedProvider, requestAccounts, requestWalletSignature } from '../utils/wallet';

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
  const maxBalance = Math.max(0, trader?.balance ?? 0);

  if (!trader) return null;

  const presetAmounts = [100, 500, 1000];
  const returnColor = trader.allTimeReturn >= 0 ? 'text-green-400' : 'text-red-400';
  const ReturnIcon = trader.allTimeReturn >= 0 ? TrendingUp : TrendingDown;

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
    const message = lang === 'en'
      ? `Confirm copy trade for ${trader.address} with $${amount} USDC.`
      : `确认跟单 ${trader.address}，金额 $${amount} USDC。`;
    const signature = await requestWalletSignature(providerInfo.provider, account, message);
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
          ? `Trade submitted with $${amount} USDC`
          : `已提交 $${amount} USDC 跟单`,
        {
          description: lang === 'en'
            ? `Following trader ${trader.address.substring(0, 8)}...`
            : `跟随交易者 ${trader.address.substring(0, 8)}...`,
        },
      );
      onConfirmCopy?.(trader, amount);
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
                max={maxBalance}
              />
            </div>
            
            <p className="text-white/50 text-xs mt-2">
              {lang === 'en' 
                ? `Available balance: $${maxBalance.toLocaleString()} USDC`
                : `可用余额: $${maxBalance.toLocaleString()} USDC`
              }
            </p>
          </div>

          <div className="p-4 bg-white/10 border border-white/20 rounded-lg space-y-3">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={copyInstantly}
                onCheckedChange={(value: boolean | 'indeterminate') =>
                  setCopyInstantly(Boolean(value))
                }
                className="border-white/50"
              />
              <span className="text-white text-sm">
                {lang === 'en' ? 'Copy positions at market now' : '立刻市价复制仓位'}
              </span>
            </div>
            <p className="text-white/50 text-xs">
              {lang === 'en'
                ? 'We will open your wallet to confirm the contract interaction.'
                : '点击交易后将拉起钱包进行合约确认。'}
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
