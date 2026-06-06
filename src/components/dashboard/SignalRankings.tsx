import { useState, useEffect } from 'react';
import { dashboardApi, Signal } from '../../services/dashboardApi';
import { getCoinCategory } from '../../utils/coinCategory';

export function SignalRankings() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [activeDate, setActiveDate] = useState<string | null>(null);

  // Load available dates once + refresh periodically (new date appears after daily rebalance)
  useEffect(() => {
    const loadDates = async () => {
      try {
        const d = await dashboardApi.getSignalDates();
        setDates(d);
        // Snap to the latest date whenever a newer one appears
        setActiveDate(prev => (prev && d.includes(prev) ? prev : d[0] ?? null));
      } catch {
        /* ignore — empty state handles it */
      }
    };
    loadDates();
    const interval = setInterval(loadDates, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Load signals for the active date
  useEffect(() => {
    if (!activeDate) return;
    dashboardApi
      .getSignals(activeDate)
      .then(setSignals)
      .catch(() => setSignals([]));
  }, [activeDate]);

  const idx = activeDate ? dates.indexOf(activeDate) : -1;
  const hasPrev = idx >= 0 && idx < dates.length - 1; // older
  const hasNext = idx > 0; // newer
  const goPrev = () => hasPrev && setActiveDate(dates[idx + 1]);
  const goNext = () => hasNext && setActiveDate(dates[idx - 1]);

  // Only show selected positions, shorts first (worst momentum), then longs
  const shown = signals
    .filter(s => s.selected)
    .sort((a, b) => a.rank - b.rank);

  return (
    <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#00d4ff] font-semibold">Signal Rankings</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            disabled={!hasPrev}
            className="px-2 py-0.5 text-xs rounded border border-[#1a2235] text-gray-400 hover:bg-[#1a2235] disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            ‹
          </button>
          <span className="text-sm font-mono text-gray-300 min-w-[88px] text-center">
            {activeDate ?? '—'}
          </span>
          <button
            onClick={goNext}
            disabled={!hasNext}
            className="px-2 py-0.5 text-xs rounded border border-[#1a2235] text-gray-400 hover:bg-[#1a2235] disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            ›
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="text-gray-500 text-center py-8">No signals yet</div>
      ) : (
        <div className="overflow-auto max-h-[260px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0d1421]">
              <tr className="text-gray-500 text-xs uppercase">
                <th className="text-left py-2 px-2">#</th>
                <th className="text-left py-2 px-2">Coin</th>
                <th className="text-left py-2 px-2">Category</th>
                <th className="text-right py-2 px-2">Score</th>
                <th className="text-right py-2 px-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(sig => {
                const isShort = sig.selected === 'short';
                const bgClass = isShort ? 'bg-red-500/5' : 'bg-green-500/5';
                const actionColor = isShort ? '#ff4444' : '#00ff88';
                const actionText = isShort ? 'SHORT' : 'LONG';

                return (
                  <tr
                    key={sig.coin}
                    className={`border-t border-[#1a2235]/50 hover:bg-[#1a2235]/30 ${bgClass}`}
                  >
                    <td className="py-1 px-2 text-gray-500 font-mono text-xs">{sig.rank}</td>
                    <td className="py-1 px-2 font-mono text-white text-xs">{sig.coin}</td>
                    <td className="py-1 px-2 text-gray-400 text-xs">{getCoinCategory(sig.coin)}</td>
                    <td className="py-1 px-2 text-right font-mono text-gray-400 text-xs">
                      {(sig.momentum_score * 100).toFixed(1)}
                    </td>
                    <td className="py-1 px-2 text-right">
                      <span className="text-xs font-bold" style={{ color: actionColor }}>
                        {actionText}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
