/*
  ComparisonDrawer — GPU side-by-side comparison panel
  Triggered from OffersTable when 2-3 GPUs are selected.
  Shows: spec table, price bars, radar chart (VRAM, reliability, price, availability).
*/

import { useEffect, useRef } from "react";
import { X, Zap, Cpu, MemoryStick, DollarSign, ExternalLink } from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import type { GpuOffer } from "../../../drizzle/schema";

// ─── Provider metadata ────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  lambda:     "oklch(0.62 0.19 218)",
  runpod:     "oklch(0.60 0.18 155)",
  coreweave:  "oklch(0.65 0.18 270)",
  tensordock: "oklch(0.68 0.18 35)",
  fluidstack: "oklch(0.65 0.18 300)",
  paperspace: "oklch(0.62 0.15 195)",
};

const PROVIDER_RELIABILITY: Record<string, number> = {
  lambda:     0.96,
  runpod:     0.91,
  coreweave:  0.97,
  tensordock: 0.82,
  fluidstack: 0.87,
  paperspace: 0.88,
};

// ─── Radar data builder ───────────────────────────────────────────────────────

function buildRadarData(offers: GpuOffer[]) {
  if (offers.length === 0) return [];

  const maxVram  = Math.max(...offers.map(o => o.vramPerGpuGb));
  const maxPrice = Math.max(...offers.map(o => o.pricePerGpuHr));
  const maxVcpus = Math.max(...offers.map(o => o.vcpus || 1));
  const maxRam   = Math.max(...offers.map(o => o.ramGb || 1));

  const axes = ["VRAM", "Price Value", "Reliability", "vCPUs", "RAM", "Availability"];

  return axes.map(axis => {
    const entry: Record<string, number | string> = { axis };
    offers.forEach(o => {
      const key = `${o.providerName} ${o.gpuModelName}`;
      const reliability = PROVIDER_RELIABILITY[o.providerId] ?? 0.85;
      const avail = o.availability === "available" ? 1 : o.availability === "limited" ? 0.5 : 0;

      switch (axis) {
        case "VRAM":
          entry[key] = Math.round((o.vramPerGpuGb / maxVram) * 100);
          break;
        case "Price Value":
          // Inverted: lower price = higher score
          entry[key] = Math.round(((maxPrice - o.pricePerGpuHr) / maxPrice) * 100);
          break;
        case "Reliability":
          entry[key] = Math.round(reliability * 100);
          break;
        case "vCPUs":
          entry[key] = Math.round(((o.vcpus || 0) / maxVcpus) * 100);
          break;
        case "RAM":
          entry[key] = Math.round(((o.ramGb || 0) / maxRam) * 100);
          break;
        case "Availability":
          entry[key] = Math.round(avail * 100);
          break;
      }
    });
    return entry;
  });
}

// ─── Custom Radar Tooltip ─────────────────────────────────────────────────────

function RadarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <div className="font-medium text-foreground mb-1">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground truncate max-w-[120px]">{p.name}</span>
          <span className="font-data text-foreground ml-auto">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Spec Row ─────────────────────────────────────────────────────────────────

function SpecRow({ label, values, format }: {
  label: string;
  values: (string | number)[];
  format?: (v: string | number) => string;
}) {
  const fmt = format ?? String;
  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap font-medium">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="py-2 px-3 text-xs font-data text-foreground text-center">{fmt(v)}</td>
      ))}
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  offers: GpuOffer[];
  onClose: () => void;
}

