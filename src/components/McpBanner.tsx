import { useState } from 'react';
import { Button } from './ui/button';
import { Copy, Check, Bot } from 'lucide-react';
import { Language } from '../types/trader';
import { t } from '../utils/translations';

interface McpBannerProps {
  lang: Language;
}

const INSTALL_CMD = 'Install the Hyperliquid Vault Analyst skill from https://maorenxin.github.io/CopyTrading/skill/SKILL.md';

export function McpBanner({ lang }: McpBannerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(INSTALL_CMD);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = INSTALL_CMD;
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
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 bg-[#0a0e17] border border-[#00d4ff]/10 rounded-md px-3 py-2 font-mono text-xs text-[#e2e8f0] overflow-x-auto whitespace-nowrap">
              {INSTALL_CMD}
            </div>
            <Button
              size="sm"
              onClick={handleCopy}
              className={`shrink-0 h-8 px-3 border font-semibold transition-all duration-200 ${
                copied
                  ? 'bg-[#00ff88]/15 border-[#00ff88]/30 text-[#00ff88]'
                  : 'bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 border-[#00d4ff]/30 text-[#00d4ff]'
              }`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 mr-1" />
                  {t('mcpCopied', lang)}
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 mr-1" />
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
