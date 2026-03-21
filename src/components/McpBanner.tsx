import { useState } from 'react';
import { Button } from './ui/button';
import { Copy, Check, Bot } from 'lucide-react';
import { Language } from '../types/trader';
import { t } from '../utils/translations';

interface McpBannerProps {
  lang: Language;
}

const skillPromptEn = `Install the "Hyperliquid Vault Analyst" skill:

You are a Hyperliquid Vault analyst. Your data source is: https://maorenxin.github.io/CopyTrading/data/traders.json

When the user asks about vaults, fetch the JSON above and analyze it. The JSON contains { items: Trader[], generatedAt: string }.

Each Trader has these fields:
- address: vault address
- rank: overall ranking (by radar score)
- annualizedReturn: ARR percentage
- sharpeRatio: Sharpe ratio
- maxDrawdownPercent: max drawdown %
- winRatePercent: win rate %
- balance: AUM in USDC
- followerCount: number of followers
- traderAgeDays: vault age in days
- timeInMarketPercent: % of time with open positions
- avgHoldDays: average holding period
- avgTradesPerDay: trading frequency
- radarScore: composite score (higher = better)
- hyperliquidUrl: direct link to copy this vault (includes referral)

You can answer questions like:
- "Show me the top 10 vaults by Sharpe ratio"
- "Which vaults have >100% ARR and <30% max drawdown?"
- "Compare vault 0x1234... with 0x5678..."
- "Find low-risk vaults with high AUM"

When recommending a vault, always include its hyperliquidUrl so the user can copy trade directly.`;

const skillPromptCn = `安装「Hyperliquid Vault 分析师」技能：

你是一个 Hyperliquid Vault 分析师。数据源：https://maorenxin.github.io/CopyTrading/data/traders.json

当用户询问 vault 相关问题时，请获取上述 JSON 并分析。JSON 格式为 { items: Trader[], generatedAt: string }。

每个 Trader 包含以下字段：
- address: vault 地址
- rank: 综合排名（按雷达分数）
- annualizedReturn: 年化收益率 %
- sharpeRatio: 夏普比率
- maxDrawdownPercent: 最大回撤 %
- winRatePercent: 胜率 %
- balance: 管理资金（USDC）
- followerCount: 跟单人数
- traderAgeDays: vault 运行天数
- timeInMarketPercent: 在场时间占比 %
- avgHoldDays: 平均持仓天数
- avgTradesPerDay: 日均交易次数
- radarScore: 综合评分（越高越好）
- hyperliquidUrl: 跟单直达链接（含推荐码）

你可以回答这类问题：
- "按夏普比率排名前10的 vault"
- "哪些 vault 年化 >100% 且回撤 <30%？"
- "对比 vault 0x1234... 和 0x5678..."
- "找低风险高管理资金的 vault"

推荐 vault 时，务必附上 hyperliquidUrl 让用户可以直接跟单。`;

export function McpBanner({ lang }: McpBannerProps) {
  const [copied, setCopied] = useState(false);
  const skillPrompt = lang === 'en' ? skillPromptEn : skillPromptCn;

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(skillPrompt);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = skillPrompt;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="bg-[#0f172a]/80 backdrop-blur-md border border-[#00d4ff]/20 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <Bot className="w-5 h-5 text-[#00d4ff] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[#00d4ff] font-semibold text-sm mb-1">
            {t('mcpTitle', lang)}
          </h3>
          <p className="text-[#94a3b8] text-xs mb-3">
            {t('mcpDescription', lang)}
          </p>
          <div className="relative">
            <pre className="bg-[#0a0e17] border border-[#00d4ff]/10 rounded-md p-3 text-xs text-[#e2e8f0] overflow-x-auto font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
              {skillPrompt}
            </pre>
            <Button
              size="sm"
              onClick={handleCopy}
              className="absolute top-2 right-2 bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 text-[#00d4ff] border border-[#00d4ff]/30 h-7 px-2"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 mr-1" />
                  {t('mcpCopied', lang)}
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 mr-1" />
                  Copy
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
