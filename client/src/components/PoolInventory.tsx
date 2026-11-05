import { useState } from "react";
import { catalog } from "@/lib/catalog";
import { isCurrent } from "@shared/catalog";
import {
  filterPool,
  billingLabel,
  cloudLabel,
  type PoolFilters,
} from "@shared/offer-view";
import { AvailabilityBadge } from "./AvailabilityBadge";
export function PoolInventory({ provider }: { provider: string }) {
  const empty: PoolFilters = {
    gpu: "",
    billing: "",
    cloud: "",
    availability: "",
    region: "",
  };
  const [filters, setFilters] = useState(empty);
  const offers = catalog.offers.filter(o => o.providerId === provider);
  const visible = filterPool(catalog, provider, filters);
  const fields: [keyof PoolFilters, string, [string, string][]][] = [
    [
      "gpu",
      "All GPUs",
      [...new Map(offers.map(o => [o.gpuModelId, o.gpuModelName])).entries()],
    ],
    [
      "billing",
      "All billing",
      [
        ["on-demand", "On-demand"],
        ["spot", "Spot · interruptible"],
      ],
    ],
    [
      "cloud",
      "All cloud tiers",
      [
        ["secure", "Secure Cloud"],
        ["community", "Community Cloud"],
      ],
    ],
    [
      "availability",
      "Any availability",
      [
        ["available", "Available · green"],
        ["limited", "Limited · amber"],
        ["unavailable", "Unavailable · red"],
        ["unknown", "Unknown / stale · gray"],
      ],
    ],
    [
      "region",
      "All regions",
      [...new Set(offers.map(o => o.region))].map(r => [r, r]),
    ],
  ];
  return (
    <div className="my-5 border border-border rounded-xl bg-muted/20 p-4">
      <div className="flex justify-between mb-3">
        <h4 className="text-sm font-semibold">
          Current pool inventory · {visible.length} listings
        </h4>
        <button className="text-xs text-teal" onClick={() => setFilters(empty)}>
          Reset filters
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {fields.map(([key, label, options]) => (
          <select
            key={key}
            aria-label={`Pool ${key}`}
            className="bg-card border border-border rounded-md p-2 text-xs max-w-64"
            value={filters[key]}
            onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))}
          >
            <option value="">{label}</option>
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        ))}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        These filters apply to current listings. The timeline below shows the
        whole selected provider. Green means reported available; amber is
        limited, red unavailable, gray unverified or stale.
      </p>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2 max-h-96 overflow-y-auto pr-1">
        {visible.map(o => (
          <div
            key={o.offerId}
            className="bg-card border border-border rounded-lg p-3"
          >
            <div className="flex justify-between gap-2">
              <strong className="text-xs truncate" title={o.gpuModelName}>
                {o.gpuModelName}
              </strong>
              <AvailabilityBadge
                state={isCurrent(catalog, o) ? o.availability : "unknown"}
              />
            </div>
            <div className="flex flex-wrap gap-1 mt-2 text-[10px] font-data">
              <span
                className={
                  o.billingModel === "spot"
                    ? "rounded bg-purple-100 text-purple-800 px-2 py-1"
                    : "rounded bg-teal/10 text-teal px-2 py-1"
                }
              >
                {billingLabel(o)}
              </span>
              <span className="rounded bg-muted px-2 py-1">
                {cloudLabel(o)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              ${o.pricePerGpuHr.toFixed(3)} / GPU-hr · {o.region}
            </p>
          </div>
        ))}
      </div>
      {!visible.length && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No listings match these filters.
        </p>
      )}
    </div>
  );
}
