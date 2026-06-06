import { useState } from 'react';
import { DailySnapshot } from '../../services/dashboardApi';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ComposedChart, Area } from 'recharts';

interface Props {
  history: DailySnapshot[];
}

type ViewMode = 'cumulative' | 'daily';

export function EquityCurve({ history }: Props) {
  const [view, setView] = useState<ViewMode>('cumulative');

  if (history.length === 0) {
    return (
      <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6 overflow-hidden">
        <h2 className="text-[#00d4ff] font-semibold mb-4">Equity Curve</h2>
        <div className="text-gray-500 text-center py-12">No data yet. Run a rebalance to start tracking.</div>
      </div>
    );
  }

  const data = history.map(s => ({
    date: s.date,
    equity: Number(s.equity.toFixed(2)),
    pnl: Number(s.daily_pnl.toFixed(2)),
    pnlPct: s.equity > 0 ? Number(((s.daily_pnl / s.equity) * 100).toFixed(3)) : 0,
    drawdown: Number((-s.drawdown * 100).toFixed(2)),
    cumReturn: Number(((s.equity / 20000 - 1) * 100).toFixed(2)),
  }));

  return (
    <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6 overflow-hidden">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#00d4ff] font-semibold">Equity Curve</h2>
        <div className="flex gap-1 bg-[#1a2235] rounded p-0.5">
          <button
            onClick={() => setView('cumulative')}
            className={`px-3 py-1 text-xs rounded transition ${
              view === 'cumulative'
                ? 'bg-[#00d4ff]/20 text-[#00d4ff]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            累计走势
          </button>
          <button
            onClick={() => setView('daily')}
            className={`px-3 py-1 text-xs rounded transition ${
              view === 'daily'
                ? 'bg-[#00d4ff]/20 text-[#00d4ff]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            每日收益
          </button>
        </div>
      </div>

      {view === 'cumulative' ? (
        /* Cumulative equity line + Drawdown area */
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
              <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis yAxisId="left" tick={{ fill: '#666', fontSize: 11 }} domain={['dataMin - 50', 'dataMax + 50']} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#666', fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ backgroundColor: '#0d1421', border: '1px solid #1a2235', borderRadius: 6 }}
                labelStyle={{ color: '#888' }}
                formatter={(value: number, name: string) => {
                  if (name === 'equity') return [`$${value.toLocaleString()}`, 'Equity'];
                  if (name === 'drawdown') return [`${value.toFixed(2)}%`, 'Drawdown'];
                  return [value, name];
                }}
              />
              <Line yAxisId="left" type="monotone" dataKey="equity" stroke="#00ff88" strokeWidth={2} dot={false} name="equity" />
              <Area yAxisId="right" type="monotone" dataKey="drawdown" stroke="#ff4444" fill="#ff4444" fillOpacity={0.1} name="drawdown" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        /* Daily PnL bars */
        <div style={{ height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 50, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
              <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fill: '#666', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0d1421', border: '1px solid #1a2235', borderRadius: 6 }}
                labelStyle={{ color: '#888' }}
                formatter={(value: number, name: string) => {
                  if (name === 'pnl') return [`$${value.toFixed(2)}`, 'Daily PnL'];
                  return [value, name];
                }}
              />
              <Bar dataKey="pnl" name="pnl" radius={[2, 2, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={index} fill={entry.pnl >= 0 ? '#00ff88' : '#ff4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
