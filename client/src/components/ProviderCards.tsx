/*
  ProviderCards — Provider summary cards with key metrics
  Data Observatory design: compact cards with data-dense layout
*/

import { buildProviderSummaries, formatPrice } from "@/lib/data";
import { CategoryBadge } from "./CategoryBadge";
import { ReliabilityDots } from "./ReliabilityDots";
import { ExternalLink, MapPin, Cpu, Globe } from "lucide-react";

export function ProviderCards() {
  const summaries = buildProviderSummaries();

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Provider Profiles</h2>
          <p className="text-sm text-muted-foreground mt-1">Summary of tracked compute providers and their offerings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {summaries.map((summary) => (
          <div
            key={summary.provider.id}
            className="bg-card border border-border rounded-md overflow-hidden hover:shadow-[0_2px_12px_oklch(0.25_0.04_250_/_0.06)] transition-shadow"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-[oklch(0.25_0.04_250_/_0.06)] flex items-center justify-center">
                  <Globe className="w-4 h-4 text-[oklch(0.4_0.04_250)]" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-foreground">{summary.provider.name}</h3>
                  <CategoryBadge category={summary.provider.category} />
                </div>
              </div>
              <a
                href={summary.provider.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[oklch(0.65_0.18_220)] hover:text-[oklch(0.55_0.18_220)] transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

            {/* Metrics */}
            <div className="px-4 py-3 space-y-2.5">
              {/* Reliability */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Reliability</span>
                <div className="flex items-center gap-2">
                  <ReliabilityDots score={summary.provider.reliabilityScore} size={5} />
                  <span className="font-data text-xs text-muted-foreground">{Math.round(summary.provider.reliabilityScore * 100)}%</span>
                </div>
              </div>

              {/* GPU Inventory */}
              <div className="flex items-start justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Cpu className="w-3 h-3" /> GPUs
                </span>
                <div className="flex flex-wrap gap-1 justify-end max-w-[200px]">
                  {summary.gpuInventory.map(gpu => (
                    <span key={gpu} className="font-data text-[10px] px-1.5 py-0.5 bg-[oklch(0.96_0.005_90)] rounded text-foreground">
                      {gpu}
                    </span>
                  ))}
                </div>
              </div>

              {/* Regions */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> Regions
                </span>
                <span className="font-data text-xs text-foreground">{summary.regionCoverage.join(", ")}</span>
              </div>

              {/* Lowest Prices */}
              <div className="pt-2 border-t border-border/40">
                <span className="text-[10px] font-data text-muted-foreground uppercase tracking-wider">Lowest Prices</span>
                <div className="mt-1.5 space-y-1">
                  {Object.entries(summary.lowestPrices)
                    .sort(([, a], [, b]) => a - b)
                    .slice(0, 4)
                    .map(([gpu, price]) => (
                      <div key={gpu} className="flex items-center justify-between">
                        <span className="text-xs text-foreground">{gpu}</span>
                        <span className="font-data text-xs font-medium text-foreground">{formatPrice(price)}<span className="text-muted-foreground">/hr</span></span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Footer note */}
            <div className="px-4 py-2 bg-[oklch(0.96_0.005_90)] border-t border-border/40">
              <p className="text-[11px] text-muted-foreground leading-relaxed">{summary.provider.notes}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
