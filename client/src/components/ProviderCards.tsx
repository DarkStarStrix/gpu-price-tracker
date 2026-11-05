/*
  ProviderCards — Premium provider profile cards
  Design: Data Observatory v2 — elevated cards, accent bars, animated details
*/

import { buildProviderSummaries, formatPrice, type ProviderCategory } from "@/lib/data";
import { CategoryBadge } from "./CategoryBadge";
import { ExternalLink, MapPin, Cpu, Globe, Shield, Zap, BarChart2, Clock } from "lucide-react";
import { catalog } from "@/lib/catalog";

function timeAgo(date: Date | null | undefined): string {
  if (!date) return "never";
  const d = date instanceof Date ? date : new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

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

              <div className="px-5 pb-4 text-xs text-muted-foreground">
                {catalog.sources.find(s => s.id === summary.provider.id)?.status.replaceAll("_", " ") ?? "not connected"}
                <p className="mt-1">{catalog.sources.find(s => s.id === summary.provider.id)?.message}</p>
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

              {/* Footer: notes + last polled */}
              <div className="px-5 py-3 bg-[oklch(0.96_0.005_85)] border-t border-border/40 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground leading-relaxed flex-1">{summary.provider.notes}</p>
                <div className="flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="font-data text-[10px] text-muted-foreground whitespace-nowrap">
                    {timeAgo(catalog.sources.find(s => s.id === summary.provider.id)?.lastSuccessAt as unknown as Date | null)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
