import { TraderMetrics, Trader } from "../types/trader";
import { Language } from "../types/trader";
import { formatBalance } from "../utils/formatBalance";

interface RadarChartProps {
  metrics: TraderMetrics;
  trader?: Trader;
  lang: Language;
  size?: number;
  showValuesOnAxis?: boolean;
}

export function RadarChart({
  metrics,
  trader,
  lang,
  size = 300,
}: RadarChartProps) {
  // Pentagon (5 points) configuration
  const centerX = size / 2;
  const centerY = (size * 0.8) / 2; // Adjusted for 80% height
  const radius = size * 0.28; // Reduced to make room for labels
  const numSides = 5;
  const angleOffset = -Math.PI / 2; // Start from top

  // Calculate actual values for display
  const getTraderAge = () =>
    trader ? `${trader.traderAgeDays}mo` : "";
  const getAnnualReturn = () =>
    trader ? `${trader.allTimeReturn.toFixed(1)}%` : "";
  const getSharpe = () =>
    trader ? `${(metrics.sharpe * 0.5).toFixed(2)}` : "";
  const getMaxDrawdown = () =>
    trader ? `${trader.maxDrawdownPercent.toFixed(1)}%` : "";
  const getBalance = () =>
    trader ? formatBalance(trader.balance) : "";

  const dimensions = [
    {
      name: lang === "en" ? "Trader Age" : "交易年龄",
      value: metrics.traderAge,
      displayValue: getTraderAge(),
    },
    {
      name: lang === "en" ? "ARR" : "年化收益",
      value: metrics.annualReturn,
      displayValue: getAnnualReturn(),
    },
    {
      name: "Sharpe",
      value: metrics.sharpe,
      displayValue: getSharpe(),
    },
    {
      name: "MDD",
      value: metrics.maxDrawdown,
      displayValue: getMaxDrawdown(),
    },
    {
      name: lang === "en" ? "Balance" : "管理余额",
      value: metrics.balance,
      displayValue: getBalance(),
    },
  ];

  // Generate pentagon points for a given scale (0-1)
  const getPentagonPoints = (scale: number) => {
    const points = [];
    for (let i = 0; i < numSides; i++) {
      const angle = angleOffset + (i * 2 * Math.PI) / numSides;
      const x = centerX + radius * scale * Math.cos(angle);
      const y = centerY + radius * scale * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(" ");
  };

  // Generate data polygon based on metric values (0-5 scale)
  const getDataPoints = () => {
    const points = [];
    for (let i = 0; i < numSides; i++) {
      const angle = angleOffset + (i * 2 * Math.PI) / numSides;
      const normalizedValue = dimensions[i].value / 5; // Normalize to 0-1
      const x =
        centerX + radius * normalizedValue * Math.cos(angle);
      const y =
        centerY + radius * normalizedValue * Math.sin(angle);
      points.push(`${x},${y}`);
    }
    return points.join(" ");
  };

  // Generate axis lines from center to each point
  const getAxisLines = () => {
    const lines = [];
    for (let i = 0; i < numSides; i++) {
      const angle = angleOffset + (i * 2 * Math.PI) / numSides;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      lines.push(
        <line
          key={`axis-${i}`}
          x1={centerX}
          y1={centerY}
          x2={x}
          y2={y}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth="0.6"
        />,
      );
    }
    return lines;
  };

  // Generate labels at each point
  const getLabels = () => {
    const labels = [];
    const labelDistance = radius + 16; // Slightly farther to reduce overlap

    for (let i = 0; i < numSides; i++) {
      const angle = angleOffset + (i * 2 * Math.PI) / numSides;
      const x = centerX + labelDistance * Math.cos(angle);
      const y = centerY + labelDistance * Math.sin(angle);

      const dim = dimensions[i];

      // Determine text anchor based on position
      let textAnchor: "middle" | "start" | "end" = "middle";
      if (x < centerX - 10) textAnchor = "end";
      else if (x > centerX + 10) textAnchor = "start";

      labels.push(
        <g key={`label-${i}`}>
          {/* Dimension name */}
          <text
            x={x}
            y={y - 12}
            fill="rgba(255, 255, 255, 0.9)"
            className="text-xs"
            fontWeight="500"
            textAnchor={textAnchor}
          >
            {dim.name}
          </text>
          {/* Value */}
          <text
            x={x}
            y={y + 12}
            fill="#60A5FA"
            className="text-lg"
            fontWeight="600"
            textAnchor={textAnchor}
          >
            {dim.displayValue}
          </text>
        </g>,
      );
    }
    return labels;
  };

  return (
    <div
      className="relative mt-2 -mb-8"
      style={{ width: size, height: size * 0.8 }}
    >
      <svg width={size} height={size * 0.8} className="block">
        {/* Grid rings (5 levels) */}
        {[0.2, 0.4, 0.6, 0.8, 1.0].map((scale, i) => (
          <polygon
            key={`ring-${i}`}
            points={getPentagonPoints(scale)}
            fill="none"
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="0.6"
          />
        ))}

        {/* Axis lines */}
        {getAxisLines()}

        {/* Data polygon */}
        <polygon
          points={getDataPoints()}
          fill="#60A5FA"
          fillOpacity="0.3"
          stroke="#60A5FA"
          strokeWidth="2"
          strokeLinejoin="round"
        />

        {/* Data points (circles) */}
        {dimensions.map((dim, i) => {
          const angle =
            angleOffset + (i * 2 * Math.PI) / numSides;
          const normalizedValue = dim.value / 5;
          const x =
            centerX +
            radius * normalizedValue * Math.cos(angle);
          const y =
            centerY +
            radius * normalizedValue * Math.sin(angle);
          return (
            <circle
              key={`point-${i}`}
              cx={x}
              cy={y}
              r="4"
              fill="#60A5FA"
              stroke="white"
              strokeWidth="2"
            />
          );
        })}

        {/* Labels */}
        {getLabels()}
      </svg>
    </div>
  );
}
