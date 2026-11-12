import { PriceMarket } from "./PriceMarket";
import { useState, useEffect } from "react";
import { Play, Pause, SkipForward } from "lucide-react";
import type { Snapshot } from "@shared/catalog";
import { getProvider } from "@/lib/data";
import { TimeSeriesPlot } from "./TimeSeriesPlot";

const stockSeries = [
  { key: "available", label: "Available", color: "#16a34a" },
  { key: "limited", label: "Limited", color: "#d97706" },
  { key: "unavailable", label: "Unavailable", color: "#dc2626" },
  { key: "unknown", label: "Stock not reported", color: "#94a3b8" },
] as const;

const timeLabel = (v: number) =>
  new Date(v).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
function useReplay(length: number, identity: string) {
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setCursor(null);
    setPlaying(false);
  }, [identity]);
  const index = Math.min(
    cursor ?? Math.max(0, length - 1),
    Math.max(0, length - 1)
  );
  useEffect(() => {
    if (!playing) return;
    if (index >= length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setCursor(index + 1), 180);
    return () => clearTimeout(timer);
  }, [playing, length, index]);
  return {
    index,
    playing,
    live: cursor === null,
    toggle: () => {
      if (playing) {
        setPlaying(false);
        return;
      }
      if (index >= length - 1) setCursor(0);
      setPlaying(true);
    },
    seek: (n: number) => {
      setPlaying(false);
      setCursor(n);
    },
    latest: () => {
      setPlaying(false);
      setCursor(null);
    },
  };
}
function ReplayControls({
  replay,
  times,
}: {
  replay: ReturnType<typeof useReplay>;
  times: number[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4 text-xs font-data">
      <button
        disabled={times.length < 2}
        onClick={replay.toggle}
        className="flex items-center gap-2 border border-border rounded-md px-3 py-2 disabled:opacity-40"
      >
        {replay.playing ? <Pause size={14} /> : <Play size={14} />}{" "}
        {replay.playing ? "Pause" : "Replay"}
      </button>
      <input
        aria-label="Observation timeline"
        className="flex-1 min-w-24 accent-teal"
        type="range"
        min={0}
        max={Math.max(0, times.length - 1)}
        value={replay.index}
        disabled={times.length < 2}
        onChange={e => replay.seek(Number(e.target.value))}
      />
      <span aria-live="off">
        {times.length ? timeLabel(times[replay.index]) : "Collecting history"}
      </span>
      <button
        onClick={replay.latest}
        className="flex items-center gap-1 text-teal"
      >
        <SkipForward size={14} />
        {replay.live ? "Latest" : "Return to latest"}
      </button>
    </div>
  );
}
export function PriceTrends({
  initialOfferId = "",
  snapshot,
}: {
  initialOfferId?: string;
  snapshot: Snapshot;
}) {
  return (
    <section className="mb-10">
      <PriceMarket initialOfferId={initialOfferId} snapshot={snapshot} />
      <PoolMovement snapshot={snapshot} />
    </section>
  );
}
function PoolMovement({ snapshot: catalog }: { snapshot: Snapshot }) {
  const [provider, setProvider] = useState("runpod");
  const pool = catalog.poolHistory ?? [];
  const data = pool
    .filter(p => p.providerId === provider)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const times = data.map(p => Date.parse(p.observedAt));
  const replay = useReplay(times.length, provider);
  const selected = data[replay.index];
  const visible = data.slice(0, replay.index + 1);
  const series = stockSeries.map(({ key, label, color }) => ({
    label,
    color,
    values: visible.map(point => point[key]),
  }));
  const ceiling = Math.max(
    4,
    Math.ceil(Math.max(...series.flatMap(line => line.values)) / 4) * 4
  );
  const source = catalog.sources.find(s => s.id === provider);
  return (
    <div className="bg-card border border-border rounded-xl p-5 mt-6 shadow-[var(--shadow-sm)]">
      <div className="flex justify-between items-center gap-4 mb-4">
        <div>
          <h3 className="font-semibold">Provider movement timeline</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Listing turnover and reported availability between successful
            refreshes
          </p>
        </div>
        <select
          aria-label="Timeline provider"
          className="bg-card border border-border rounded-md p-2 text-xs"
          value={provider}
          onChange={e => setProvider(e.target.value)}
        >
          {[...new Set(pool.map(p => p.providerId))].map(id => (
            <option key={id} value={id}>
              {getProvider(id)?.name ?? id}
            </option>
          ))}
        </select>
      </div>
      {source?.status !== "ok" && (
        <p className="text-xs text-coral mb-3">
          Refresh failed or source is inactive. Showing the last successful
          observations.
        </p>
      )}
      <ReplayControls replay={replay} times={times} />
      {selected && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5 text-xs font-data">
          {[
            ["Observed listings", selected.total],
            ["Added", selected.baseline ? "Baseline" : `+${selected.added}`],
            [
              "Removed",
              selected.baseline ? "Baseline" : `−${selected.removed}`,
            ],
            [
              "Price changes",
              selected.baseline ? "Baseline" : selected.priceChanges,
            ],
            [
              "Availability changes",
              selected.baseline ? "Baseline" : selected.availabilityChanges,
            ],
          ].map(([label, value]) => (
            <div key={label} className="bg-muted/40 rounded-lg p-3">
              <p className="text-muted-foreground mb-2">{label}</p>
              <strong className="text-lg">{value}</strong>
            </div>
          ))}
        </div>
      )}
      {times.length < 2 ? (
        <p className="py-12 text-sm text-muted-foreground text-center">
          Baseline recorded. Turnover appears after the next successful refresh.
        </p>
      ) : (
        <>
          <TimeSeriesPlot
            key={provider}
            label="Reported listing availability. Use the arrow keys to inspect samples."
            times={times.slice(0, replay.index + 1)}
            timeEnd={times.at(-1)}
            series={series}
            domain={[0, ceiling]}
            height={225}
            formatTime={timeLabel}
            formatValue={String}
            step
          />
          <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {series.map(line => (
              <li key={line.label} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="w-3 h-0.5"
                  style={{ background: line.color }}
                />
                {line.label}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-muted-foreground mt-4">
        Counts describe observed catalog listings, not physical GPUs or global
        capacity. Pricing pages cannot establish stock. Failed refreshes create
        no removal events. Each change count compares with the preceding
        successful snapshot.
      </p>
    </div>
  );
}
