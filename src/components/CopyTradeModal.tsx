import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import { Slider } from './ui/slider';
import { Trader, Language } from '../types/trader';
import { t } from '../utils/translations';
import { formatTraderAge } from '../utils/formatTraderAge';
import { DollarSign, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';

interface CopyTradeModalProps {
  trader: Trader | null;
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
}

export function CopyTradeModal({ trader, isOpen, onClose, lang }: CopyTradeModalProps) {
  const [amount, setAmount] = useState(100);
  const [customAmount, setCustomAmount] = useState('100');
  const [copyInstantly, setCopyInstantly] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stopLossEnabled, setStopLossEnabled] = useState(false);
  const [stopLossPercent, setStopLossPercent] = useState(15);
  const maxBalance = 10000; // Mock max balance

  if (!trader) return null;

  const presetAmounts = [100, 500, 1000];

  const handleConfirm = () => {
    // Mock investment confirmation
    toast.success(
      lang === 'en' 
        ? `Successfully copied trade with $${amount} USDC` 
        : `成功跟单 $${amount} USDC`,
      {
        description: lang === 'en'
          ? `Following trader ${trader.address.substring(0, 8)}...`
          : `跟随交易者 ${trader.address.substring(0, 8)}...`
      }
    );
    onClose();
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
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <p className="text-green-400">+{trader.allTimeReturn.toFixed(1)}%</p>
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
            <label className="text-white mb-2 block">
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

          <div className="p-4 bg-white/10 border border-white/20 rounded-lg space-y-4">
            <div className="flex items-center gap-3">
              <Checkbox
                checked={copyInstantly}
                onCheckedChange={(value) => setCopyInstantly(Boolean(value))}
                className="border-white/50"
              />
              <span className="text-white text-sm">
                {lang === 'en' ? 'Copy positions at market now' : '立刻市价复制仓位'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-white/80 text-sm">
                {lang === 'en' ? 'Advanced options' : '高级选项'}
              </span>
              <Button
                variant="ghost"
                className="text-white/70 hover:text-white"
                onClick={() => setShowAdvanced((prev) => !prev)}
              >
                {showAdvanced ? (lang === 'en' ? 'Hide' : '收起') : (lang === 'en' ? 'Show' : '展开')}
              </Button>
            </div>

            {showAdvanced && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={stopLossEnabled}
                    onCheckedChange={(value) => setStopLossEnabled(Boolean(value))}
                    className="border-white/50"
                  />
                  <span className="text-white text-sm">
                    {lang === 'en' ? 'Copy stop loss' : '跟单止损'}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-white/70">
                    <span>{lang === 'en' ? 'Stop loss' : '止损比例'}</span>
                    <span className="text-white">{stopLossPercent}%</span>
                  </div>
                  <Slider
                    min={5}
                    max={50}
                    step={5}
                    value={[stopLossPercent]}
                    onValueChange={(value) => {
                      if (value[0] !== undefined) {
                        setStopLossPercent(value[0]);
                      }
                    }}
                    className="data-[orientation=horizontal]:h-5"
                    disabled={!stopLossEnabled}
                  />
                  <div className="flex justify-between text-xs text-white/50">
                    <span>5%</span>
                    <span>50%</span>
                  </div>
                </div>
              </div>
            )}
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
            >
              {t('confirmInvestment', lang)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
