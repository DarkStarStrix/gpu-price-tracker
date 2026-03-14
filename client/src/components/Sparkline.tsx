/*
  Sparkline — Inline SVG sparkline with smooth bezier curves
  Design: Data Observatory v2 — smooth curves, trend-aware color, subtle fill
*/

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
}

function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return "";
  let d = `M${points[0][0]},${points[0][1]}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpX = (prev[0] + curr[0]) / 2;
    d += ` C${cpX},${prev[1]} ${cpX},${curr[1]} ${curr[0]},${curr[1]}`;
  }
  return d;
}

export function Sparkline({ data, width = 80, height = 24, color, className = "" }: SparklineProps) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 0.01;
  const pad = 2;

  const coords: [number, number][] = data.map((val, i) => [
    pad + (i / (data.length - 1)) * (width - pad * 2),
    height - pad - ((val - min) / range) * (height - pad * 2),
  ]);

  const pathD = smoothPath(coords);

  // Fill area under curve
  const fillD = `${pathD} L${coords[coords.length - 1][0]},${height} L${coords[0][0]},${height} Z`;

  const trend = data[data.length - 1] - data[0];
  const strokeColor = color ?? (trend <= 0 ? "oklch(0.60 0.18 155)" : "oklch(0.68 0.18 45)");
  const fillColor = color ?? (trend <= 0 ? "oklch(0.60 0.18 155 / 0.08)" : "oklch(0.68 0.18 45 / 0.08)");

  const lastX = coords[coords.length - 1][0];
  const lastY = coords[coords.length - 1][1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      {/* Fill */}
      <path d={fillD} fill={fillColor} />
      {/* Line */}
      <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={1.5} strokeLinecap="round" />
      {/* End dot */}
      <circle cx={lastX} cy={lastY} r={2.5} fill={strokeColor} />
      <circle cx={lastX} cy={lastY} r={4} fill={strokeColor} opacity={0.2} />
    </svg>
  );
}
