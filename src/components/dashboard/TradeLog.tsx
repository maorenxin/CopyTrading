import { Trade } from '../../services/dashboardApi';

interface Props {
  trades: Trade[];
}

export function TradeLog({ trades }: Props) {
  return (
    <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6 overflow-hidden">
      <h2 className="text-[#00d4ff] font-semibold mb-4">
        Trade Log
        <span className="text-gray-500 text-sm font-normal ml-2">
          ({trades.length} trades)
        </span>
      </h2>

      {trades.length === 0 ? (
        <div className="text-gray-500 text-center py-8">No trades yet</div>
      ) : (
        <div className="overflow-auto max-h-[300px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0d1421]">
              <tr className="text-gray-500 text-xs uppercase">
                <th className="text-left py-2 px-2">Date</th>
                <th className="text-left py-2 px-2">Coin</th>
                <th className="text-left py-2 px-2">Action</th>
                <th className="text-right py-2 px-2">Notional</th>
                <th className="text-right py-2 px-2">Price</th>
                <th className="text-right py-2 px-2">Fee</th>
              </tr>
            </thead>
            <tbody>
              {trades.map(trade => {
                const isOpen = trade.action.startsWith('open');
                const isShort = trade.action.includes('short');
                const actionColor = isShort ? '#ff4444' : '#00ff88';

                return (
                  <tr key={trade.id} className="border-t border-[#1a2235]/50 hover:bg-[#1a2235]/30">
                    <td className="py-1.5 px-2 text-gray-400 font-mono text-xs">{trade.date}</td>
                    <td className="py-1.5 px-2 font-mono text-white text-xs">{trade.coin}</td>
                    <td className="py-1.5 px-2">
                      <span className="text-xs font-semibold" style={{ color: actionColor }}>
                        {trade.action.replace('_', ' ').toUpperCase()}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-gray-300 text-xs">
                      ${trade.notional.toFixed(0)}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-gray-400 text-xs">
                      {trade.price > 0 ? `$${trade.price.toFixed(trade.price < 1 ? 5 : 2)}` : '—'}
                    </td>
                    <td className="py-1.5 px-2 text-right font-mono text-gray-500 text-xs">
                      ${trade.fee.toFixed(3)}
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
