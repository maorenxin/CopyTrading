import { Signal } from '../../services/dashboardApi';

interface Props {
  signals: Signal[];
}

export function SignalRankings({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6">
        <h2 className="text-[#00d4ff] font-semibold mb-4">Signal Rankings</h2>
        <div className="text-gray-500 text-center py-8">No signals yet</div>
      </div>
    );
  }

  return (
    <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6">
      <h2 className="text-[#00d4ff] font-semibold mb-4">
        Signal Rankings
        <span className="text-gray-500 text-sm font-normal ml-2">
          {signals[0]?.date}
        </span>
      </h2>

      <div className="overflow-auto max-h-[400px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#0d1421]">
            <tr className="text-gray-500 text-xs uppercase">
              <th className="text-left py-2 px-2">#</th>
              <th className="text-left py-2 px-2">Coin</th>
              <th className="text-right py-2 px-2">Score</th>
              <th className="text-right py-2 px-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {signals.map(sig => {
              let bgClass = '';
              let actionColor = '#666';
              let actionText = '';
              if (sig.selected === 'short') {
                bgClass = 'bg-red-500/5';
                actionColor = '#ff4444';
                actionText = 'SHORT';
              } else if (sig.selected === 'long') {
                bgClass = 'bg-green-500/5';
                actionColor = '#00ff88';
                actionText = 'LONG';
              }

              return (
                <tr key={sig.coin} className={`border-t border-[#1a2235]/50 hover:bg-[#1a2235]/30 ${bgClass}`}>
                  <td className="py-1 px-2 text-gray-500 font-mono text-xs">{sig.rank}</td>
                  <td className="py-1 px-2 font-mono text-white text-xs">{sig.coin}</td>
                  <td className="py-1 px-2 text-right font-mono text-gray-400 text-xs">
                    {(sig.momentum_score * 100).toFixed(1)}
                  </td>
                  <td className="py-1 px-2 text-right">
                    {actionText && (
                      <span className="text-xs font-bold" style={{ color: actionColor }}>
                        {actionText}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
