import type { GpuOffer } from "@shared/catalog";
import { billingLabel, cloudLabel } from "@shared/offer-view";
import { providerLogo } from "@/lib/data";
import { ExternalLink } from "lucide-react";

/** One presentation for provider identity, billing, cloud tier and source evidence. */
export function ProviderIdentity({ offer }: { offer: GpuOffer }) {
  return (
    <div className="min-w-44 text-left font-normal">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-white p-1.5">
          <img
            src={providerLogo(offer.providerId)}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
          />
        </div>
        <span className="text-sm font-semibold text-foreground">
          {offer.providerName}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1 font-data text-[10px]">
        <span
          className={`rounded-full border px-2 py-0.5 ${offer.billingModel === "spot" ? "border-purple-200 bg-purple-50 text-purple-800" : "border-teal/20 bg-teal/10 text-teal"}`}
        >
          {billingLabel(offer)}
        </span>
        <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-muted-foreground">
          {cloudLabel(offer)}
        </span>
      </div>
      <a
        href={offer.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-teal"
        title="Official source for this observation"
      >
        {offer.dataSource === "pricing_page" ? "Price source" : "Provider data"}
        <ExternalLink size={10} />
      </a>
    </div>
  );
}
