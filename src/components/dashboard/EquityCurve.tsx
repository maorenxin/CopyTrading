import { useState, useEffect, useCallback } from 'react';
import { DailySnapshot, NavTick, dashboardApi } from '../../services/dashboardApi';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ComposedChart, Area } from 'recharts';

interface Props {
  history: DailySnapshot[];
}

type ViewMode = 'realtime' | 'daily';

export function EquityCurve({ history }: Props) {
  const [view, setView] = useState<ViewMode>('realtime');
  const [ticks, setTicks] = useState<NavTick[]>([]);

  const fetchTicks = useCallback(async () => {
    try {
      const data = await dashboardApi.getNavTicks();
      setTicks(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchTicks();
    const interval = setInterval(fetchTicks, 60_000);
    return () => clearInterval(interval);
  }, [fetchTicks]);

  const hasTicks = ticks.length > 0;
  const hasDaily = history.length >= 2;

  const tickData = ticks.map(t => ({
    time: t.ts.slice(11) || t.ts, // show HH:MM or full ts
    equity: t.equity,
    pnl: t.unrealized_pnl,
  }));

  const dailyData = history.map(s => ({
    date: s.date,
    equity: Number(s.equity.toFixed(2)),
    pnl: Number(s.daily_pnl.toFixed(2)),
    drawdown: Number((-s.drawdown * 100).toFixed(2)),
  }));

  return (
    <div className="bg-[#0d1421] border border-[#1a2235] rounded-lg p-6 overflow-hidden">
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[#00d4ff] font-semibold">Equity Curve</h2>
        <div className="flex gap-1 bg-[#1a2235] rounded p-0.5">
          <button
            onClick={() => setView('realtime')}
            className={`px-3 py-1 text-xs rounded transition ${
              view === 'realtime'
                ? 'bg-[#00d4ff]/20 text-[#00d4ff]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            实时净值
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

      {view === 'realtime' ? (
        !hasTicks ? (
          <div className="text-gray-500 text-center py-12">
            等待第一个 NAV tick（每 5 分钟更新一次）...
          </div>
        ) : (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tickData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
                <XAxis dataKey="time" tick={{ fill: '#666', fontSize: 11 }} />
                <YAxis tick={{ fill: '#666', fontSize: 11 }} domain={['dataMin - 20', 'dataMax + 20']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1421', border: '1px solid #1a2235', borderRadius: 6 }}
                  labelStyle={{ color: '#888' }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Equity']}
                />
                <Line type="monotone" dataKey="equity" stroke="#00ff88" strokeWidth={2} dot={ticks.length < 50} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      ) : (
        !hasDaily ? (
          <div className="text-gray-500 text-center py-12">
            每日收益将在第 2 天 rebalance 后开始显示。
          </div>
        ) : (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a2235" />
                <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: '#666', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1421', border: '1px solid #1a2235', borderRadius: 6 }}
                  labelStyle={{ color: '#888' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Daily PnL']}
                />
                <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                  {dailyData.map((entry, index) => (
                    <Cell key={index} fill={entry.pnl >= 0 ? '#00ff88' : '#ff4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      )}
    </div>
  );
}
