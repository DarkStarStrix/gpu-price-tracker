import { useState } from "react";
import { getProvider } from "@/lib/data";
import { catalog } from "@/lib/catalog";
import { marketSeries, marketStats } from "@shared/market";
import { billingLabel, cloudLabel } from "@shared/offer-view";
import { isCurrent } from "@shared/catalog";
import { AvailabilityBadge } from "./AvailabilityBadge";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Brush,
} from "recharts";
const date = (t: number) =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function PriceMarket({
  initialOfferId = "",
}: {
  initialOfferId?: string;
}) {
  const initial =
    catalog.offers.find(o => o.offerId === initialOfferId) ??
    catalog.history.find(o => o.offerId === initialOfferId);
  const [gpu, setGpu] = useState(initial?.gpuModelId ?? "h100-sxm"),
    [billing, setBilling] = useState<string>(
      initial?.billingModel ?? "on-demand"
    ),
    [selected, setSelected] = useState(initialOfferId),
    [hours, setHours] = useState(168),
    [hover, setHover] = useState<{ time: number; price: number } | null>(null);
  const models = [
    ...new Set(
      [...catalog.offers, ...catalog.history]
        .filter(o => (o.billingModel ?? "on-demand") === billing)
        .map(o => o.gpuModelId)
    ),
  ].sort();
  const model = models.includes(gpu) ? gpu : models[0];
  const listings = catalog.offers
    .filter(
      o => o.gpuModelId === model && (o.billingModel ?? "on-demand") === billing
    )
    .sort((a, b) => a.pricePerGpuHr - b.pricePerGpuHr);
  const offer =
    listings.find(o => o.offerId === selected) ??
    listings.find(
      o => isCurrent(catalog, o) && o.availability !== "unavailable"
    ) ??
    listings[0];
  const historical = [
    ...new Map(
      catalog.history
        .filter(
          h =>
            h.gpuModelId === model &&
            (h.billingModel ?? "on-demand") === billing &&
            !listings.some(o => o.offerId === h.offerId)
        )
        .map(h => [h.offerId, h])
    ).values(),
  ];
  const historicalChoice = historical.find(h => h.offerId === selected);
  const chartId =
    historicalChoice?.offerId ?? offer?.offerId ?? historical[0]?.offerId;
  const points = chartId
    ? marketSeries(catalog, chartId, Date.now() - hours * 3600000)
    : [];
  const stats = marketStats(points);
  const color = (stats?.change ?? 0) >= 0 ? "#059669" : "#dc2626";
  const headline = hover?.price ?? stats?.last;
  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reset = () => {
    setHover(null);
    setSelected("");
  };
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm mb-6">
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="text-[10px] font-data text-muted-foreground tracking-widest uppercase">
            GPU market tape · USD / GPU-hour
          </p>
          <h3 className="font-semibold text-xl mt-1">
            {model?.replaceAll("-", " ").toUpperCase() ?? "Price history"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            One listing, real timestamps. Automatic snapshot updates.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Price billing model"
            className="border border-border rounded bg-background p-2 text-xs"
            value={billing}
            onChange={e => {
              setBilling(e.target.value);
              reset();
            }}
          >
            <option value="on-demand">On-demand</option>
            <option value="spot">Spot · interruptible</option>
          </select>
          <select
            aria-label="Chart GPU model"
            className="border border-border rounded bg-background p-2 text-xs max-w-60"
            value={model ?? ""}
            onChange={e => {
              setGpu(e.target.value);
              reset();
            }}
          >
            {models.map(id => (
              <option key={id} value={id}>
                {id.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>
      <select
        aria-label="Historical listing"
        value={chartId ?? ""}
        onChange={e => {
          setSelected(e.target.value);
          setHover(null);
        }}
        className="mt-4 w-full border border-border bg-background rounded p-2 text-xs"
      >
        {listings.map(o => (
          <option key={o.offerId} value={o.offerId}>
            {o.providerName} · {o.region} · {cloudLabel(o)} · {o.gpuCount}× · $
            {o.pricePerGpuHr.toFixed(3)} current quoted rate
          </option>
        ))}
        {historical.map(h => (
          <option key={h.offerId} value={h.offerId}>
            {getProvider(h.providerId)?.name ?? h.providerId} · historical /
            removed listing · {h.offerId}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap justify-between gap-4 mt-5 mb-4">
        <div>
          <div className="flex gap-3 items-baseline">
            <strong className="font-data text-3xl">
              {headline !== undefined ? `$${headline.toFixed(3)}` : "—"}
            </strong>
            {stats && stats.count > 1 && (
              <span className="text-sm font-data" style={{ color }}>
                {stats.change >= 0 ? "+" : ""}
                {stats.change.toFixed(3)} ({stats.percent.toFixed(2)}%)
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {hover
              ? date(hover.time)
              : points.length
                ? `Last recorded ${date(points.at(-1)!.time)}`
                : "Waiting for recorded observations"}{" "}
            · change since first sample in range
          </p>
        </div>
        <div className="flex gap-1 items-start">
          {[
            [1, "1H"],
            [24, "24H"],
            [168, "7D"],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => {
                setHours(Number(value));
                setHover(null);
              }}
              className={`px-3 py-2 text-xs font-data rounded border ${hours === value ? "border-teal bg-teal/10 text-teal" : "border-border"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {offer && !historicalChoice && (
        <div className="flex flex-wrap items-center gap-3 mb-4 text-xs">
          <AvailabilityBadge
            providerLink={offer.providerLink}
            state={isCurrent(catalog, offer) ? offer.availability : "unknown"}
          />
          <span className="text-muted-foreground">
            {billingLabel(offer)} · {cloudLabel(offer)}
            {!isCurrent(catalog, offer) ? " · retained / stale quote" : ""}
          </span>
          <a
            className="text-teal underline ml-auto"
            href={offer.providerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open provider ↗
          </a>
        </div>
      )}
      {points.length > 1 ? (
        <ResponsiveContainer width="100%" height={350}>
          <AreaChart
            data={points}
            margin={{ top: 12, right: 16, left: 4, bottom: 4 }}
            onMouseMove={e => {
              const p = e.activePayload?.[0]?.payload;
              if (p) setHover(p);
            }}
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id="marketFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={0.2} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              strokeDasharray="3 4"
              stroke="#e5e7eb"
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={date}
              tick={{ fontSize: 10 }}
              minTickGap={80}
            />
            <YAxis
              orientation="right"
              domain={[
                (v: number) => Math.max(0, v - Math.max(v * 0.04, 0.01)),
                (v: number) => v + Math.max(v * 0.04, 0.01),
              ]}
              tickFormatter={v => `$${v.toFixed(3)}`}
              tick={{ fontSize: 10 }}
              width={68}
            />
            <Tooltip
              labelFormatter={v => date(Number(v))}
              formatter={(v: number) => [
                `$${v.toFixed(3)} / GPU-hour`,
                "Recorded price",
              ]}
              cursor={{ stroke: color, strokeDasharray: "4 4" }}
              contentStyle={{ fontSize: 11, borderRadius: 8 }}
            />
            <ReferenceLine
              y={stats!.first}
              stroke="#94a3b8"
              strokeDasharray="4 4"
            />
            <Area
              dataKey="price"
              type="linear"
              stroke={color}
              strokeWidth={2}
              fill="url(#marketFill)"
              isAnimationActive={!reduced}
              animationDuration={250}
              connectNulls={false}
            />
            <Brush
              dataKey="time"
              height={22}
              tickFormatter={date}
              stroke="#1596a5"
              travellerWidth={6}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          {points.length === 1
            ? "One recorded sample in this range. Widen the range to see history."
            : "No recorded samples in this range."}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-border pt-4 mt-3 text-xs">
        {[
          ["First sample", stats?.first],
          ["Sampled high", stats?.high],
          ["Sampled low", stats?.low],
          ["Observations", stats?.count],
        ].map(([label, v]) => (
          <div key={label}>
            <p className="text-muted-foreground mb-1">{label}</p>
            <strong className="font-data">
              {v === undefined
                ? "—"
                : label === "Observations"
                  ? v
                  : `$${Number(v).toFixed(3)}`}
            </strong>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground mt-4">
        {billing === "spot"
          ? "Nebius spot history includes provider hourly-last prices at completed interval ends. Interruptible pricing is separate from on-demand."
          : "Collector observations from the selected listing. History starts at its first successful collection."}{" "}
        The line connects recorded samples; between-sample prices are unknown.
        No fabricated candles, volume, or price ticks. Flat rates stay flat.
        Collection every 15 minutes; the page checks every minute.
      </p>
    </div>
  );
}
