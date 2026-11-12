import { useEffect, useId, useRef, useState } from "react";

type Series = {
  label: string;
  color: string;
  values: number[];
};

export function TimeSeriesPlot({
  label,
  times,
  series,
  domain,
  timeEnd = times.at(-1)!,
  formatTime,
  formatValue,
  height,
  reference,
  step = false,
  onInspect,
}: {
  label: string;
  times: number[];
  series: Series[];
  domain: [number, number];
  timeEnd?: number;
  formatTime: (time: number) => string;
  formatValue: (value: number) => string;
  height: number;
  reference?: number;
  step?: boolean;
  onInspect?: (index: number | null) => void;
}) {
  const plot = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(600);
  const [inspectedTime, setInspectedTime] = useState<number | null>(null);
  const fillId = useId();

  useEffect(() => {
    const node = plot.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const left = 10;
  const right = width - 61;
  const top = 13;
  const bottom = height - 30;
  const first = times[0];
  const last = Math.max(first + 1, timeEnd);
  const [low, high] = domain;
  const x = (time: number) =>
    left + ((time - first) / (last - first)) * (right - left);
  const y = (value: number) =>
    bottom - ((value - low) / (high - low)) * (bottom - top);
  const tickCount = Math.min(5, Math.max(2, Math.floor(width / 115)));
  const activeIndex =
    inspectedTime === null ? -1 : times.indexOf(inspectedTime);
  const active = activeIndex < 0 ? null : activeIndex;

  function inspect(index: number | null) {
    const time = index === null ? null : times[index];
    if (inspectedTime === time) return;
    setInspectedTime(time);
    onInspect?.(index);
  }

  function nearest(time: number) {
    let firstIndex = 0;
    let lastIndex = times.length - 1;
    while (firstIndex < lastIndex) {
      const middle = (firstIndex + lastIndex) >>> 1;
      if (time - times[middle] > times[middle + 1] - time)
        firstIndex = middle + 1;
      else lastIndex = middle;
    }
    return firstIndex;
  }

  return (
    <figure className="relative">
      <svg
        ref={plot}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        className="block touch-pan-y"
        role="img"
        aria-label={label}
        tabIndex={0}
        onPointerMove={event => {
          if (event.pointerType === "touch") return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (!bounds.width) return;
          const offset =
            ((event.clientX - bounds.left) * width) / bounds.width - left;
          inspect(nearest(first + (offset / (right - left)) * (last - first)));
        }}
        onPointerLeave={() => inspect(null)}
        onPointerCancel={() => inspect(null)}
        onWheel={() => inspect(null)}
        onBlur={() => inspect(null)}
        onKeyDown={event => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const delta = event.key === "ArrowRight" ? 1 : -1;
          inspect(
            Math.max(
              0,
              Math.min(times.length - 1, active === null ? 0 : active + delta)
            )
          );
        }}
      >
        <title>{label}</title>
        <defs>
          <linearGradient id={fillId} x2="0" y2="1">
            <stop stopColor={series[0].color} stopOpacity={0.2} />
            <stop offset="1" stopColor={series[0].color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
          const value = low + (high - low) * fraction;
          return (
            <g key={fraction}>
              <line
                x1={left}
                x2={right}
                y1={y(value)}
                y2={y(value)}
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeDasharray="3 4"
              />
              <text
                x={right + 8}
                y={y(value)}
                dominantBaseline="middle"
                fill="currentColor"
                fontSize="10"
              >
                {formatValue(value)}
              </text>
            </g>
          );
        })}
        {Array.from({ length: tickCount }, (_, index) => {
          const time = first + ((last - first) * index) / (tickCount - 1);
          return (
            <text
              key={index}
              x={x(time)}
              y={bottom + 18}
              fontSize="10"
              fill="currentColor"
              textAnchor={
                index === 0
                  ? "start"
                  : index === tickCount - 1
                    ? "end"
                    : "middle"
              }
            >
              {formatTime(time)}
            </text>
          );
        })}
        {reference !== undefined && reference >= low && reference <= high && (
          <line
            x1={left}
            x2={right}
            y1={y(reference)}
            y2={y(reference)}
            stroke="#94a3b8"
            strokeDasharray="4 4"
          />
        )}
        {series.map(({ label: name, color, values }) => {
          const path = values
            .map((value, index) => {
              const px = x(times[index]);
              const py = y(value);
              if (!index) return `M${px},${py}`;
              return step ? `H${px}V${py}` : `L${px},${py}`;
            })
            .join("");
          return (
            <g key={name}>
              {!step && (
                <path
                  d={`${path}L${x(times.at(-1)!)},${bottom}H${left}Z`}
                  fill={`url(#${fillId})`}
                />
              )}
              <path d={path} fill="none" stroke={color} strokeWidth={2} />
              {values.length === 1 && (
                <circle cx={left} cy={y(values[0])} r={3} fill={color} />
              )}
            </g>
          );
        })}
        {active !== null && (
          <g pointerEvents="none">
            <line
              x1={x(times[active])}
              x2={x(times[active])}
              y1={top}
              y2={bottom}
              stroke="#64748b"
              strokeDasharray="4 4"
            />
            {series.map(line => (
              <circle
                key={line.label}
                cx={x(times[active])}
                cy={y(line.values[active])}
                r={3}
                fill={line.color}
              />
            ))}
          </g>
        )}
      </svg>
      {active !== null && (
        <div
          role="status"
          className="absolute top-3 right-16 pointer-events-none bg-card border border-border rounded-lg p-2 text-xs shadow-sm"
        >
          <strong>{formatTime(times[active])}</strong>
          {series.map(line => (
            <div key={line.label}>
              {line.label} · {formatValue(line.values[active])}
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}
