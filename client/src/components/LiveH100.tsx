import { useState } from "react";
import { catalog, snapshotLoadError, snapshotRefreshing } from "@/lib/catalog";
import { h100Quote, marketSeries, marketStats } from "@shared/market";
import { billingLabel, cloudLabel } from "@shared/offer-view";
import { AvailabilityBadge } from "./AvailabilityBadge";
export function LiveH100() {
  const [billing, setBilling] = useState("on-demand");
  const offer = h100Quote(catalog, billing);
  const points = offer
    ? marketSeries(catalog, offer.offerId, Date.now() - 86400000)
    : [];
  const stats = marketStats(points);
  return (
    <div
      className="mt-6 p-4 bg-card/95 border border-border rounded-xl shadow-sm max-w-md"
      aria-label="Live H100 quote"
    >
      <div className="flex justify-between items-center gap-2">
        <span className="text-xs font-semibold flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${snapshotLoadError ? "bg-amber-500" : "bg-emerald-500"}`}
          />
          H100 SXM · auto-updating
        </span>
        <select
          aria-label="H100 billing"
          value={billing}
          onChange={e => setBilling(e.target.value)}
          className="text-xs p-1.5 bg-background border border-border rounded"
        >
          <option value="on-demand">On-demand</option>
          <option value="spot">Spot</option>
        </select>
      </div>
      <div className="flex items-baseline gap-2 mt-3">
        <strong
          className="font-data text-3xl tracking-tight"
          aria-live="polite"
        >
          {offer ? `$${offer.pricePerGpuHr.toFixed(3)}` : "—"}
        </strong>
        <span className="text-xs text-muted-foreground">/ GPU-hour</span>
      </div>
      {offer ? (
        <>
          <p className="text-xs mt-2">
            Lowest current observed quote · {offer.providerName}
          </p>
          <div className="flex flex-wrap gap-2 mt-2 items-center">
            <AvailabilityBadge providerLink={offer.providerLink} state={offer.availability} />
            <span className="text-[10px] text-muted-foreground">
              {billingLabel(offer)} · {cloudLabel(offer)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Observed {new Date(offer.observedAt).toLocaleTimeString()} ·{" "}
            {snapshotRefreshing
              ? "Checking…"
              : "Checks every minute; collection every 15 min"}
          </p>
          <div className="flex justify-between gap-2 mt-3 text-xs">
            <span className="text-muted-foreground">
              {stats && stats.count > 1
                ? `${stats.change >= 0 ? "+" : ""}${stats.percent.toFixed(2)}% since first sample in 24h`
                : "History collecting for this listing"}
            </span>
            <a
              href={offer.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal underline"
            >
              View source ↗
            </a>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground mt-2">
          No fresh verified H100 quote for this billing model. Retained prices
          remain available in Offers.
        </p>
      )}
    </div>
  );
}
