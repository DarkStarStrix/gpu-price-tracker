import { useMemo, useState } from "react";
import { getProvider } from "@/lib/data";
import { marketSeries, marketStats, movingListingIds } from "@shared/market";
import { billingLabel, cloudLabel } from "@shared/offer-view";
import { isCurrent, type GpuOffer, type Snapshot } from "@shared/catalog";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { TimeSeriesPlot } from "./TimeSeriesPlot";
const date = (t: number) =>
  new Date(t).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export function PriceMarket({
  initialOfferId = "",
  snapshot: catalog,
}: {
  initialOfferId?: string;
  snapshot: Snapshot;
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
    [moversOnly, setMoversOnly] = useState(false),
    [hover, setHover] = useState<{ time: number; price: number } | null>(null);
  const windowEnd = useMemo(() => Date.now(), [catalog, hours, moversOnly]);
  const windowStart = windowEnd - hours * 3600000;
  const { models, currentOffers, pastOffers } = useMemo(() => {
    const moved = moversOnly
      ? movingListingIds(catalog, windowStart, windowEnd)
      : undefined;
    const matches = (offer: Pick<GpuOffer, "offerId" | "billingModel">) =>
      (offer.billingModel ?? "on-demand") === billing &&
      (!moved || moved.has(offer.offerId));
    const currentOffers = catalog.offers.filter(matches);
    const currentIds = new Set(currentOffers.map(offer => offer.offerId));
    const historical = new Map<string, Snapshot["history"][number]>();
    for (const point of catalog.history) {
      if (!currentIds.has(point.offerId) && matches(point))
        historical.set(point.offerId, point);
    }
    const pastOffers = [...historical.values()];
    const models = [
      ...new Set(
        [...currentOffers, ...pastOffers].map(offer => offer.gpuModelId)
      ),
    ].sort();
    return { models, currentOffers, pastOffers };
  }, [catalog, billing, moversOnly, windowStart, windowEnd]);
  const model = models.includes(gpu) ? gpu : models[0];
  const listings = useMemo(
    () =>
      currentOffers
        .filter(offer => offer.gpuModelId === model)
        .sort((a, b) => a.pricePerGpuHr - b.pricePerGpuHr),
    [currentOffers, model]
  );
  const offer =
    listings.find(o => o.offerId === selected) ??
    listings.find(
      o => isCurrent(catalog, o) && o.availability !== "unavailable"
    ) ??
    listings[0];
  const historical = pastOffers.filter(offer => offer.gpuModelId === model);
  const historicalChoice = historical.find(h => h.offerId === selected);
  const chartId =
    historicalChoice?.offerId ?? offer?.offerId ?? historical[0]?.offerId;
  const points = useMemo(
    () =>
      chartId ? marketSeries(catalog, chartId, windowStart, windowEnd) : [],
    [catalog, chartId, windowStart, windowEnd]
  );
  const stats = marketStats(points);
  const color = (stats?.change ?? 0) >= 0 ? "#059669" : "#dc2626";
  const headline = hover?.price ?? stats?.last;
  let changeLabel;
  if (stats && stats.count > 1) {
    if (stats.high === stats.low) {
      changeLabel = "Unchanged in this range";
    } else if (stats.change === 0) {
      changeLabel = "0.00% net · varied in this range";
    } else {
      changeLabel = `${stats.change > 0 ? "+" : ""}${stats.change.toFixed(3)} (${stats.percent.toFixed(2)}%)`;
    }
  }
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
            disabled={!models.length}
            onChange={e => {
              setGpu(e.target.value);
              reset();
            }}
          >
            {!models.length && <option value="">No matching GPUs</option>}
            {models.map(id => (
              <option key={id} value={id}>
                {id.toUpperCase()}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded border border-border bg-background px-2 py-1.5 text-xs">
            <input
              type="checkbox"
              className="accent-teal"
              checked={moversOnly}
              onChange={event => {
                setMoversOnly(event.target.checked);
                setHover(null);
              }}
            />
            Price movers only
          </label>
        </div>
      </div>
      <select
        aria-label="Historical listing"
        value={chartId ?? ""}
        disabled={!chartId}
        onChange={e => {
          setSelected(e.target.value);
          setHover(null);
        }}
        className="mt-4 w-full border border-border bg-background rounded p-2 text-xs"
      >
        {!chartId && <option value="">No matching listings</option>}
        {listings.map(o => (
          <option key={o.offerId} value={o.offerId}>
            {o.providerName} · {o.region} · {cloudLabel(o)} ·{" "}
            {o.configurationKnown === false
              ? "Per-GPU rate"
              : `${o.gpuCount}× GPU / ${o.vcpus ?? "—"} vCPU / ${o.ramGb ?? "—"} GB RAM`}{" "}
            · ${o.pricePerGpuHr.toFixed(3)}{" "}
            {isCurrent(catalog, o)
              ? "current quoted rate"
              : "last observed rate"}
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
          <div className="flex flex-wrap gap-x-3 items-baseline">
            <strong className="font-data text-3xl tabular-nums">
              {headline !== undefined ? `$${headline.toFixed(3)}` : "—"}
            </strong>
            {changeLabel && (
              <span
                className="text-sm font-data"
                style={{ color: stats?.change ? color : undefined }}
              >
                {changeLabel}
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
              aria-pressed={hours === value}
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
        <MarketPlot
          key={`${chartId}:${hours}`}
          points={points}
          color={color}
          stats={stats!}
          onInspect={setHover}
        />
      ) : (
        <div className="h-60 flex items-center justify-center text-muted-foreground text-sm">
          {moversOnly && !chartId
            ? "No recorded price moves for this billing type in the selected period."
            : points.length === 1
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
        Collection is scheduled every 15 minutes. The page checks for new
        snapshots every minute.
      </p>
    </div>
  );
}

function MarketPlot({
  points,
  color,
  stats,
  onInspect,
}: {
  points: ReturnType<typeof marketSeries>;
  color: string;
  stats: NonNullable<ReturnType<typeof marketStats>>;
  onInspect: (point: { time: number; price: number } | null) => void;
}) {
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState<number | null>(null);
  const first = Math.min(start, points.length - 2);
  const last = Math.max(
    first + 1,
    Math.min(end ?? points.length - 1, points.length - 1)
  );
  const visible = points.slice(first, last + 1);
  const formatPrice = (value: number) => `$${value.toFixed(3)}`;
  return (
    <>
      <TimeSeriesPlot
        label="Recorded price in USD per GPU-hour. Use the arrow keys to inspect samples."
        times={visible.map(point => point.time)}
        series={[
          {
            label: "Recorded price",
            color,
            values: visible.map(point => point.price),
          },
        ]}
        domain={[
          Math.max(0, stats.low - Math.max(stats.low * 0.04, 0.01)),
          stats.high + Math.max(stats.high * 0.04, 0.01),
        ]}
        height={285}
        formatTime={date}
        formatValue={formatPrice}
        reference={stats.first}
        onInspect={index => onInspect(index === null ? null : visible[index])}
      />
      <div className="grid grid-cols-2 gap-4 mt-1 text-xs text-muted-foreground">
        <label>
          Chart start
          <input
            type="range"
            min={0}
            max={points.length - 2}
            value={first}
            aria-valuetext={date(points[first].time)}
            onChange={event => {
              const next = Number(event.target.value);
              setStart(next);
              if (next >= last) setEnd(next + 1);
              onInspect(null);
            }}
            className="trend-range w-full"
          />
        </label>
        <label>
          Chart end
          <input
            type="range"
            min={1}
            max={points.length - 1}
            value={last}
            aria-valuetext={date(points[last].time)}
            onChange={event => {
              const value = Number(event.target.value);
              setEnd(value === points.length - 1 ? null : value);
              if (value <= first) setStart(value - 1);
              onInspect(null);
            }}
            className="trend-range w-full"
          />
        </label>
      </div>
    </>
  );
}
