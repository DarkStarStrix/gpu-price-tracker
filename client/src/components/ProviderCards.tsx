/*
  ProviderCards — Premium provider profile cards
  Design: Data Observatory v2 — elevated cards, accent bars, animated details
*/

import { buildProviderSummaries, formatPrice, type ProviderCategory } from "@/lib/data";
import { CategoryBadge } from "./CategoryBadge";
import { ReliabilityDots } from "./ReliabilityDots";
import { ExternalLink, MapPin, Cpu, Globe, Shield, Zap, BarChart2 } from "lucide-react";

const PROVIDER_ICONS: Record<string, string> = {
  lambda:     "Λ",
  runpod:     "⬡",
  tensordock: "⬢",
  coreweave:  "◈",
  fluidstack: "≋",
  paperspace: "◻",
};

const PROVIDER_ACCENT: Record<string, string> = {
  lambda:     "from-[oklch(0.62_0.19_218)] to-[oklch(0.52_0.16_255)]",
  runpod:     "from-[oklch(0.60_0.18_155)] to-[oklch(0.62_0.19_218)]",
  tensordock: "from-[oklch(0.68_0.18_45)] to-[oklch(0.68_0.18_80)]",
  coreweave:  "from-[oklch(0.52_0.16_255)] to-[oklch(0.62_0.19_218)]",
  fluidstack: "from-[oklch(0.68_0.18_80)] to-[oklch(0.60_0.18_155)]",
  paperspace: "from-[oklch(0.62_0.19_218)] to-[oklch(0.60_0.18_155)]",
};

export function ProviderCards() {
  const summaries = buildProviderSummaries();

  return (
    <section className="mb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {summaries.map((summary, idx) => {
          const accentGradient = PROVIDER_ACCENT[summary.provider.id] ?? PROVIDER_ACCENT.lambda;
          const symbol = PROVIDER_ICONS[summary.provider.id] ?? "◆";

          return (
            <div
              key={summary.provider.id}
              className="elevated-card rounded-xl overflow-hidden animate-fade-up"
              style={{ animationDelay: `${idx * 70}ms` }}
            >
              {/* Gradient accent top bar */}
              <div className={`h-[3px] bg-gradient-to-r ${accentGradient}`} />

              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${accentGradient} flex items-center justify-center shadow-[0_2px_8px_oklch(0.22_0.045_255_/_0.15)]`}>
                    <span className="text-white text-lg font-bold">{symbol}</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground">{summary.provider.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <CategoryBadge category={summary.provider.category} />
                      <span className="font-data text-[10px] text-muted-foreground">{summary.offerCount} offers</span>
                    </div>
                  </div>
                </div>
                <a
                  href={summary.provider.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[oklch(0.62_0.19_218)] hover:bg-teal-subtle transition-all duration-150 hover:scale-110"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* Reliability bar */}
              <div className="px-5 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Shield className="w-3 h-3 text-muted-foreground" />
                    <span className="mono-label text-muted-foreground">Reliability</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ReliabilityDots score={summary.provider.reliabilityScore} size={5} />
                    <span className="font-data text-xs font-medium text-foreground">
                      {Math.round(summary.provider.reliabilityScore * 100)}%
                    </span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-1 bg-[oklch(0.92_0.006_85)] rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${accentGradient} rounded-full transition-all duration-700`}
                    style={{ width: `${summary.provider.reliabilityScore * 100}%` }}
                  />
                </div>
              </div>

              <div className="mx-5 h-px bg-gradient-to-r from-border via-border/50 to-transparent mb-4" />

              {/* Metrics grid */}
              <div className="px-5 pb-4 grid grid-cols-2 gap-3">
                {/* GPU Inventory */}
                <div>
                  <div className="flex items-center gap-1 mb-1.5">
                    <Cpu className="w-3 h-3 text-muted-foreground" />
                    <span className="mono-label text-muted-foreground">GPUs</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {summary.gpuInventory.slice(0, 4).map(gpu => (
                      <span key={gpu} className="font-data text-[9px] px-1.5 py-0.5 bg-[oklch(0.94_0.006_85)] rounded text-foreground leading-tight">
                        {gpu}
                      </span>
                    ))}
                    {summary.gpuInventory.length > 4 && (
                      <span className="font-data text-[9px] px-1.5 py-0.5 bg-[oklch(0.94_0.006_85)] rounded text-muted-foreground">
                        +{summary.gpuInventory.length - 4}
                      </span>
                    )}
                  </div>
                </div>

                {/* Regions */}
                <div>
                  <div className="flex items-center gap-1 mb-1.5">
                    <MapPin className="w-3 h-3 text-muted-foreground" />
                    <span className="mono-label text-muted-foreground">Regions</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {summary.regionCoverage.map(r => (
                      <span key={r} className="font-data text-[9px] px-1.5 py-0.5 bg-[oklch(0.94_0.006_85)] rounded text-foreground">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Lowest prices */}
              <div className="px-5 pb-4">
                <div className="flex items-center gap-1 mb-2">
                  <BarChart2 className="w-3 h-3 text-muted-foreground" />
                  <span className="mono-label text-muted-foreground">Lowest Prices</span>
                </div>
                <div className="space-y-1.5">
                  {Object.entries(summary.lowestPrices)
                    .sort(([, a], [, b]) => a - b)
                    .slice(0, 4)
                    .map(([gpu, price]) => (
                      <div key={gpu} className="flex items-center justify-between">
                        <span className="text-xs text-foreground/80">{gpu}</span>
                        <div className="flex items-center gap-1">
                          <div
                            className="h-1 rounded-full bg-gradient-to-r from-[oklch(0.62_0.19_218_/_0.3)] to-[oklch(0.62_0.19_218_/_0.1)]"
                            style={{ width: `${Math.max(16, (1 - price / 12) * 60)}px` }}
                          />
                          <span className="font-data text-xs font-semibold text-foreground w-14 text-right">
                            {formatPrice(price)}<span className="text-muted-foreground font-normal">/hr</span>
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Footer note */}
              <div className="px-5 py-3 bg-[oklch(0.96_0.005_85)] border-t border-border/40">
                <p className="text-[11px] text-muted-foreground leading-relaxed">{summary.provider.notes}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
