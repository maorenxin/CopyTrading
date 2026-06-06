import { Position } from '../../services/dashboardApi';

interface Props {
  positions: Position[];
}

export function PositionsTable({ positions }: Props) {
  const shorts = positions.filter(p => p.side === 'short');
  const longs = positions.filter(p => p.side === 'long');

  return (
    <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6 overflow-hidden">
      <h2 className="text-[#00d4ff] font-semibold mb-4">
        Current Positions
        <span className="text-gray-500 text-sm font-normal ml-2">
          ({longs.length}L / {shorts.length}S)
        </span>
      </h2>

      {positions.length === 0 ? (
        <div className="text-gray-500 text-center py-8">No positions yet</div>
      ) : (
        <div className="overflow-auto max-h-[350px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0d1421]">
              <tr className="text-gray-500 text-xs uppercase">
                <th className="text-left py-2 px-2">Coin</th>
                <th className="text-left py-2 px-2">Side</th>
                <th className="text-right py-2 px-2">Notional</th>
                <th className="text-right py-2 px-2">Entry</th>
                <th className="text-right py-2 px-2">Mark</th>
                <th className="text-right py-2 px-2">PnL</th>
              </tr>
            </thead>
            <tbody>
              {/* Shorts first */}
              {shorts.map(pos => (
                <PositionRow key={pos.id} pos={pos} />
              ))}
              {/* Divider */}
              {shorts.length > 0 && longs.length > 0 && (
                <tr><td colSpan={6} className="border-t border-[#1a2235]" /></tr>
              )}
              {/* Longs */}
              {longs.map(pos => (
                <PositionRow key={pos.id} pos={pos} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PositionRow({ pos }: { pos: Position }) {
  const sideColor = pos.side === 'short' ? '#ff4444' : '#00ff88';
  const pnl = pos.unrealized_pnl ?? 0;
  const pnlColor = pnl >= 0 ? '#00ff88' : '#ff4444';
  const markPrice = pos.mark_price;

  return (
    <tr className="border-t border-[#1a2235]/50 hover:bg-[#1a2235]/30">
      <td className="py-1.5 px-2 font-mono text-white">{pos.coin}</td>
      <td className="py-1.5 px-2">
        <span className="text-xs font-semibold uppercase" style={{ color: sideColor }}>
          {pos.side}
        </span>
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-gray-300">
        ${Math.abs(pos.notional).toFixed(0)}
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-gray-400">
        {pos.entry_price > 0 ? formatPrice(pos.entry_price) : '—'}
      </td>
      <td className="py-1.5 px-2 text-right font-mono text-gray-300">
        {markPrice ? formatPrice(markPrice) : '—'}
      </td>
      <td className="py-1.5 px-2 text-right font-mono" style={{ color: pnlColor }}>
        {pnl !== 0 ? `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : '—'}
      </td>
    </tr>
  );
}

function formatPrice(p: number): string {
  if (p >= 100) return `$${p.toFixed(2)}`;
  if (p >= 1) return `$${p.toFixed(3)}`;
  return `$${p.toFixed(5)}`;
}
