/*
  PriceTrends — Historical price chart for selected GPU models
  Data Observatory design: clean line chart with Tufte-inspired minimal axes
*/

import { useState, useMemo } from "react";
import { GPU_MODELS, PROVIDERS, OFFERS, getSparkline, formatPrice } from "@/lib/data";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

const CHART_GPUS = ["h100-sxm", "a100-sxm-80", "rtx-4090"];
const CHART_COLORS = [
  "oklch(0.65 0.18 220)",  // teal
  "oklch(0.7 0.17 45)",    // coral
  "oklch(0.55 0.15 250)",  // navy
  "oklch(0.65 0.2 150)",   // green
  "oklch(0.7 0.17 80)",    // amber
];

const DAY_LABELS = ["7d ago", "6d", "5d", "4d", "3d", "2d", "1d", "12h", "10h", "8h", "6h", "4h", "2h", "Now"];

export function PriceTrends() {
  const [selectedGpu, setSelectedGpu] = useState("h100-sxm");

  const chartData = useMemo(() => {
    const gpuOffers = OFFERS.filter(o => o.gpuModelId === selectedGpu);

    // Build data points for each provider
    const providerData: Record<string, number[]> = {};
    for (const offer of gpuOffers) {
      if (!providerData[offer.providerId]) {
        providerData[offer.providerId] = getSparkline(offer.id, offer.pricePerGpuHr);
      }
    }

    // Build chart rows
    return DAY_LABELS.map((label, i) => {
      const point: Record<string, string | number> = { time: label };
      for (const [providerId, prices] of Object.entries(providerData)) {
        const provider = PROVIDERS.find(p => p.id === providerId);
        if (provider && prices[i] !== undefined) {
          point[provider.name] = prices[i];
        }
      }
      return point;
    });
  }, [selectedGpu]);

  const providerNames = useMemo(() => {
    const gpuOffers = OFFERS.filter(o => o.gpuModelId === selectedGpu);
    const ids = Array.from(new Set(gpuOffers.map(o => o.providerId)));
    return ids.map(id => PROVIDERS.find(p => p.id === id)?.name).filter(Boolean) as string[];
  }, [selectedGpu]);

  const gpuModel = GPU_MODELS.find(g => g.id === selectedGpu);

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Price Trends</h2>
          <p className="text-sm text-muted-foreground mt-1">7-day price history by provider for {gpuModel?.name ?? "selected GPU"}</p>
        </div>
        <div className="flex gap-1.5">
          {CHART_GPUS.map(gpuId => {
            const gpu = GPU_MODELS.find(g => g.id === gpuId);
            return (
              <button
                key={gpuId}
                onClick={() => setSelectedGpu(gpuId)}
                className={`px-3 py-1.5 text-xs font-data rounded-md border transition-colors ${
                  selectedGpu === gpuId
                    ? "bg-[oklch(0.65_0.18_220_/_0.1)] border-[oklch(0.65_0.18_220_/_0.3)] text-[oklch(0.45_0.14_220)]"
                    : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {gpu?.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-md p-4">
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 90)" />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fill: "oklch(0.5 0.03 250)" }}
              axisLine={{ stroke: "oklch(0.9 0.008 90)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", fill: "oklch(0.5 0.03 250)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `$${v.toFixed(1)}`}
              width={48}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "oklch(0.99 0.003 90)",
                border: "1px solid oklch(0.9 0.008 90)",
                borderRadius: "6px",
                fontSize: "12px",
                fontFamily: "'IBM Plex Mono', monospace",
                boxShadow: "0 2px 8px oklch(0.25 0.04 250 / 0.08)",
              }}
              formatter={(value: number) => [formatPrice(value), ""]}
              labelStyle={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, marginBottom: 4 }}
            />
            <Legend
              wrapperStyle={{ fontSize: "11px", fontFamily: "'DM Sans', sans-serif" }}
              iconType="line"
            />
            {providerNames.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
