import { ProviderIdentity } from "./ProviderIdentity";
import { X, ExternalLink } from "lucide-react";
import type { GpuOffer } from "@shared/catalog";
import { billingLabel, cloudLabel } from "@shared/offer-view";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { Modal } from "./Modal";
export function ComparisonDrawer({
  offers,
  onClose,
}: {
  offers: GpuOffer[];
  onClose: () => void;
}) {
  if (offers.length < 2) return null;
  const mixed =
    new Set(offers.map(o => `${o.gpuModelId}:${o.billingModel ?? "on-demand"}`))
      .size > 1;
  const rows: [string, (o: GpuOffer) => string][] = [
    ["USD / GPU-hour", o => `$${o.pricePerGpuHr.toFixed(3)}`],
    ["Billing", billingLabel],
    ["Cloud tier", cloudLabel],
    [
      "Node configuration",
      o =>
        o.configurationKnown === false
          ? "Per-GPU rate; node size not specified"
          : `${o.gpuCount} GPU${o.gpuCount > 1 ? "s" : ""}`,
    ],
    [
      "USD / node-hour",
      o =>
        o.configurationKnown === false
          ? "Not specified"
          : `$${o.totalNodePriceHr.toFixed(3)}`,
    ],
    [
      "VRAM / GPU",
      o => (o.vramPerGpuGb === null ? "Not reported" : `${o.vramPerGpuGb} GB`),
    ],
    ["vCPUs", o => (o.vcpus === null ? "Not reported" : String(o.vcpus))],
    ["System RAM", o => (o.ramGb === null ? "Not reported" : `${o.ramGb} GB`)],
    ["Region", o => o.region],
    ["Observed", o => new Date(o.observedAt).toLocaleString()],
  ];
  return (
    <Modal titleId="comparison-title" onClose={onClose} wide>
      <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex justify-between items-center z-10">
        <div>
          <p className="text-[10px] font-data text-muted-foreground uppercase tracking-widest">
            Recorded offer comparison
          </p>
          <h2 id="comparison-title" className="text-xl font-semibold">
            Compare {offers.length} listings
          </h2>
        </div>
        <button
          aria-label="Close comparison"
          onClick={onClose}
          className="p-2 rounded hover:bg-muted"
        >
          <X size={18} />
        </button>
      </div>
      <div className="p-5">
        {mixed && (
          <p className="mb-4 p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded text-xs">
            Different GPU models or billing types are selected. Their prices are
            not like-for-like.
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="text-left p-3 text-muted-foreground">
                  Evidence
                </th>
                {offers.map(o => (
                  <th key={o.offerId} className="p-3 text-left min-w-44">
                    <ProviderIdentity offer={o} />
                    <p className="font-normal mt-1">{o.gpuModelName}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, get]) => (
                <tr key={label} className="border-t border-border">
                  <th className="text-left p-3 font-medium text-muted-foreground">
                    {label}
                  </th>
                  {offers.map(o => (
                    <td key={o.offerId} className="p-3 font-data">
                      {get(o)}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-border">
                <th className="p-3 text-left font-medium text-muted-foreground">
                  Stock evidence
                </th>
                {offers.map(o => (
                  <td key={o.offerId} className="p-3">
                    <AvailabilityBadge
                      state={o.availability}
                      providerLink={o.providerLink}
                    />
                  </td>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="p-3 text-left font-medium text-muted-foreground">
                  Source
                </th>
                {offers.map(o => (
                  <td key={o.offerId} className="p-3">
                    <a
                      className="text-teal underline"
                      href={o.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {o.dataSource === "pricing_page"
                        ? "Published pricing"
                        : "Provider API"}{" "}
                      ↗
                    </a>
                  </td>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th className="p-3 text-left font-medium text-muted-foreground">
                  Open listing
                </th>
                {offers.map(o => (
                  <td key={o.offerId} className="p-3">
                    <a
                      href={o.providerLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex gap-1 items-center border border-border rounded p-2 text-teal"
                    >
                      Open provider <ExternalLink size={12} />
                    </a>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Missing specifications stay “Not reported”. A published price does not
          establish rentable stock. No composite availability or performance
          score is inferred.
        </p>
      </div>
    </Modal>
  );
}
