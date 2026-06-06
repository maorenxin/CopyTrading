import { useState, useEffect, useCallback } from 'react';
import { dashboardApi, StrategyStatus, DailySnapshot, Trade, Metrics } from '../../services/dashboardApi';
import { OverviewCards } from './OverviewCards';
import { EquityCurve } from './EquityCurve';
import { PositionsTable } from './PositionsTable';
import { SignalRankings } from './SignalRankings';
import { TradeLog } from './TradeLog';

export function Dashboard() {
  const [status, setStatus] = useState<StrategyStatus | null>(null);
  const [history, setHistory] = useState<DailySnapshot[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, h, t, m] = await Promise.all([
        dashboardApi.getStatus(),
        dashboardApi.getHistory(),
        dashboardApi.getTrades(),
        dashboardApi.getMetrics(),
      ]);
      setStatus(s);
      setHistory(h);
      setTrades(t);
      setMetrics(m);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [refresh]);

  const handleRebalance = async () => {
    try {
      await dashboardApi.triggerRebalance();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rebalance failed');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-[#00ff88] text-lg animate-pulse">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-red-400 text-lg mb-2">⚠ Connection Error</div>
          <div className="text-gray-400 text-sm">{error}</div>
          <button
            onClick={refresh}
            className="mt-4 px-4 py-2 bg-[#00ff88]/10 border border-[#00ff88]/30 text-[#00ff88] rounded hover:bg-[#00ff88]/20 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#00ff88]">
            Strategy Dashboard
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            L7/S15 Cross-Sectional Momentum · {status?.mode?.toUpperCase()} MODE
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {status?.nav_updated_at
              ? `NAV: ${new Date(status.nav_updated_at).toLocaleTimeString()}`
              : `Last rebalance: ${status?.last_rebalance || 'Never'}`}
          </span>
          <button
            onClick={handleRebalance}
            className="px-3 py-1.5 text-sm bg-[#00d4ff]/10 border border-[#00d4ff]/30 text-[#00d4ff] rounded hover:bg-[#00d4ff]/20 transition"
          >
            Rebalance Now
          </button>
        </div>
      </div>

      {/* Overview cards */}
      <OverviewCards status={status} metrics={metrics} />

      {/* Equity curve */}
      <EquityCurve history={history} />

      {/* Positions + Signals side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 [&>*]:min-h-0">
        <PositionsTable positions={status?.positions || []} />
        <SignalRankings />
      </div>

      {/* Trade log */}
      <TradeLog trades={trades} />
    </div>
  );
}
