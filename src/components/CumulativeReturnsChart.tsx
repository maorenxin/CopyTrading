import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { PnLDataPoint, ColorMode } from '../types/trader';
import { getPositiveStrokeColor, getNegativeStrokeColor } from '../utils/colorMode';

interface CumulativeReturnsChartProps {
  data: PnLDataPoint[];
  height?: number;
  colorMode: ColorMode;
}

export function CumulativeReturnsChart({ data, height = 150, colorMode }: CumulativeReturnsChartProps) {
  // Calculate cumulative returns as percentage change from initial value
  const initialValue = data[0]?.pnl || 1000;
  
  const formattedData = data.map(d => {
    const returnPct = ((d.pnl - initialValue) / initialValue) * 100;
    return {
      timestamp: d.timestamp,
      date: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      return: returnPct,
      positiveReturn: returnPct >= 0 ? returnPct : 0,
      negativeReturn: returnPct < 0 ? returnPct : 0,
      pnl: d.pnl
    };
  });

  // Get colors based on color mode
  const positiveColor = getPositiveStrokeColor(colorMode);
  const negativeColor = getNegativeStrokeColor(colorMode);
  
  // Determine line color based on current value
  const currentReturn = formattedData[formattedData.length - 1]?.return || 0;
  const lineColor = currentReturn >= 0 ? positiveColor : negativeColor;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={formattedData}>
        <defs>
          <linearGradient id={`colorPositive-${colorMode}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={positiveColor} stopOpacity={0.6}/>
            <stop offset="95%" stopColor={positiveColor} stopOpacity={0.05}/>
          </linearGradient>
          <linearGradient id={`colorNegative-${colorMode}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="5%" stopColor={negativeColor} stopOpacity={0.6}/>
            <stop offset="95%" stopColor={negativeColor} stopOpacity={0.05}/>
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
          domain={['auto', 'auto']}
          tickFormatter={(value) => `${value.toFixed(0)}%`}
          width={35}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'rgba(26, 11, 46, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            borderRadius: '8px',
            color: '#fff'
          }}
          formatter={(value: number) => [`${value.toFixed(2)}%`, 'Return']}
        />
        <ReferenceLine y={0} stroke="rgba(255, 255, 255, 0.3)" strokeDasharray="3 3" />
        
        {/* Positive area - filled from 0% to line when above 0 */}
        <Area 
          type="monotone" 
          dataKey="positiveReturn" 
          stroke="none"
          strokeWidth={0}
          fill={`url(#colorPositive-${colorMode})`}
          fillOpacity={1}
          isAnimationActive={true}
          connectNulls={false}
        />
        
        {/* Negative area - filled from 0% to line when below 0 */}
        <Area 
          type="monotone" 
          dataKey="negativeReturn" 
          stroke="none"
          strokeWidth={0}
          fill={`url(#colorNegative-${colorMode})`}
          fillOpacity={1}
          isAnimationActive={true}
          connectNulls={false}
        />
        
        {/* Main line showing the actual return */}
        <Area 
          type="monotone" 
          dataKey="return" 
          stroke={lineColor}
          strokeWidth={1.4}
          fill="transparent"
          isAnimationActive={true}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}