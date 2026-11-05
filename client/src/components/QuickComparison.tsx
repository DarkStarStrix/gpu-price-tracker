/*
  QuickComparison — Premium animated GPU comparison cards
  Design: Data Observatory v2 — elevated cards, staggered entrance, accent bars
*/

import { useState } from "react";
import { buildComparisons, formatPrice, getProvider, type ComparisonRow } from "@/lib/data";

import { AvailabilityBadge } from "./AvailabilityBadge";
import { ExternalLink, ChevronDown, ChevronUp, Trophy, TrendingDown, Zap } from "lucide-react";

const POPULAR_GPUS = ["h100-sxm", "a100-sxm-80", "rtx-4090", "h200-sxm", "b200-sxm", "l40s"];

// Architecture color coding
const ARCH_COLORS: Record<string, string> = {
  Blackwell:     "bg-[oklch(0.68_0.18_45_/_0.1)] text-[oklch(0.5_0.15_45)]",
  Hopper:        "bg-[oklch(0.62_0.19_218_/_0.1)] text-[oklch(0.45_0.16_218)]",
  "Ada Lovelace":"bg-[oklch(0.60_0.18_155_/_0.1)] text-[oklch(0.42_0.15_155)]",
  Ampere:        "bg-[oklch(0.52_0.16_255_/_0.1)] text-[oklch(0.38_0.12_255)]",
  Volta:         "bg-[oklch(0.68_0.18_80_/_0.1)] text-[oklch(0.5_0.14_80)]",
};

export function QuickComparison() {
  const comparisons = buildComparisons(POPULAR_GPUS);
  const [expandedGpu, setExpandedGpu] = useState<string | null>(null);

  return (
    <section className="mb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {comparisons.map((row, idx) => (
          <ComparisonCard
            key={row.gpuModelId}
            row={row}
            index={idx}
            isExpanded={expandedGpu === row.gpuModelId}
            onToggle={() => setExpandedGpu(expandedGpu === row.gpuModelId ? null : row.gpuModelId)}
          />
        ))}
      </div>
    </section>
  );
}

function ComparisonCard({
  row, index, isExpanded, onToggle,
}: {
  row: ComparisonRow; index: number; isExpanded: boolean; onToggle: () => void;
}) {
  const lowestProvider = row.providers[0];

  // Determine architecture from first provider's GPU
  const archClass = ARCH_COLORS["Hopper"] ?? ARCH_COLORS["Ampere"];

  return (
    <div
      className="elevated-card rounded-xl overflow-hidden animate-fade-up"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Top accent line — teal gradient */}
      <div className="h-[2px] bg-gradient-to-r from-[oklch(0.62_0.19_218)] via-[oklch(0.62_0.19_218_/_0.5)] to-transparent" />

      {/* Header */}
      <div className="px-5 py-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* VRAM badge */}
          <div className="w-10 h-10 rounded-lg bg-[oklch(0.22_0.045_255_/_0.06)] flex flex-col items-center justify-center border border-[oklch(0.22_0.045_255_/_0.08)]">
            <span className="font-data text-xs font-semibold text-[oklch(0.42_0.04_255)] leading-none">{row.vramGb || "—"}</span>
            <span className="font-data text-[8px] text-muted-foreground leading-none mt-0.5">GB</span>
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground tracking-tight">{row.gpuModelName}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="font-data text-[10px] text-muted-foreground">{row.vramGb || "—"}GB VRAM</span>
              <span className="text-border">·</span>
              <span className="font-data text-[10px] text-muted-foreground">{row.providers.length} providers</span>
            </div>
          </div>
        </div>

        {/* Price */}
        <div className="text-right">
          <div className="flex items-center gap-1 justify-end">
            <TrendingDown className="w-3 h-3 text-[oklch(0.60_0.18_155)]" />
            <span className="font-data text-xl font-bold text-foreground tracking-tight">
              {formatPrice(row.lowestOverall)}
            </span>
          </div>
          <span className="font-data text-[10px] text-muted-foreground">/gpu/hr</span>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-gradient-to-r from-border via-border/50 to-transparent" />

      {/* Provider rows */}
      <div className="px-5 py-3 space-y-0">
        {row.providers.slice(0, isExpanded ? undefined : 3).map((p, i) => {
          const isLowest = i === 0;
          return (
            <div
              key={p.providerId}
              className={`flex items-center justify-between py-2 border-b border-border/30 last:border-0 transition-colors duration-150 ${
                isLowest ? "opacity-100" : "opacity-80 hover:opacity-100"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="font-data text-[10px] text-muted-foreground w-4 text-right">{i + 1}</span>
                <span className={`text-sm font-medium ${isLowest ? "text-foreground" : "text-foreground/80"}`}>
                  {p.providerName}
                </span>

              </div>
              <div className="flex items-center gap-2.5">
                <AvailabilityBadge providerLink={p.link} state={p.availability} />
                <span className={`font-data text-sm font-semibold w-14 text-right ${
                  isLowest ? "text-foreground" : "text-foreground/70"
                }`}>
                  {formatPrice(p.lowestPrice)}
                </span>
                <a
                  href={p.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-6 h-6 flex items-center justify-center rounded-md text-[oklch(0.62_0.19_218)] hover:bg-teal-subtle transition-colors duration-150"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-3 bg-[oklch(0.96_0.005_85)] border-t border-border/40 flex items-center justify-between">
        {row.providers.length > 3 && (
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-[11px] text-[oklch(0.62_0.19_218)] hover:text-[oklch(0.52_0.19_218)] transition-colors ml-auto"
          >
            {isExpanded ? (
              <>Less <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>{row.providers.length - 3} more <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
