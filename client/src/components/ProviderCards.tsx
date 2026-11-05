/*
  ProviderCards — Premium provider profile cards
  Design: Data Observatory v2 — elevated cards, accent bars, animated details
*/

import { buildProviderSummaries, formatPrice, providerLogo } from "@/lib/data";
import { CategoryBadge } from "./CategoryBadge";
import { ExternalLink, MapPin, Cpu, BarChart2, Clock } from "lucide-react";
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

const PROVIDER_ACCENT: Record<string, string> = {
  lambda:     "from-[oklch(0.62_0.19_218)] to-[oklch(0.52_0.16_255)]",
  runpod:     "from-[oklch(0.60_0.18_155)] to-[oklch(0.62_0.19_218)]",
  tensordock: "from-[oklch(0.68_0.18_45)] to-[oklch(0.68_0.18_80)]",
  coreweave:  "from-[oklch(0.52_0.16_255)] to-[oklch(0.62_0.19_218)]",
  fluidstack: "from-[oklch(0.68_0.18_80)] to-[oklch(0.60_0.18_155)]",
  paperspace: "from-[oklch(0.62_0.19_218)] to-[oklch(0.60_0.18_155)]",
};

export function ProviderCards() {
  const summaries = buildProviderSummaries().filter(s => catalog.sources.some(source => source.id === s.provider.id && source.lastSuccessAt !== null));

  return (
    <section className="mb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {summaries.map((summary, idx) => {
          const accentGradient = PROVIDER_ACCENT[summary.provider.id] ?? PROVIDER_ACCENT.lambda;
          const source = catalog.sources.find(s => s.id === summary.provider.id);
          const connected = source?.status === "ok";
          const status = connected ? "Connected" : source?.status === "not_configured" ? "Credentials required" : source?.status === "error" ? "Refresh failed" : "Not connected";

          return (
            <div
              key={summary.provider.id}
              className="elevated-card rounded-xl overflow-hidden animate-fade-up flex flex-col"
              style={{ animationDelay: `${idx * 70}ms` }}
            >
              {/* Gradient accent top bar */}
              <div className={`h-[3px] bg-gradient-to-r ${accentGradient}`} />

              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 shrink-0 rounded-xl bg-white border border-border/60 flex items-center justify-center overflow-hidden">
                    <img src={providerLogo(summary.provider.id)} alt={`${summary.provider.name} logo`} width={36} height={36} className="w-9 h-9 object-contain" loading="lazy" />
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
                  aria-label={`Visit ${summary.provider.name}`}
                  href={summary.provider.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[oklch(0.62_0.19_218)] hover:bg-teal-subtle transition-all duration-150 hover:scale-110"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              <div className="px-5 pb-4 text-xs text-muted-foreground">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-data ${connected ? "bg-emerald-50 text-emerald-700" : "bg-muted text-muted-foreground"}`}><span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-400"}`} />{status}</span>
                {summary.offerCount > 0 && <span className="ml-2 text-[10px] font-data text-muted-foreground">{summary.provider.billingModel === "spot" ? "Spot · interruptible" : "On-demand"}</span>}
                {!connected && source?.status === "error" && <p className="mt-2">{source.message}</p>}
                {!!source?.exclusions?.length && <details className="mt-2"><summary className="cursor-pointer">{source.exclusions.length} rows excluded</summary><ul className="mt-1 space-y-1">{source.exclusions.map(row => <li key={row.row}>{row.row} — {row.reason === "quote_required" ? "Contact sales" : row.reason === "inconsistent_price" ? "Conflicting published prices" : "Ambiguous GPU model"}</li>)}</ul></details>}

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
                    {!summary.gpuInventory.length && <span className="text-xs text-muted-foreground">Awaiting data</span>}
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
                    {!summary.regionCoverage.length && <span className="text-xs text-muted-foreground">—</span>}
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
                  <span className="mono-label text-muted-foreground">Lowest Prices · USD / GPU-hour</span>
                </div>
                <div className="space-y-1.5">
                  {!Object.keys(summary.lowestPrices).length && <p className="text-xs text-muted-foreground">No current verified prices</p>}
                  {Object.entries(summary.lowestPrices)
                    .sort(([, a], [, b]) => a - b)
                    .slice(0, 4)
                    .map(([gpu, price]) => (
                      <div key={gpu} className="flex items-center justify-between">
                        <span className="text-xs text-foreground/80">{gpu}</span>
                        <div className="flex items-center gap-1">
                          <span className="font-data text-xs font-semibold text-foreground w-14 text-right">
                            {formatPrice(price)}<span className="text-muted-foreground font-normal">/hr</span>
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Footer: notes + last polled */}
              <div className="mt-auto px-5 py-3 bg-[oklch(0.96_0.005_85)] border-t border-border/40 flex items-center justify-between gap-2">
                <details className="text-[11px] text-muted-foreground leading-relaxed flex-1 min-w-0"><summary className="cursor-pointer hover:text-foreground">Source details</summary><p className="mt-2">{summary.provider.notes}</p>{source?.evidence && <a href={source.evidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 underline">View pricing source <ExternalLink className="w-3 h-3" /></a>}</details>
                <div className="flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="font-data text-[10px] text-muted-foreground whitespace-nowrap">
                    {source?.lastSuccessAt ? `Updated ${timeAgo(new Date(source.lastSuccessAt))}` : "No observations"}
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
