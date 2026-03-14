/*
  QuickComparison — Summary cards for common GPU configurations
  Data Observatory design: cards with inline provider comparisons
*/

import { useState } from "react";
import { buildComparisons, formatPrice, getProvider, type ComparisonRow } from "@/lib/data";
import { ReliabilityDots } from "./ReliabilityDots";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { ExternalLink, ChevronDown, ChevronUp, Trophy, TrendingDown } from "lucide-react";

const POPULAR_GPUS = ["h100-sxm", "a100-sxm-80", "rtx-4090", "h200-sxm", "b200-sxm", "l40s"];

export function QuickComparison() {
  const comparisons = buildComparisons(POPULAR_GPUS);
  const [expandedGpu, setExpandedGpu] = useState<string | null>(null);

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Quick Comparison</h2>
          <p className="text-sm text-muted-foreground mt-1">Lowest per-GPU/hr prices across providers for popular configurations</p>
        </div>
        <span className="font-data text-xs text-muted-foreground">
          {comparisons.reduce((sum, c) => sum + c.providers.length, 0)} offers tracked
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {comparisons.map((row) => (
          <ComparisonCard
            key={row.gpuModelId}
            row={row}
            isExpanded={expandedGpu === row.gpuModelId}
            onToggle={() => setExpandedGpu(expandedGpu === row.gpuModelId ? null : row.gpuModelId)}
          />
        ))}
      </div>
    </section>
  );
}

function ComparisonCard({ row, isExpanded, onToggle }: { row: ComparisonRow; isExpanded: boolean; onToggle: () => void }) {
  const bestValueProvider = row.bestValue ? getProvider(row.bestValue.providerId) : null;

  return (
    <div className="bg-card border border-border rounded-md overflow-hidden transition-shadow hover:shadow-[0_2px_12px_oklch(0.25_0.04_250_/_0.06)]">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-border/60">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[oklch(0.65_0.18_220_/_0.08)] flex items-center justify-center">
            <span className="font-data text-xs font-medium text-[oklch(0.5_0.14_220)]">{row.vramGb}G</span>
          </div>
          <div>
            <h3 className="font-semibold text-sm text-foreground">{row.gpuModelName}</h3>
            <span className="font-data text-[11px] text-muted-foreground">{row.vramGb} GB VRAM</span>
          </div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-[oklch(0.65_0.2_150)]" />
            <span className="font-data text-lg font-semibold text-foreground">{formatPrice(row.lowestOverall)}</span>
          </div>
          <span className="font-data text-[10px] text-muted-foreground">/gpu/hr lowest</span>
        </div>
      </div>

      {/* Provider rows */}
      <div className="px-4 py-2">
        {row.providers.slice(0, isExpanded ? undefined : 3).map((p, i) => (
          <div key={p.providerId} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
            <div className="flex items-center gap-2">
              <span className="font-data text-[10px] text-muted-foreground w-4">{i + 1}.</span>
              <span className="text-sm font-medium text-foreground">{p.providerName}</span>
              <ReliabilityDots score={p.reliabilityScore} size={4} />
            </div>
            <div className="flex items-center gap-3">
              <AvailabilityBadge state={p.availability} />
              <span className="font-data text-sm font-medium text-foreground w-16 text-right">{formatPrice(p.lowestPrice)}</span>
              <a
                href={p.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[oklch(0.65_0.18_220)] hover:text-[oklch(0.55_0.18_220)] transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 bg-[oklch(0.96_0.005_90)] border-t border-border/40 flex items-center justify-between">
        {bestValueProvider && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Trophy className="w-3 h-3 text-[oklch(0.7_0.17_80)]" />
            <span>Best value: <strong className="text-foreground">{bestValueProvider.name}</strong></span>
          </div>
        )}
        {row.providers.length > 3 && (
          <button
            onClick={onToggle}
            className="flex items-center gap-1 text-[11px] text-[oklch(0.65_0.18_220)] hover:text-[oklch(0.55_0.18_220)] transition-colors ml-auto"
          >
            {isExpanded ? (
              <>Show less <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>{row.providers.length - 3} more <ChevronDown className="w-3 h-3" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
