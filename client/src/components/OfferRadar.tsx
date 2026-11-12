import { useId, useState } from "react";
import type { GpuOffer } from "@shared/catalog";

const metrics = [
  { label: "USD / GPU-hour", read: (offer: GpuOffer) => offer.pricePerGpuHr },
  { label: "VRAM / GPU", read: (offer: GpuOffer) => offer.vramPerGpuGb },
  {
    label: "GPUs / node",
    read: (offer: GpuOffer) =>
      offer.configurationKnown === false ? null : offer.gpuCount,
  },
  {
    label: "USD / node-hour",
    read: (offer: GpuOffer) =>
      offer.configurationKnown === false ? null : offer.totalNodePriceHr,
  },
  { label: "vCPUs", read: (offer: GpuOffer) => offer.vcpus },
  { label: "System RAM", read: (offer: GpuOffer) => offer.ramGb },
];

const seriesStyles = [
  { color: "#62e4fa", dash: undefined },
  { color: "#ffc18f", dash: "8 4" },
  { color: "#c4b5fd", dash: "2 5" },
];
const centerX = 240;
const centerY = 155;
const chartRadius = 108;

function point(index: number, ratio: number) {
  const angle = (index / metrics.length) * 2 * Math.PI - Math.PI / 2;
  return [
    centerX + chartRadius * ratio * Math.cos(angle),
    centerY + chartRadius * ratio * Math.sin(angle),
  ] as const;
}

function ring(ratio: number) {
  return metrics.map((_, index) => point(index, ratio).join(",")).join(" ");
}

export function OfferRadar({ offers }: { offers: GpuOffer[] }) {
  const id = useId();
  const [hidden, setHidden] = useState<string[]>([]);
  const hiddenIds = offers.every(o => hidden.includes(o.offerId)) ? [] : hidden;
  const visibleCount = offers.filter(
    o => !hiddenIds.includes(o.offerId)
  ).length;
  const axes = metrics.map(metric => {
    const values = offers.map(metric.read);
    return {
      label: metric.label,
      values,
      max: Math.max(0, ...values.map(value => value ?? 0)),
    };
  });

  return (
    <figure className="comparison-radar">
      <div className="comparison-radar__heading">
        <h3 className="text-lg font-semibold">Offer profile</h3>
        <p>
          Each axis scales to the largest selected value. Shorter price spokes
          are cheaper. Gaps indicate missing specs.
        </p>
      </div>
      <svg
        viewBox="0 0 480 310"
        role="img"
        aria-labelledby={`${id}-title ${id}-desc`}
        className="comparison-radar__plot"
      >
        <title id={`${id}-title`}>
          Radial comparison of selected GPU offers
        </title>
        <desc id={`${id}-desc`}>
          Six axes compare prices and hardware specifications. Exact values are
          in the table below.
        </desc>
        <g fill="none" stroke="#7795b6" strokeOpacity={0.36}>
          {[0.25, 0.5, 0.75, 1].map(ratio => (
            <polygon key={ratio} points={ring(ratio)} />
          ))}
          {axes.map(({ label }, index) => {
            const [x, y] = point(index, 1);
            return <line key={label} x1={centerX} y1={centerY} x2={x} y2={y} />;
          })}
        </g>
        {axes.map(({ label, max }, index) => {
          const vertical = index === 0 || index === 3;
          const [x, y] = point(index, vertical ? 1.24 : 1.13);
          const anchor = vertical ? "middle" : index < 3 ? "start" : "end";
          return (
            <text
              key={label}
              x={x}
              y={y}
              textAnchor={anchor}
              dominantBaseline="middle"
              fill={max === 0 ? "#a9bacd" : "#edf5ff"}
              fontSize={15}
            >
              {label}
            </text>
          );
        })}
        {offers.map((offer, seriesIndex) => {
          if (hiddenIds.includes(offer.offerId)) return null;
          const { color, dash } = seriesStyles[seriesIndex];
          const points = axes.map(({ values, max }, index) => {
            const value = values[seriesIndex];
            return value === null || max === 0
              ? null
              : point(index, value / max);
          });
          const complete = points.every(p => p !== null);
          return (
            <g
              key={offer.offerId}
              data-series={offer.offerId}
              stroke={color}
              strokeWidth={2}
            >
              {complete && (
                <polygon
                  points={points.map(p => p.join(",")).join(" ")}
                  fill={color}
                  fillOpacity={0.08}
                  stroke="none"
                />
              )}
              {points.map((p, index) => {
                if (!p) return null;
                const next = points[(index + 1) % points.length];
                return (
                  <g key={axes[index].label} data-metric={axes[index].label}>
                    {next && (
                      <line
                        x1={p[0]}
                        y1={p[1]}
                        x2={next[0]}
                        y2={next[1]}
                        strokeDasharray={dash}
                      />
                    )}
                    <circle
                      cx={p[0]}
                      cy={p[1]}
                      r={3 + seriesIndex}
                      fill="#132337"
                    >
                      <title>
                        {offer.providerName} · {axes[index].label} ·{" "}
                        {axes[index].values[seriesIndex]}
                      </title>
                    </circle>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      <figcaption
        className="comparison-radar__legend"
        aria-label="Visible offer series"
      >
        {offers.map((offer, index) => {
          const isVisible = !hiddenIds.includes(offer.offerId);
          const { color } = seriesStyles[index];
          return (
            <button
              key={offer.offerId}
              type="button"
              aria-pressed={isVisible}
              disabled={isVisible && visibleCount === 1}
              onClick={() =>
                setHidden(
                  isVisible
                    ? [...hiddenIds, offer.offerId]
                    : hiddenIds.filter(id => id !== offer.offerId)
                )
              }
            >
              <span className="font-data" style={{ color }}>
                {index + 1}
              </span>
              {offer.providerName}
            </button>
          );
        })}
      </figcaption>
    </figure>
  );
}
