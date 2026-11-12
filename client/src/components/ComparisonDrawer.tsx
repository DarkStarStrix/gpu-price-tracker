import { providerLogo } from "@/lib/data";
import { X, ExternalLink } from "lucide-react";
import { listingUnit, type Listing, type Snapshot } from "@shared/catalog";
import { marketSeries, marketStats } from "@shared/market";
import { billingLabel, cloudLabel } from "@shared/offer-view";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { Modal } from "./Modal";
import { OfferRadar } from "./OfferRadar";
import { CopyViewLink } from "./CopyViewLink";
import { JobCostCalculator } from "./JobCostCalculator";
import { historyPeriods, type HistoryHours } from "@/lib/view-link";
type DetailRow = [string, (o: Listing) => string];
const computeRows: DetailRow[] = [
  ["Disk", o => (o.kind && o.storageGb ? `${o.storageGb} GB` : "Not reported")],
  ["Billing details", o => (o.kind ? (o.terms ?? "—") : "—")],
];
const gpuRows: DetailRow[] = [
  ["Cloud tier", cloudLabel],
  [
    "Node configuration",
    o =>
      o.configurationKnown === false
        ? "Per-GPU rate; node size not specified"
        : `${o.gpuCount} GPU${(o.gpuCount ?? 0) > 1 ? "s" : ""}`,
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
];
export function ComparisonDrawer({
  offers,
  onClose,
  history,
  hours,
  through,
  anchored,
  onHoursChange,
  shareUrl,
  missingSharedCount,
}: {
  offers: Listing[];
  onClose: () => void;
  history?: Snapshot;
  hours: HistoryHours;
  through: number;
  anchored: boolean;
  onHoursChange: (hours: HistoryHours) => void;
  shareUrl: string;
  missingSharedCount: number;
}) {
  if (offers.length < 2) return null;
  const mixed =
    new Set(offers.map(o => `${o.gpuModelId}:${o.billingModel ?? "on-demand"}`))
      .size > 1;
  const kind = offers[0].kind;
  const rows: [string, (o: Listing) => string][] = [
    [`USD / ${listingUnit(kind)}`, o => `$${o.pricePerGpuHr.toFixed(4)}`],
    ["Billing", billingLabel],
    ...(!kind ? gpuRows : []),
    ...(kind ? computeRows : []),
    ["vCPUs", o => (o.vcpus === null ? "Not reported" : String(o.vcpus))],
    ["System RAM", o => (o.ramGb === null ? "Not reported" : `${o.ramGb} GB`)],
    ["Region", o => o.region],
    ["Observed", o => new Date(o.observedAt).toLocaleString()],
    [
      "Recorded price range",
      offer => {
        if (!history) return "History unavailable";
        const stats = marketStats(
          marketSeries(
            history,
            offer.offerId,
            through - hours * 3_600_000,
            through
          )
        );
        if (!stats) return "No observations";
        const low = `$${stats.low.toFixed(3)}`;
        const prices =
          stats.low === stats.high ? low : `${low}–$${stats.high.toFixed(3)}`;
        return `${prices} · ${stats.count} ${stats.count === 1 ? "sample" : "samples"}`;
      },
    ],
  ];
  return (
    <Modal titleId="comparison-title" onClose={onClose} wide>
      <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex justify-between items-center z-10">
        <div>
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
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <label className="offer-field">
            History range
            <select
              value={hours}
              onChange={event =>
                onHoursChange(Number(event.target.value) as HistoryHours)
              }
            >
              {historyPeriods.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <CopyViewLink url={shareUrl} />
        </div>
        {anchored && (
          <p className="mb-4 text-xs text-muted-foreground">
            History ending {new Date(through).toLocaleString()}.{" "}
            <button className="underline" onClick={() => onHoursChange(hours)}>
              Use latest
            </button>
          </p>
        )}
        {missingSharedCount > 0 && (
          <p role="status" className="mb-4 text-sm text-muted-foreground">
            Some listings from this link are missing from the current catalog.
          </p>
        )}
        {mixed && (
          <p className="mb-4 p-3 bg-amber-50 text-amber-900 border border-amber-200 rounded text-xs">
            This selection mixes {kind ? "configurations" : "GPU models"} or
            billing types. Check both when comparing rates.
          </p>
        )}
        <OfferRadar offers={offers} />
        <details className="mt-5 rounded-lg border border-border p-4">
          <summary className="cursor-pointer font-medium">
            Estimate job cost
          </summary>
          <div className="mt-4">
            <JobCostCalculator offers={offers} />
          </div>
        </details>
        <div
          className="comparison-metrics mt-5 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Exact offer details"
        >
          <table className="w-full text-sm border-collapse">
            <caption className="text-left text-base font-semibold mb-2">
              Exact offer details
            </caption>
            <thead>
              <tr>
                <th scope="col" className="text-left p-3 text-muted-foreground">
                  Metric
                </th>
                {offers.map((o, index) => (
                  <th
                    key={o.offerId}
                    scope="col"
                    className="p-3 text-left min-w-44"
                  >
                    <span className="mb-2 inline-flex rounded bg-muted px-2 py-0.5 font-data text-xs">
                      {index + 1}
                    </span>
                    <div className="flex items-center gap-2">
                      <img
                        src={providerLogo(o.providerId)}
                        alt=""
                        width={24}
                        height={24}
                        className="object-contain"
                      />
                      <span>{o.providerName}</span>
                    </div>
                    <p className="font-normal mt-1">{o.gpuModelName}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, get]) => (
                <tr key={label} className="border-t border-border">
                  <th
                    scope="row"
                    className="text-left p-3 font-medium text-muted-foreground"
                  >
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
                <th
                  scope="row"
                  className="p-3 text-left font-medium text-muted-foreground"
                >
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
                <th
                  scope="row"
                  className="p-3 text-left font-medium text-muted-foreground"
                >
                  Source
                </th>
                {offers.map(o => (
                  <td key={o.offerId} className="p-3">
                    <a
                      className="text-teal underline"
                      href={o.kind ? o.providerLink : o.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {o.kind || o.dataSource === "pricing_page"
                        ? "Pricing details"
                        : "Provider API"}{" "}
                      ↗
                    </a>
                  </td>
                ))}
              </tr>
              <tr className="border-t border-border">
                <th
                  scope="row"
                  className="p-3 text-left font-medium text-muted-foreground"
                >
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
      </div>
    </Modal>
  );
}
