import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { PnLDataPoint, ColorMode, Language } from '../types/trader';
import { getPositiveStrokeColor, getNegativeStrokeColor } from '../utils/colorMode';

interface PnlChartProps {
  data: PnLDataPoint[];
  height?: number;
  colorMode: ColorMode;
  lang: Language;
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function PnlChart({ data, height = 150, colorMode, lang }: PnlChartProps) {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';

  const formattedData = data.map((d) => ({
    timestamp: d.timestamp,
    date: new Date(d.timestamp).toLocaleDateString(locale, { month: 'short', day: 'numeric' }),
    value: Number.isFinite(d.pnl) ? d.pnl : 0,
  }));

  const values = formattedData.map((d) => d.value).filter(Number.isFinite);
  const minValue = values.length ? Math.min(...values) : 0;
  const maxValue = values.length ? Math.max(...values) : 0;
  const padding = Math.max(1, (maxValue - minValue) * 0.08);

  const lastValue = formattedData[formattedData.length - 1]?.value ?? 0;
  const firstValue = formattedData[0]?.value ?? 0;
  const isUp = lastValue >= firstValue;

  const positiveColor = getPositiveStrokeColor(colorMode);
  const negativeColor = getNegativeStrokeColor(colorMode);
  const lineColor = isUp ? positiveColor : negativeColor;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formattedData}>
        <defs>
          <linearGradient id={`pnlGradient-${colorMode}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={lineColor} stopOpacity={0.5} />
            <stop offset="95%" stopColor={lineColor} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
        <XAxis
          dataKey="date"
          stroke="rgba(255, 255, 255, 0.5)"
          tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 10 }}
        />
        <YAxis
          stroke="rgba(255, 255, 255, 0.5)"
          tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 10 }}
          domain={[minValue - padding, maxValue + padding]}
          tickFormatter={(v) => formatValue(Number(v))}
          width={52}
        />
        <Tooltip
          content={({ label, payload }) => {
            const item = payload?.[0];
            if (!item || typeof item.value !== 'number') return null;
            const dateLabel = lang === 'en' ? 'Date' : '日期';
            const valLabel = lang === 'en' ? 'Account Value' : '账户价值';
            return (
              <div
                className="text-sm text-white"
                style={{
                  backgroundColor: 'rgba(10, 14, 23, 0.95)',
                  border: '1px solid rgba(0, 255, 136, 0.2)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                }}
              >
                <div className="mb-1">{dateLabel}: {label}</div>
                <div>{valLabel}: {formatValue(item.value)}</div>
              </div>
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={lineColor}
          strokeWidth={1.4}
          fill={`url(#pnlGradient-${colorMode})`}
          fillOpacity={1}
          isAnimationActive={true}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