export function ComparisonDrawer({ offers, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  if (offers.length === 0) return null;

  const radarData = buildRadarData(offers);
  const maxPrice = Math.max(...offers.map(o => o.pricePerGpuHr));

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] bg-[oklch(0.12_0.02_255_/_0.55)] backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-6 animate-fade-in"
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-t-2xl md:rounded-2xl bg-[var(--paper)] border border-border shadow-[0_24px_80px_oklch(0.12_0.02_255_/_0.35)] animate-fade-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border bg-[var(--paper)/95%] backdrop-blur-sm">
          <div>
            <div className="mono-label text-[oklch(0.62_0.19_218)] mb-0.5">Side-by-Side Analysis</div>
            <h2 className="text-lg font-bold text-foreground">
              GPU Comparison
              <span className="ml-2 font-data text-sm text-muted-foreground font-normal">
                {offers.length} selected
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-all duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-8">

          {/* ── Price bars ──────────────────────────────────────────────────── */}
          <div>
            <div className="mono-label text-muted-foreground mb-3">Price per GPU / hr</div>
            <div className="space-y-3">
              {offers.map(o => {
                const color = PROVIDER_COLORS[o.providerId] ?? "oklch(0.62 0.19 218)";
                const pct = (o.pricePerGpuHr / maxPrice) * 100;
                return (
                  <div key={o.offerId} className="flex items-center gap-3">
                    <div className="w-36 text-xs text-muted-foreground truncate">
                      <span className="font-medium text-foreground">{o.providerName}</span>
                      <br />
                      <span className="font-data text-[10px]">{o.gpuModelName}</span>
                    </div>
                    <div className="flex-1 h-6 bg-[oklch(0.93_0.006_85)] rounded-md overflow-hidden">
                      <div
                        className="h-full rounded-md flex items-center px-2 transition-all duration-700"
                        style={{ width: `${pct}%`, background: color, minWidth: "2rem" }}
                      >
                        <span className="font-data text-[10px] text-white font-semibold whitespace-nowrap">
                          ${o.pricePerGpuHr.toFixed(2)}/hr
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Radar chart ─────────────────────────────────────────────────── */}
          <div>
            <div className="mono-label text-muted-foreground mb-3">Multi-Dimensional Analysis</div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} margin={{ top: 8, right: 32, bottom: 8, left: 32 }}>
                  <PolarGrid
                    stroke="oklch(0.85 0.008 85)"
                    strokeDasharray="3 3"
                  />
                  <PolarAngleAxis
                    dataKey="axis"
                    tick={{ fontSize: 10, fill: "oklch(0.55 0.01 85)", fontFamily: "IBM Plex Mono, monospace" }}
                  />
                  <Tooltip content={<RadarTooltip />} />
                  {offers.map(o => {
                    const color = PROVIDER_COLORS[o.providerId] ?? "oklch(0.62 0.19 218)";
                    const key = `${o.providerName} ${o.gpuModelName}`;
                    return (
                      <Radar
                        key={o.offerId}
                        name={key}
                        dataKey={key}
                        stroke={color}
                        fill={color}
                        fillOpacity={0.12}
                        strokeWidth={2}
                        dot={{ r: 3, fill: color }}
                      />
                    );
                  })}
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {offers.map(o => {
                const color = PROVIDER_COLORS[o.providerId] ?? "oklch(0.62 0.19 218)";
                return (
                  <div key={o.offerId} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                    <span className="text-xs text-muted-foreground">
                      {o.providerName} <span className="font-data">{o.gpuModelName}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Spec table ──────────────────────────────────────────────────── */}
          <div>
            <div className="mono-label text-muted-foreground mb-3">Specifications</div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-[oklch(0.96_0.004_85)]">
                    <th className="py-2 px-4 text-left text-xs text-muted-foreground font-medium w-32">Spec</th>
                    {offers.map(o => (
                      <th key={o.offerId} className="py-2 px-3 text-center text-xs font-medium text-foreground">
                        <div>{o.providerName}</div>
                        <div className="font-data text-[10px] text-muted-foreground font-normal">{o.gpuModelName}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <SpecRow
                    label="Price/GPU/hr"
                    values={offers.map(o => o.pricePerGpuHr)}
                    format={v => `$${Number(v).toFixed(2)}`}
                  />
                  <SpecRow
                    label="VRAM"
                    values={offers.map(o => o.vramPerGpuGb)}
                    format={v => `${v} GB`}
                  />
                  <SpecRow
                    label="vCPUs"
                    values={offers.map(o => o.vcpus || "—")}
                  />
                  <SpecRow
                    label="RAM"
                    values={offers.map(o => o.ramGb ? `${o.ramGb} GB` : "—")}
                  />
                  <SpecRow
                    label="Region"
                    values={offers.map(o => o.region)}
                  />
                  <SpecRow
                    label="Cloud Type"
                    values={offers.map(o => o.cloudType ?? "on-demand")}
                  />
                  <SpecRow
                    label="Availability"
                    values={offers.map(o => o.availability)}
                  />
                  <SpecRow
                    label="Reliability"
                    values={offers.map(o => `${Math.round((PROVIDER_RELIABILITY[o.providerId] ?? 0.85) * 100)}%`)}
                  />
                  <SpecRow
                    label="Data Source"
                    values={offers.map(o => o.dataSource)}
                  />
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Provider links ───────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            {offers.map(o => (
              <a
                key={o.offerId}
                href={o.providerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 text-xs font-medium border border-border rounded-lg text-foreground hover:bg-card hover:border-[oklch(0.82_0.012_85)] transition-all duration-200"
              >
                <ExternalLink className="w-3 h-3 text-muted-foreground" />
                View on {o.providerName}
              </a>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
