import type { Language } from '../types/trader';

interface RiskNoticeProps {
  lang: Language;
}

export function RiskNotice({ lang }: RiskNoticeProps) {
  const text =
    lang === 'en'
      ? 'Risk Notice: Performance metrics are informational and not investment advice.'
      : '风险提示：绩效指标仅供参考，不构成投资建议。';

  return (
    <div className="border border-red-400/30 bg-red-500/10 text-red-200 text-sm p-3 rounded-lg">
      {text}
    </div>
  );
}
