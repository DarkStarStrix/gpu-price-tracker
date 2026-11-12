/*
  ProviderCards — Premium provider profile cards
  Design: Data Observatory v2 — elevated cards, accent bars, animated details
*/

import {
  buildProviderSummaries,
  formatPrice,
  hourlyPrice,
  providerLogo,
} from "@/lib/data";
import { CategoryBadge } from "./CategoryBadge";
import { ExternalLink, MapPin, Cpu, BarChart2, Clock } from "lucide-react";
import { isStale, listingUnit, type Snapshot } from "@shared/catalog";

import { computeKinds, type ComputeKind } from "@shared/compute";

function timeAgo(at: string, now: number): string {
  const diffMs = now - Date.parse(at);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

const PROVIDER_ACCENT: Record<string, string> = {
  runpod: "from-[oklch(0.60_0.18_155)] to-[oklch(0.62_0.19_218)]",
  coreweave: "from-[oklch(0.52_0.16_255)] to-[oklch(0.62_0.19_218)]",
  paperspace: "from-[oklch(0.62_0.19_218)] to-[oklch(0.60_0.18_155)]",
};
const INACTIVE_STATUS = {
  not_configured: "Credentials required",
  error: "Refresh failed",
  not_connected: "Not connected",
};
const leasePrice = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

export function ProviderCards({ snapshot }: { snapshot: Snapshot }) {
  const now = Date.now();
  const summaries = buildProviderSummaries(snapshot, now);

  if (!summaries.length) {
    return (
      <p className="mb-10 text-sm text-muted-foreground">
        The current snapshot has no provider reports.
      </p>
    );
  }

  return (
    <section className="mb-10">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {summaries.map((summary, idx) => {
          const { source, profile, pricingUrl, compute } = summary;
          const hasGpuFeed = snapshot.sources.some(
            feed => feed.id === source.id
          );
          const computeFresh =
            compute?.status === "ok" &&
            !!compute.observedAt &&
            !isStale(compute.observedAt, now);
          const leaseRates = source.leaseRates;
          const accentGradient =
            PROVIDER_ACCENT[source.id] ?? PROVIDER_ACCENT.paperspace;
          const connected =
            source.status === "ok" &&
            source.lastSuccessAt !== null &&
            !isStale(source.lastSuccessAt, now) &&
            !summary.retained;
          let status = "Last successful check is stale";
          if (source.status !== "ok") status = INACTIVE_STATUS[source.status];
          else if (connected)
            status =
              summary.offerCount || leaseRates?.length || compute?.rates.length
                ? "Connected"
                : "No offers listed";
          const website = profile?.website ?? pricingUrl;

          return (
            <article
              key={source.id}
              className="elevated-card rounded-xl overflow-hidden animate-fade-up flex flex-col"
              style={{ animationDelay: `${idx * 70}ms` }}
            >
              {/* Gradient accent top bar */}
              <div className={`h-[3px] bg-gradient-to-r ${accentGradient}`} />

              {/* Header */}
              <div className="px-5 pt-5 pb-4 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 shrink-0 rounded-xl bg-white border border-border/60 flex items-center justify-center overflow-hidden">
                    {profile ? (
                      <img
                        src={providerLogo(source.id)}
                        alt=""
                        width={36}
                        height={36}
                        className="w-9 h-9 object-contain"
                        loading="lazy"
                      />
                    ) : (
                      <Cpu className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-foreground">
                      {source.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      {profile && <CategoryBadge category={profile.category} />}
                      <span className="font-data text-[10px] text-muted-foreground">
                        {leaseRates
                          ? `${leaseRates.length} lease quotes`
                          : `${summary.offerCount + (compute?.rates.length ?? 0)} offers`}
                      </span>
                    </div>
                  </div>
                </div>
                {website && (
                  <a
                    aria-label={`Visit ${source.name}`}
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-teal hover:bg-teal-subtle transition-all duration-150 hover:scale-110"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
              </div>

              <div className="px-5 pb-4 text-xs text-muted-foreground">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-data ${connected ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-400"}`}
                  />
                  {status}
                </span>
                {summary.offerCount > 0 && (
                  <span className="ml-2 text-[10px] font-data text-muted-foreground">
                    {summary.billingModels.length > 1
                      ? "On-demand + spot"
                      : summary.billingModels[0] === "spot"
                        ? "Spot · interruptible"
                        : "On-demand"}
                  </span>
                )}
                {source.status === "error" && !source.lastSuccessAt && (
                  <p className="mt-2">Awaiting the first successful refresh.</p>
                )}
                {!!source.exclusions?.length && (
                  <details className="mt-2">
                    <summary className="cursor-pointer">
                      {source.exclusions.length} rows excluded
                    </summary>
                    <ul className="mt-1 space-y-1">
                      {source.exclusions.map(row => (
                        <li key={row.row}>
                          {row.row} —{" "}
                          {row.reason === "quote_required"
                            ? "Contact sales"
                            : row.reason === "inconsistent_price"
                              ? "Conflicting published prices"
                              : "Ambiguous GPU model"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              <div className="mx-5 h-px bg-gradient-to-r from-border via-border/50 to-transparent mb-4" />

              {hasGpuFeed && (
                <>
                  {/* Metrics grid */}
                  <div className="px-5 pb-4 grid grid-cols-2 gap-3">
                    {/* GPU Inventory */}
                    <div>
                      <div className="flex items-center gap-1 mb-1.5">
                        <Cpu className="w-3 h-3 text-muted-foreground" />
                        <span className="mono-label text-muted-foreground">
                          GPUs
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {!summary.gpuInventory.length && (
                          <span className="text-xs text-muted-foreground">
                            No GPU listings
                          </span>
                        )}
                        {summary.gpuInventory.slice(0, 4).map(gpu => (
                          <span
                            key={gpu}
                            className="font-data text-[9px] px-1.5 py-0.5 bg-muted rounded text-foreground leading-tight"
                          >
                            {gpu}
                          </span>
                        ))}
                        {summary.gpuInventory.length > 4 && (
                          <span className="font-data text-[9px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">
                            +{summary.gpuInventory.length - 4}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Regions */}
                    <div>
                      <div className="flex items-center gap-1 mb-1.5">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="mono-label text-muted-foreground">
                          Regions
                        </span>
                      </div>
                      {summary.regionCoverage.length > 4 ? (
                        <details className="rounded-md border border-border/60 bg-card text-xs">
                          <summary className="cursor-pointer px-2 py-1.5">
                            {summary.regionCoverage.length} regions
                          </summary>
                          <ul
                            aria-label={`${source.name} regions`}
                            tabIndex={0}
                            className="max-h-40 overflow-y-auto overscroll-contain space-y-1 border-t border-border/60 px-2 py-1.5 text-muted-foreground"
                          >
                            {[...summary.regionCoverage]
                              .sort((a, b) => a.localeCompare(b))
                              .map(region => (
                                <li key={region}>{region}</li>
                              ))}
                          </ul>
                        </details>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {!summary.regionCoverage.length && (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                          {summary.regionCoverage.map(region => (
                            <span
                              key={region}
                              className="font-data text-[9px] px-1.5 py-0.5 bg-muted rounded text-foreground"
                            >
                              {region}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {leaseRates ? (
                    <div className="px-5 pb-4">
                      <details className="rounded-md border border-border/60 bg-card text-xs">
                        <summary className="cursor-pointer px-2 py-1.5">
                          {connected
                            ? "View lease quotes"
                            : "View last observed lease quotes"}{" "}
                          · USD / GPU-hour
                        </summary>
                        <ul
                          tabIndex={0}
                          aria-label="Published lease quotes"
                          className="max-h-64 overflow-y-auto overscroll-contain divide-y divide-border/60 border-t border-border/60 px-2"
                        >
                          {leaseRates.map((rate, index) => (
                            <li key={index} className="space-y-0.5 py-2">
                              <div className="flex justify-between gap-2 font-medium">
                                <span>{rate.model}</span>
                                <span className="font-data shrink-0">
                                  {leasePrice.format(rate.pricePerGpuHr)}
                                </span>
                              </div>
                              <p className="text-muted-foreground">
                                {rate.quantity} · {rate.region}
                              </p>
                              <p className="text-muted-foreground">
                                {rate.term} ·{" "}
                                {rate.ready === "Live"
                                  ? "Listed as live"
                                  : `Ready ${rate.ready}`}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </div>
                  ) : (
                    <div className="px-5 pb-4">
                      <div className="flex items-center gap-1 mb-2">
                        <BarChart2 className="w-3 h-3 text-muted-foreground" />
                        <span className="mono-label text-muted-foreground">
                          {summary.retained
                            ? "Last observed prices"
                            : "Lowest Prices"}{" "}
                          · USD / GPU-hour
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {!Object.keys(summary.lowestPrices).length && (
                          <p className="text-xs text-muted-foreground">
                            No current verified prices
                          </p>
                        )}
                        {Object.entries(summary.lowestPrices)
                          .sort(([, a], [, b]) => a - b)
                          .slice(0, 4)
                          .map(([gpu, price]) => (
                            <div
                              key={gpu}
                              className="flex items-center justify-between"
                            >
                              <span className="text-xs text-foreground/80">
                                {gpu}
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="font-data text-xs font-semibold text-foreground w-14 text-right">
                                  {formatPrice(price)}
                                  <span className="text-muted-foreground font-normal">
                                    /hr
                                  </span>
                                </span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {compute && (
                <div className="px-5 pb-4 space-y-2 text-xs">
                  {(Object.keys(computeKinds) as ComputeKind[]).map(kind => {
                    const rates = compute.rates.filter(
                      rate => rate.kind === kind
                    );
                    if (!rates.length && !compute.kinds?.includes(kind))
                      return null;
                    const floor = rates.reduce(
                      (price, rate) => Math.min(price, rate.price),
                      Infinity
                    );
                    return (
                      <div
                        key={kind}
                        className="flex flex-wrap items-center justify-between gap-x-2"
                      >
                        <span>
                          {computeKinds[kind].label} · {rates.length}
                        </span>
                        {!!rates.length && (
                          <span className="font-data">
                            {hourlyPrice.format(floor)} / {listingUnit(kind)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap items-center justify-between gap-x-2 text-muted-foreground">
                    <span>
                      {computeFresh
                        ? "Compute prices checked"
                        : compute.status === "error"
                          ? "Compute refresh failed"
                          : "Last observed compute rates"}
                      {compute.observedAt &&
                        ` · ${timeAgo(compute.observedAt, now)}`}
                    </span>
                    <a
                      href={
                        compute.providerLink ??
                        (compute.dataSource === "pricing_page"
                          ? compute.url
                          : (profile?.website ?? pricingUrl))
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-teal hover:underline"
                    >
                      Compute pricing <ExternalLink className="inline size-3" />
                    </a>
                  </div>
                </div>
              )}
              {/* Footer: notes + last polled */}
              <div className="mt-auto px-5 py-3 bg-secondary border-t border-border/40 flex items-center justify-between gap-2">
                <details className="text-[11px] text-muted-foreground leading-relaxed flex-1 min-w-0">
                  <summary className="cursor-pointer hover:text-foreground">
                    Source details
                  </summary>
                  {profile && <p className="mt-2">{profile.notes}</p>}
                  <p className="mt-2">
                    Last checked{" "}
                    <time dateTime={source.checkedAt}>
                      {new Date(source.checkedAt).toLocaleString()}
                    </time>
                  </p>
                  {pricingUrl && (
                    <a
                      href={pricingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-2 underline"
                    >
                      View pricing source <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </details>
                <div className="flex items-center gap-1 shrink-0">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span className="font-data text-[10px] text-muted-foreground whitespace-nowrap">
                    {source.lastSuccessAt ? (
                      <time
                        dateTime={source.lastSuccessAt}
                        title={new Date(source.lastSuccessAt).toLocaleString()}
                      >
                        Updated {timeAgo(source.lastSuccessAt, now)}
                      </time>
                    ) : (
                      "No successful check"
                    )}
                  </span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
