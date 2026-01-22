import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { PnLDataPoint, ColorMode, Language } from '../types/trader';
import { getPositiveStrokeColor, getNegativeStrokeColor } from '../utils/colorMode';

interface CumulativeReturnsChartProps {
  data: PnLDataPoint[];
  height?: number;
  colorMode: ColorMode;
  lang: Language;
  showBtcComparison?: boolean;
}

export function CumulativeReturnsChart({
  data,
  height = 150,
  colorMode,
  lang,
  showBtcComparison = false,
}: CumulativeReturnsChartProps) {
  // Calculate cumulative returns as percentage change from initial value
  const initialValue = data[0]?.pnl || 1000;
  const initialBtc = data[0]?.btcPnl || initialValue;
  
  const formattedData = data.map(d => {
    const returnPct = ((d.pnl - initialValue) / initialValue) * 100;
    const btcReturn = ((d.btcPnl ?? initialBtc) - initialBtc) / initialBtc * 100;
    return {
      timestamp: d.timestamp,
      date: new Date(d.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      return: returnPct,
      btcReturn,
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
          content={({ label, payload }) => {
            const returnItem = payload?.find((item) => item.dataKey === 'return');
            const btcItem = payload?.find((item) => item.dataKey === 'btcReturn');
            if (!returnItem || typeof returnItem.value !== 'number') return null;
            const dateLabel = lang === 'en' ? 'Date' : '日期';
            const returnLabel = lang === 'en' ? 'Return' : '回报';
            const btcLabel = lang === 'en' ? 'BTC Buy&Hold' : 'BTC 持有';
            return (
              <div
                className="text-sm text-white"
                style={{
                  backgroundColor: 'rgba(26, 11, 46, 0.95)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  padding: '8px 10px',
                }}
              >
                <div className="mb-1">{dateLabel}: {label}</div>
                <div>{returnLabel}: {returnItem.value.toFixed(2)}%</div>
                {showBtcComparison && typeof btcItem?.value === 'number' && (
                  <div>{btcLabel}: {btcItem.value.toFixed(2)}%</div>
                )}
              </div>
            );
          }}
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

        {showBtcComparison && (
          <Area
            type="monotone"
            dataKey="btcReturn"
            stroke="rgba(255, 255, 255, 0.7)"
            strokeWidth={1}
            fill="transparent"
            strokeDasharray="4 3"
            isAnimationActive={false}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
