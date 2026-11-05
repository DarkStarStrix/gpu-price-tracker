import { useState, useMemo, useEffect } from "react";
import { Play, Pause, SkipForward } from "lucide-react";
import { catalog } from "@/lib/catalog";
import { getProvider } from "@/lib/data";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";

const COLORS = [
  "#1596a5",
  "#e28050",
  "#456db7",
  "#559575",
  "#b69032",
  "#9765bd",
  "#c66484",
  "#61849a",
];
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
export function PriceTrends() {
  const [billing, setBilling] = useState("spot");
  const [selectedGpu, setSelectedGpu] = useState("h100-sxm");
  const models = [
    ...new Set(
      catalog.history
        .filter(h => (h.billingModel ?? "on-demand") === billing)
        .map(h => h.gpuModelId)
    ),
  ].sort();
  const gpu = models.includes(selectedGpu) ? selectedGpu : models[0];
  const { data, names, times } = useMemo(() => {
    const history = catalog.history.filter(
      h => h.gpuModelId === gpu && (h.billingModel ?? "on-demand") === billing
    );
    const times = [...new Set(history.map(h => Date.parse(h.observedAt)))].sort(
      (a, b) => a - b
    );
    const points = new Map(
      times.map(time => [time, { time } as Record<string, number>])
    );
    for (const h of history)
      points.get(Date.parse(h.observedAt))![h.offerId] = h.pricePerGpuHr;
    return {
      data: [...points.values()],
      times,
      names: [...new Set(history.map(h => h.offerId))],
    };
  }, [gpu, billing, catalog.history]);
  const replay = useReplay(times.length, `${gpu}:${billing}`);
  const reducedMotion =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
        <div>
          <h3 className="font-semibold">Price movement</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Seven days of recorded USD / GPU-hour prices
          </p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Price billing model"
            className="bg-card border border-border rounded-md p-2 text-xs"
            value={billing}
            onChange={e => setBilling(e.target.value)}
          >
            <option value="on-demand">On-demand</option>
            <option value="spot">Spot · interruptible</option>
          </select>
          <select
            aria-label="Chart GPU model"
            className="bg-card border border-border rounded-md p-2 text-xs"
            value={gpu ?? ""}
            onChange={e => setSelectedGpu(e.target.value)}
          >
            {models.map(id => (
              <option key={id} value={id}>
                {`${catalog.offers.find(o => o.gpuModelId === id)?.gpuModelName ?? id} · ${id}`}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-sm)]">
        <ReplayControls replay={replay} times={times} />
        {times.length < 2 ? (
          <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
            Waiting for two verified observations of this GPU.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <LineChart
              data={data.slice(0, replay.index + 1)}
              margin={{ top: 12, right: 20, bottom: 4, left: 4 }}
            >
              <CartesianGrid
                strokeDasharray="4 4"
                vertical={false}
                stroke="#e5e6e2"
              />
              <XAxis
                dataKey="time"
                type="number"
                domain={[times[0], times[times.length - 1]]}
                tickFormatter={timeLabel}
                tick={{ fontSize: 10 }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => `$${v.toFixed(1)}`}
                tick={{ fontSize: 10 }}
                width={44}
                domain={[
                  0,
                  Math.ceil(
                    Math.max(
                      ...catalog.history
                        .filter(
                          h =>
                            h.gpuModelId === gpu &&
                            (h.billingModel ?? "on-demand") === billing
                        )
                        .map(h => h.pricePerGpuHr)
                    ) * 1.1
                  ),
                ]}
              />
              <Tooltip
                labelFormatter={v => timeLabel(Number(v))}
                formatter={(v: number) => `$${v.toFixed(3)} / GPU-hr`}
                contentStyle={{ borderRadius: 10, fontSize: 11 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                iconType="line"
              />
              {!replay.live && (
                <ReferenceLine
                  x={times[replay.index]}
                  stroke="#1596a5"
                  strokeDasharray="4 4"
                />
              )}
              {names.map((id, i) => {
                const o = catalog.offers.find(o => o.offerId === id);
                return (
                  <Line
                    key={id}
                    dataKey={id}
                    name={
                      o
                        ? `${o.providerName} · ${o.region} · ${o.cloudType}`
                        : id
                    }
                    type="linear"
                    connectNulls={false}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={data.length < 4}
                    isAnimationActive={!replay.playing && !reducedMotion}
                    animationDuration={300}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
        <p className="text-xs text-muted-foreground mt-4">
          {billing === "spot"
            ? "Nebius history uses the provider’s last price in each hourly interval, timestamped at interval end. Spot instances are interruptible; availability is unknown."
            : "Collector observations only. Gaps remain gaps; unchanged prices remain flat."}{" "}
          Replay advances recorded timestamps, not a forecast.
        </p>
      </div>
      <PoolMovement />
    </section>
  );
}
function PoolMovement() {
  const [provider, setProvider] = useState("runpod");
  const pool = catalog.poolHistory ?? [];
  const data = pool
    .filter(p => p.providerId === provider)
    .sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const times = data.map(p => Date.parse(p.observedAt));
  const replay = useReplay(times.length, provider);
  const selected = data[replay.index];
  const source = catalog.sources.find(s => s.id === provider);
  return (
    <div className="bg-card border border-border rounded-xl p-5 mt-6 shadow-[var(--shadow-sm)]">
      <div className="flex justify-between items-center gap-4 mb-4">
        <div>
          <h3 className="font-semibold">Shifting offer pool</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Listing turnover and reported availability between successful
            refreshes
          </p>
        </div>
        <select
          aria-label="Pool provider"
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
        <ResponsiveContainer width="100%" height={250}>
          <LineChart
            data={data
              .slice(0, replay.index + 1)
              .map(p => ({ ...p, time: Date.parse(p.observedAt) }))}
          >
            <CartesianGrid
              vertical={false}
              strokeDasharray="4 4"
              stroke="#e5e6e2"
            />
            <XAxis
              dataKey="time"
              type="number"
              domain={[times[0], times[times.length - 1]]}
              tickFormatter={timeLabel}
              tick={{ fontSize: 10 }}
            />
            <YAxis allowDecimals={false} width={36} tick={{ fontSize: 10 }} />
            <Tooltip
              labelFormatter={v => timeLabel(Number(v))}
              contentStyle={{ borderRadius: 10, fontSize: 11 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {(["available", "limited", "unavailable", "unknown"] as const).map(
              (key, i) => (
                <Line
                  key={key}
                  dataKey={key}
                  name={key}
                  type="stepAfter"
                  stroke={COLORS[i]}
                  strokeWidth={2}
                  dot={data.length < 4}
                  isAnimationActive={false}
                />
              )
            )}
          </LineChart>
        </ResponsiveContainer>
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
