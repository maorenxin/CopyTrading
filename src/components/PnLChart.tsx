import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { PnLDataPoint, ColorMode, Language } from '../types/trader';
import { getPositiveStrokeColor, getNegativeStrokeColor } from '../utils/colorMode';

interface PnLChartProps {
  data: PnLDataPoint[];
  height?: number;
  showBtcComparison?: boolean;
  colorMode: ColorMode;
  lang?: Language;
}

export function PnLChart({
  data,
  height = 150,
  showBtcComparison = false,
  colorMode,
  lang = 'en',
}: PnLChartProps) {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const formattedData = data.map(d => ({
    ...d,
    date: new Date(d.timestamp).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }));

  // Determine the overall trend
  const firstValue = data[0]?.pnl || 0;
  const lastValue = data[data.length - 1]?.pnl || 0;
  const overallChange = lastValue - firstValue;
  
  const traderLineColor = overallChange >= 0 
    ? getPositiveStrokeColor(colorMode) 
    : getNegativeStrokeColor(colorMode);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={formattedData}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
        <XAxis 
          dataKey="date" 
          stroke="rgba(255, 255, 255, 0.5)"
          tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 10 }}
        />
        <YAxis 
          stroke="rgba(255, 255, 255, 0.5)"
          tick={{ fill: 'rgba(255, 255, 255, 0.7)', fontSize: 10 }}
          domain={['auto', 'auto']}
          width={32}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(26, 11, 46, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: '#fff'
          }}
          formatter={(value: number) => [`$${value.toFixed(2)}`, 'PnL']}
        />
        {showBtcComparison && (
          <Legend 
            wrapperStyle={{ color: '#fff' }}
            iconType="line"
          />
        )}
        <Line 
          type="monotone" 
          dataKey="pnl" 
          stroke={traderLineColor} 
          strokeWidth={2}
          dot={false}
          name="Trader"
        />
        {showBtcComparison && data[0]?.btcPnl && (
          <Line 
            type="monotone" 
            dataKey="btcPnl" 
            stroke="#F59E0B" 
            strokeWidth={2}
            dot={false}
            name="Bitcoin"
            strokeDasharray="5 5"
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
