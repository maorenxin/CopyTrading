import { DailySnapshot } from '../../services/dashboardApi';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ComposedChart, Area } from 'recharts';

interface Props {
  history: DailySnapshot[];
}

export function EquityCurve({ history }: Props) {
  if (history.length === 0) {
    return (
      <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6">
        <h2 className="text-[#00d4ff] font-semibold mb-4">Equity Curve</h2>
        <div className="text-gray-500 text-center py-12">No data yet. Run a rebalance to start tracking.</div>
      </div>
    );
  }

  const data = history.map(s => ({
    date: s.date,
    equity: Number(s.equity.toFixed(2)),
    pnl: Number(s.daily_pnl.toFixed(2)),
    drawdown: Number((-s.drawdown * 100).toFixed(2)),
  }));

  return (
    <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6">
      <h2 className="text-[#00d4ff] font-semibold mb-4">Equity Curve</h2>

      {/* Equity line + Drawdown area */}
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
            <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
            <YAxis yAxisId="left" tick={{ fill: '#666', fontSize: 11 }} domain={['dataMin - 50', 'dataMax + 50']} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#666', fontSize: 11 }} unit="%" />
            <Tooltip
              contentStyle={{ backgroundColor: '#0d1421', border: '1px solid #1a2235', borderRadius: 6 }}
              labelStyle={{ color: '#888' }}
            />
            <Line yAxisId="left" type="monotone" dataKey="equity" stroke="#00ff88" strokeWidth={2} dot={false} />
            <Area yAxisId="right" type="monotone" dataKey="drawdown" stroke="#ff4444" fill="#ff4444" fillOpacity={0.1} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Daily PnL bars */}
      <div className="h-[120px] mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
            <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
            <YAxis tick={{ fill: '#666', fontSize: 10 }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0d1421', border: '1px solid #1a2235', borderRadius: 6 }}
              labelStyle={{ color: '#888' }}
            />
            <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.pnl >= 0 ? '#00ff88' : '#ff4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
