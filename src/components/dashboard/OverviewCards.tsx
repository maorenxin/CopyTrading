import { StrategyStatus, Metrics } from '../../services/dashboardApi';

interface Props {
  status: StrategyStatus | null;
  metrics: Metrics | null;
}

export function OverviewCards({ status, metrics }: Props) {
  const cards = [
    {
      label: 'Equity',
      value: `$${(status?.equity ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      color: '#00ff88',
    },
    {
      label: 'Daily PnL',
      value: `${(status?.daily_pnl ?? 0) >= 0 ? '+' : ''}$${(status?.daily_pnl ?? 0).toFixed(2)}`,
      color: (status?.daily_pnl ?? 0) >= 0 ? '#00ff88' : '#ff4444',
    },
    {
      label: 'Total PnL',
      value: `${(status?.cumulative_pnl ?? 0) >= 0 ? '+' : ''}$${(status?.cumulative_pnl ?? 0).toFixed(2)}`,
      color: (status?.cumulative_pnl ?? 0) >= 0 ? '#00ff88' : '#ff4444',
    },
    {
      label: 'Sharpe',
      value: metrics?.sharpe?.toFixed(2) ?? '—',
      color: '#00d4ff',
    },
    {
      label: 'ARR',
      value: metrics?.arr ? `${metrics.arr.toFixed(1)}%` : '—',
      color: '#00d4ff',
    },
    {
      label: 'MDD',
      value: metrics?.mdd ? `${metrics.mdd.toFixed(1)}%` : '—',
      color: (metrics?.mdd ?? 0) > 10 ? '#ff4444' : '#00d4ff',
    },
    {
      label: 'Win Rate',
      value: metrics?.win_rate ? `${metrics.win_rate.toFixed(0)}%` : '—',
      color: '#00d4ff',
    },
    {
      label: 'Running Days',
      value: `${status?.running_days ?? 0}d`,
      color: '#888',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {cards.map(card => (
        <div
          key={card.label}
          className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-3"
        >
          <div className="text-xs text-gray-500 uppercase tracking-wider">{card.label}</div>
          <div className="text-lg font-mono mt-1" style={{ color: card.color }}>
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
