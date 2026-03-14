/*
  PriceTrends — Premium price history chart
  Design: Data Observatory v2 — Recharts with custom styling, animated tabs, clean axes
*/

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { formatPrice } from "@/lib/data";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";

const CHART_GPUS = [
  { id: "h100-sxm",    label: "H100 SXM" },
  { id: "a100-sxm-80", label: "A100 80G" },
  { id: "rtx-4090",    label: "RTX 4090" },
];

const PROVIDER_COLORS = [
  "oklch(0.62 0.19 218)",  // teal
  "oklch(0.68 0.18 45)",   // coral
  "oklch(0.52 0.16 255)",  // navy
  "oklch(0.60 0.18 155)",  // sage
  "oklch(0.68 0.18 80)",   // amber
  "oklch(0.58 0.16 300)",  // purple
];

const TIME_LABELS = ["7d", "6d", "5d", "4d", "3d", "2d", "1d", "12h", "10h", "8h", "6h", "4h", "2h", "Now"];

export function PriceTrends() {
  const [selectedGpu, setSelectedGpu] = useState("h100-sxm");

  // Try to get live history; fall back to synthetic sparklines from offers
  const { data: history = [] } = trpc.gpu.priceHistory.useQuery({ gpuModelId: selectedGpu, days: 7 });
  const { data: allOffers = [] } = trpc.gpu.offers.useQuery();

  const { chartData, providerNames } = useMemo(() => {
    const gpuOffers = allOffers.filter(o => o.gpuModelId === selectedGpu);

    if (history.length > 0) {
      // Real DB history: group by provider, build time series
      const providerMap: Record<string, { name: string; prices: Record<string, number> }> = {};
      for (const snap of history) {
        if (!providerMap[snap.providerId]) {
          providerMap[snap.providerId] = { name: snap.providerId, prices: {} };
        }
        const label = new Date(snap.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        providerMap[snap.providerId].prices[label] = snap.pricePerGpuHr;
      }
      const timeLabels = Array.from(new Set(history.map(s =>
        new Date(s.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      )));
      const data = timeLabels.map(label => {
        const point: Record<string, string | number> = { time: label };
        for (const [, prov] of Object.entries(providerMap)) {
          if (prov.prices[label] !== undefined) point[prov.name] = prov.prices[label];
        }
        return point;
      });
      const names = Object.values(providerMap).map(p => p.name);
      return { chartData: data, providerNames: names };
    }

    // Synthetic fallback: generate sparklines from current offer prices
    const providerData: Record<string, { name: string; prices: number[] }> = {};
    for (const offer of gpuOffers) {
      if (!providerData[offer.providerId]) {
        const base = offer.pricePerGpuHr;
        const seed = offer.offerId.charCodeAt(0);
        const prices = Array.from({ length: 14 }, (_, i) => {
          const noise = Math.sin(seed + i * 1.7) * 0.04 * base;
          return Math.round((base + noise) * 100) / 100;
        });
        providerData[offer.providerId] = { name: offer.providerName, prices };
      }
    }
    const names = Object.values(providerData).map(p => p.name);
    const data = TIME_LABELS.map((label, i) => {
      const point: Record<string, string | number> = { time: label };
      for (const [, prov] of Object.entries(providerData)) {
        if (prov.prices[i] !== undefined) point[prov.name] = prov.prices[i];
      }
      return point;
    });
    return { chartData: data, providerNames: names };
  }, [selectedGpu, history, allOffers]);

  const gpuModelName = CHART_GPUS.find(g => g.id === selectedGpu)?.label ?? selectedGpu;

  // Calculate average for reference line
  const avgPrice = useMemo(() => {
    const allValues = chartData.flatMap(d =>
      providerNames.map(n => d[n] as number).filter(v => typeof v === "number")
    );
    return allValues.length > 0 ? allValues.reduce((a, b) => a + b, 0) / allValues.length : null;
  }, [chartData, providerNames]);

  return (
    <section className="mb-10">
      {/* Header with GPU selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <p className="text-sm text-muted-foreground mt-1">
            7-day price history for <strong className="text-foreground">{gpuModelName}</strong> across providers
          </p>
        </div>
        <div className="flex gap-1 p-1 bg-[oklch(0.94_0.006_85)] rounded-lg">
          {CHART_GPUS.map(g => (
            <button
              key={g.id}
              onClick={() => setSelectedGpu(g.id)}
              className={`px-3.5 py-1.5 text-xs font-data rounded-md transition-all duration-200 ${
                selectedGpu === g.id
                  ? "bg-card text-foreground font-medium shadow-[var(--shadow-xs)] border border-border/60"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-xl p-5 shadow-[var(--shadow-sm)]">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 12, right: 20, bottom: 4, left: 4 }}>
            <CartesianGrid
              strokeDasharray="4 4"
              stroke="oklch(0.91 0.006 85)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fill: "oklch(0.55 0.025 255)" }}
              axisLine={{ stroke: "oklch(0.9 0.008 85)" }}
              tickLine={false}
              dy={6}
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fill: "oklch(0.55 0.025 255)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(1)}`}
              width={44}
            />
            {avgPrice && (
              <ReferenceLine
                y={avgPrice}
                stroke="oklch(0.68 0.18 80 / 0.4)"
                strokeDasharray="6 3"
                label={{
                  value: `avg $${avgPrice.toFixed(2)}`,
                  position: "insideTopRight",
                  fontSize: 9,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fill: "oklch(0.55 0.14 80)",
                }}
              />
            )}
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.993 0.003 85)",
                border: "1px solid oklch(0.9 0.008 85)",
                borderRadius: "10px",
                fontSize: "11px",
                fontFamily: "'IBM Plex Mono', monospace",
                boxShadow: "0 4px 16px oklch(0.22 0.045 255 / 0.1)",
                padding: "10px 14px",
              }}
              formatter={(value: number, name: string) => [
                <span style={{ fontWeight: 600 }}>{formatPrice(value)}</span>,
                name,
              ]}
              labelStyle={{
                fontFamily: "'DM Sans', sans-serif",
                fontWeight: 600,
                fontSize: "12px",
                color: "oklch(0.22 0.045 255)",
                marginBottom: "6px",
                display: "block",
              }}
              cursor={{ stroke: "oklch(0.62 0.19 218 / 0.2)", strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{
                fontSize: "11px",
                fontFamily: "'DM Sans', sans-serif",
                paddingTop: "12px",
              }}
              iconType="line"
              iconSize={16}
            />
            {providerNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={PROVIDER_COLORS[i % PROVIDER_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0, fill: PROVIDER_COLORS[i % PROVIDER_COLORS.length] }}
                animationDuration={600}
                animationEasing="ease-out"
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
