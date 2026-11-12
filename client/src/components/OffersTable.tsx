import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  GitCompare,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { isCurrent, type GpuOffer } from "@shared/catalog";
import { toCSV } from "@shared/csv";
import { priceHistorySummary } from "@shared/market";
import {
  billingLabel,
  cloudTiers,
  reconcileSelection,
} from "@shared/offer-view";
import { catalog } from "@/lib/catalog";
import { formatPrice, providerLogo } from "@/lib/data";
import { usePriceAlerts } from "../hooks/usePriceAlerts";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { ComparisonDrawer } from "./ComparisonDrawer";
import { PriceAlertModal } from "./PriceAlertModal";
import "./offers.css";

type SortKey = "price" | "gpu" | "provider" | "vram" | "availability";
type SortDir = "asc" | "desc";
const pageSize = 25;
const emptyFilters = {
  billing: "",
  cloud: "",
  gpuModel: "",
  provider: "",
  availability: "",
  region: "",
  search: "",
  maxPrice: "",
};
type Filters = typeof emptyFilters;
type FilterOption = readonly [value: string, label: string];
const stockOrder = { available: 0, limited: 1, unavailable: 2, unknown: 3 };

function sortOffers(
  a: GpuOffer,
  b: GpuOffer,
  key: Exclude<SortKey, "availability">
) {
  switch (key) {
    case "price":
      return a.pricePerGpuHr - b.pricePerGpuHr;
    case "gpu":
      return a.gpuModelName.localeCompare(b.gpuModelName);
    case "provider":
      return a.providerName.localeCompare(b.providerName);
    case "vram":
      return (a.vramPerGpuGb ?? -1) - (b.vramPerGpuGb ?? -1);
  }
}

export function OffersTable({
  initialGpu = "",
  onViewHistory,
}: {
  initialGpu?: string;
  onViewHistory?: (id: string) => void;
}) {
  const { offers } = catalog;
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<Filters>({
    ...emptyFilters,
    gpuModel: initialGpu,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const tableStart = useRef<HTMLHeadingElement>(null);

  const [storedSelectedIds, setSelectedIds] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);
  const selectedIds = reconcileSelection(storedSelectedIds, offers);
  useEffect(() => {
    if (selectedIds.length !== storedSelectedIds.length)
      setSelectedIds(ids => reconcileSelection(ids, offers));
    if (selectedIds.length < 2) setShowComparison(false);
  }, [offers, selectedIds.length, storedSelectedIds.length]);

  const {
    alerts,
    setAlert,
    clearAlert,
    getAlert,
    isAlertTriggered,
    storageError,
  } = usePriceAlerts();
  const [alertTarget, setAlertTarget] = useState<GpuOffer | null>(null);

  function updateFilter(key: keyof Filters, value: string) {
    setFilters(previous => ({ ...previous, [key]: value }));
    setPage(1);
  }
  function clearFilters() {
    setFilters(emptyFilters);
    setPage(1);
  }
  function handleSort(key: SortKey) {
    setSortDir(key === sortKey && sortDir === "asc" ? "desc" : "asc");
    setSortKey(key);
    setPage(1);
  }
  function toggleSelect(offerId: string) {
    setSelectedIds(previous => {
      const current = reconcileSelection(previous, offers);
      if (current.includes(offerId))
        return current.filter(id => id !== offerId);
      return current.length >= 3 ? current : [...current, offerId];
    });
  }
  function goToPage(next: number) {
    setPage(next);
    tableStart.current?.focus({ preventScroll: true });
    tableStart.current?.scrollIntoView({ block: "start" });
  }

  const view = useMemo(() => {
    const now = Date.now();
    return offers.map(offer => {
      const retained = !isCurrent(catalog, offer, now);
      return {
        offer,
        retained,
        availability: retained ? ("unknown" as const) : offer.availability,
      };
    });
  }, [offers]);
  const filtered = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const maximum =
      filters.maxPrice === "" ? Infinity : Number(filters.maxPrice);
    return view
      .filter(
        ({ offer, availability }) =>
          (!filters.billing ||
            (offer.billingModel ?? "on-demand") === filters.billing) &&
          (!filters.cloud || offer.cloudType === filters.cloud) &&
          (!filters.gpuModel || offer.gpuModelId === filters.gpuModel) &&
          (!filters.provider || offer.providerId === filters.provider) &&
          (!filters.availability || availability === filters.availability) &&
          (!filters.region || offer.region === filters.region) &&
          offer.pricePerGpuHr <= maximum &&
          (!query ||
            [offer.gpuModelName, offer.providerName, offer.region].some(value =>
              value.toLowerCase().includes(query)
            ))
      )
      .sort((a, b) => {
        const order =
          sortKey === "availability"
            ? stockOrder[a.availability] - stockOrder[b.availability]
            : sortOffers(a.offer, b.offer, sortKey);
        return sortDir === "asc" ? order : -order;
      });
  }, [filters, sortDir, sortKey, view]);

  const liveGpuModels = useMemo(
    () =>
      [
        ...new Map(offers.map(o => [o.gpuModelId, o.gpuModelName])).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true })),
    [offers]
  );
  const liveProviders = useMemo(
    () =>
      [
        ...new Map(offers.map(o => [o.providerId, o.providerName])).entries(),
      ].sort((a, b) => a[1].localeCompare(b[1])),
    [offers]
  );
  const regions = useMemo(
    () =>
      [...new Set(offers.map(o => o.region))].sort().map(r => [r, r] as const),
    [offers]
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * pageSize;
  const visible = filtered.slice(firstIndex, firstIndex + pageSize);
  const reported = filtered.filter(
    item => item.availability !== "unknown"
  ).length;
  const shownProviders = new Set(filtered.map(({ offer }) => offer.providerId))
    .size;
  const selectedOffers = selectedIds.flatMap(id => {
    const row = view.find(({ offer }) => offer.offerId === id);
    return row ? [{ ...row.offer, availability: row.availability }] : [];
  });
  const extraFilters = [
    filters.cloud,
    filters.availability,
    filters.region,
    filters.maxPrice,
  ].filter(Boolean).length;
  const hasFilters = Object.values(filters).some(Boolean);
  const alertCount = Object.keys(alerts).length;

  function exportCSV() {
    const headers = [
      "GPU",
      "VRAM (GB)",
      "Provider",
      "Region",
      "Config",
      "$/GPU/hr",
      "$/Node/hr",
      "Availability",
      "Cloud Type",
      "Data Source",
      "Observed at",
      "Source URL",
      "Billing",
    ];
    const rows = filtered.map(({ offer: o, retained }) => [
      o.gpuModelName,
      o.vramPerGpuGb ?? "",
      o.providerName,
      o.region,
      o.configurationKnown === false
        ? "Per-GPU rate; node size unspecified"
        : `${o.gpuCount}x GPU / ${o.vcpus ?? "—"} vCPU / ${o.ramGb ?? "—"}GB RAM`,
      o.pricePerGpuHr.toFixed(4),
      o.configurationKnown === false ? "" : o.totalNodePriceHr.toFixed(4),
      retained ? "unknown (retained)" : o.availability,
      o.cloudType,
      o.dataSource,
      o.observedAt,
      o.sourceUrl,
      o.billingModel ?? "on-demand",
    ]);
    const url = URL.createObjectURL(
      new Blob([toCSV([headers, ...rows])], { type: "text/csv" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `gpu-prices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filter = (
    key: keyof Filters,
    label: string,
    all: string,
    options: FilterOption[]
  ) => (
    <FilterSelect
      key={key}
      label={label}
      value={filters[key]}
      all={all}
      options={options}
      onChange={value => updateFilter(key, value)}
    />
  );
  const sort = (label: string, key: SortKey, className?: string) => (
    <SortHeader
      label={label}
      sortKey={key}
      currentKey={sortKey}
      dir={sortDir}
      onSort={handleSort}
      className={className}
    />
  );

  return (
    <section className="offer-market" aria-labelledby="offers-title">
      <div className="offer-market__intro">
        <div>
          <h1 id="offers-title">GPU offers</h1>
          <p>Compare hourly rates, GPU configurations, and reported stock.</p>
        </div>
        <button
          type="button"
          className="offer-button"
          onClick={exportCSV}
          disabled={!filtered.length}
        >
          <Download size={16} /> Export CSV
        </button>
      </div>

      <div className="offer-market__filters">
        <div className="offer-market__primary-filters">
          <label className="offer-field offer-field--search">
            Search offers
            <span>
              <Search size={16} aria-hidden="true" />
              <input
                type="search"
                placeholder="GPU, provider, region"
                value={filters.search}
                onChange={e => updateFilter("search", e.target.value)}
              />
            </span>
          </label>
          {filter("gpuModel", "GPU model", "All GPUs", liveGpuModels)}
          {filter("provider", "Provider", "All providers", liveProviders)}
          {filter("billing", "Billing", "All billing", [
            ["on-demand", "On-demand"],
            ["spot", "Spot · interruptible"],
          ])}
          <button
            type="button"
            className="offer-button"
            aria-expanded={showFilters}
            aria-controls="offer-advanced-filters"
            onClick={() => setShowFilters(value => !value)}
          >
            <SlidersHorizontal size={16} /> More filters
            {extraFilters > 0 ? ` (${extraFilters})` : ""}
          </button>
        </div>
        <div id="offer-advanced-filters" hidden={!showFilters}>
          <div className="offer-market__extra-filters">
            {filter("availability", "Stock", "Any stock status", [
              ["available", "Available"],
              ["limited", "Limited"],
              ["unavailable", "Unavailable"],
              ["unknown", "Needs stock check"],
            ])}
            {filter("region", "Region", "All regions", regions)}
            {filter("cloud", "Cloud tier", "All cloud tiers", cloudTiers)}
            <label className="offer-field">
              Max USD / GPU-hour
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Any price"
                value={filters.maxPrice}
                onChange={e => updateFilter("maxPrice", e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="offer-market__status">
        <div>
          <h2
            ref={tableStart}
            tabIndex={-1}
            className="scroll-mt-20 text-base font-semibold"
          >
            {filtered.length.toLocaleString()}{" "}
            {filtered.length === 1 ? "listing" : "listings"}
          </h2>
          <p role="status">
            {shownProviders} {shownProviders === 1 ? "provider" : "providers"} ·
            Stock reported for {reported}
          </p>
        </div>
        <div className="offer-market__status-actions">
          {visible.length > 0 && selectedIds.length === 0 && (
            <span className="inline-flex items-center gap-1.5">
              <GitCompare size={15} aria-hidden="true" /> Select 2–3 offers to
              compare
            </span>
          )}
          {alertCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Bell size={14} /> {alertCount}{" "}
              {alertCount === 1 ? "alert" : "alerts"}
            </span>
          )}
          {hasFilters && (
            <button
              type="button"
              className="offer-text-button"
              onClick={clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>
      {storageError && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          Browser storage unavailable. Alert settings are unchanged.
        </p>
      )}

      <div
        className="offer-market__table-wrap"
        tabIndex={0}
        role="region"
        aria-label="GPU offer results"
      >
        <table className="offer-market__table" aria-label="GPU offers">
          <thead>
            <tr>
              <th scope="col" className="offer-select">
                <span className="sr-only">Select for comparison</span>
              </th>
              {sort("GPU", "gpu")}
              {sort("USD / GPU-hour", "price", "offer-rate")}
              {sort("Provider", "provider")}
              {sort("VRAM", "vram")}
              <th scope="col">7-day history</th>
              {sort("Stock", "availability")}
              <th scope="col" className="offer-actions">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ offer, retained, availability }) => (
              <OfferRow
                key={offer.offerId}
                offer={offer}
                retained={retained}
                availability={availability}
                isSelected={selectedIds.includes(offer.offerId)}
                selectionFull={selectedIds.length === 3}
                onToggleSelect={() => toggleSelect(offer.offerId)}
                isAlertTriggered={
                  !retained &&
                  isAlertTriggered(offer.gpuModelId, offer.pricePerGpuHr)
                }
                onSetAlert={() => setAlertTarget(offer)}
                hasAlert={!!getAlert(offer.gpuModelId)}
                onViewHistory={
                  onViewHistory ? () => onViewHistory(offer.offerId) : undefined
                }
              />
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={8} className="offer-market__empty">
                  <p>No offers match your filters.</p>
                  <button
                    type="button"
                    className="offer-text-button"
                    onClick={clearFilters}
                  >
                    Clear filters
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <nav className="offer-market__pages" aria-label="Offer result pages">
          <span aria-live="polite">
            {firstIndex + 1}–{firstIndex + visible.length} of {filtered.length}
          </span>
          <div>
            <button
              type="button"
              className="offer-button"
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span className="font-data">
              {currentPage} / {pageCount}
            </span>
            <button
              type="button"
              className="offer-button"
              disabled={currentPage === pageCount}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </nav>
      )}

      {selectedOffers.length > 0 && (
        <aside className="offer-market__selection" aria-label="Selected offers">
          <div className="offer-market__selection-label">
            <GitCompare size={18} />
            <strong>{selectedOffers.length} of 3 selected</strong>
          </div>
          <div className="offer-market__selected-offers">
            {selectedOffers.map(offer => (
              <button
                key={offer.offerId}
                type="button"
                className="offer-selected"
                aria-label={`Remove ${offer.providerName} ${offer.gpuModelName} from comparison`}
                onClick={() => toggleSelect(offer.offerId)}
              >
                <span>
                  {offer.providerName} · {offer.gpuModelName}
                </span>
                <X size={14} />
              </button>
            ))}
          </div>
          <div className="offer-market__selection-actions">
            <button
              type="button"
              className="offer-text-button"
              onClick={() => setSelectedIds([])}
            >
              Clear selection
            </button>
            <button
              type="button"
              className="offer-button offer-button--primary"
              disabled={selectedOffers.length < 2}
              onClick={() => setShowComparison(true)}
            >
              {selectedOffers.length === 1
                ? "Select one more"
                : `Compare ${selectedOffers.length}`}
            </button>
          </div>
        </aside>
      )}

      {showComparison && selectedOffers.length >= 2 && (
        <ComparisonDrawer
          offers={selectedOffers}
          onClose={() => setShowComparison(false)}
        />
      )}
      {alertTarget && (
        <PriceAlertModal
          gpuModelId={alertTarget.gpuModelId}
          gpuModelName={alertTarget.gpuModelName}
          currentPrice={alertTarget.pricePerGpuHr}
          existingAlert={getAlert(alertTarget.gpuModelId)}
          onSave={setAlert}
          onClear={clearAlert}
          onClose={() => setAlertTarget(null)}
        />
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  all,
  options,
  onChange,
}: {
  label: string;
  value: string;
  all: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="offer-field">
      {label}
      <select value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{all}</option>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SortHeader({
  label,
  sortKey,
  currentKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  currentKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      scope="col"
      className={className}
      aria-sort={
        active ? (dir === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <button type="button" onClick={() => onSort(sortKey)}>
        {label}
        <Icon size={13} aria-hidden="true" />
      </button>
    </th>
  );
}

function OfferRow({
  offer,
  retained,
  availability,
  isSelected,
  selectionFull,
  onToggleSelect,
  isAlertTriggered,
  onSetAlert,
  hasAlert,
  onViewHistory,
}: {
  offer: GpuOffer;
  retained: boolean;
  availability: GpuOffer["availability"];
  isSelected: boolean;
  selectionFull: boolean;
  onToggleSelect: () => void;
  isAlertTriggered: boolean;
  onSetAlert: () => void;
  hasAlert: boolean;
  onViewHistory?: () => void;
}) {
  const history = priceHistorySummary(catalog, offer.offerId);
  const historyLabel =
    history.state === "empty"
      ? "No samples"
      : history.state === "collecting"
        ? "First sample"
        : history.state === "unchanged"
          ? "Unchanged"
          : `${history.stats!.change >= 0 ? "+" : ""}${history.stats!.percent.toFixed(2)}%`;
  const tier = cloudTiers.find(([id]) => id === offer.cloudType)?.[1];
  const observed = new Date(offer.observedAt).toLocaleString();
  const node =
    offer.configurationKnown === false
      ? "Node size unspecified"
      : [
          `${offer.gpuCount}× GPU`,
          offer.vcpus === null ? "" : `${offer.vcpus} vCPU`,
          offer.ramGb === null ? "" : `${offer.ramGb} GB RAM`,
        ]
          .filter(Boolean)
          .join(" · ");
  const description = [
    `${offer.providerName} ${offer.gpuModelName} ${node}`,
    billingLabel(offer),
    tier,
    offer.region === "Not specified" ? "" : offer.region,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <tr
      data-selected={isSelected || undefined}
      data-alert={isAlertTriggered || undefined}
    >
      <td className="offer-select">
        <label
          title={
            selectionFull && !isSelected ? "Three offers selected" : undefined
          }
        >
          <input
            type="checkbox"
            aria-label={`Compare ${description}`}
            checked={isSelected}
            disabled={selectionFull && !isSelected}
            onChange={onToggleSelect}
          />
        </label>
      </td>
      <th scope="row" className="offer-gpu">
        <strong>{offer.gpuModelName}</strong>
        <small>{node}</small>
      </th>
      <td className="offer-rate">
        <strong className="font-data">
          {formatPrice(offer.pricePerGpuHr)}
        </strong>
        {offer.configurationKnown !== false && offer.gpuCount > 1 && (
          <small className="font-data">
            {formatPrice(offer.totalNodePriceHr)} / node-hour
          </small>
        )}
        {retained && (
          <small className="offer-retained" title={observed}>
            Last observed
          </small>
        )}
      </td>
      <td className="offer-provider">
        <div>
          <img
            src={providerLogo(offer.providerId)}
            alt=""
            width={24}
            height={24}
            loading="lazy"
          />
          <span>
            <strong>{offer.providerName}</strong>
            <small>
              <span
                className={offer.billingModel === "spot" ? "offer-spot" : ""}
              >
                {billingLabel(offer)}
              </span>
              {tier && ` · ${tier}`}
            </small>
            {offer.region !== "Not specified" && <small>{offer.region}</small>}
          </span>
        </div>
      </td>
      <td className="offer-vram font-data">
        {offer.vramPerGpuGb === null ? "—" : `${offer.vramPerGpuGb} GB`}
      </td>
      <td className="offer-history">
        {onViewHistory ? (
          <button
            type="button"
            className="offer-text-button"
            onClick={onViewHistory}
            aria-label={`View history for ${description}`}
            title={
              history.firstAt
                ? `${new Date(history.firstAt).toLocaleString()} – ${new Date(history.lastAt!).toLocaleString()}`
                : undefined
            }
          >
            {historyLabel}
          </button>
        ) : (
          <span>{historyLabel}</span>
        )}
        {history.stats && (
          <small>
            {history.stats.count}{" "}
            {history.stats.count === 1 ? "sample" : "samples"}
          </small>
        )}
      </td>
      <td>
        <AvailabilityBadge
          providerLink={offer.providerLink}
          state={availability}
        />
      </td>
      <td className="offer-actions">
        <div>
          <button
            type="button"
            className="offer-button offer-icon-button"
            data-alert-set={hasAlert || undefined}
            aria-label={`Set price alert for ${description}`}
            title={hasAlert ? "Edit price alert" : "Set price alert"}
            onClick={onSetAlert}
          >
            <Bell size={16} />
          </button>
          <a
            href={offer.providerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="offer-button"
            aria-label={`Open provider ${offer.providerName}`}
          >
            Open <ExternalLink size={14} />
          </a>
        </div>
        <a
          className="offer-source"
          href={offer.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Observed ${observed}`}
        >
          Source <ExternalLink size={11} />
          <time dateTime={offer.observedAt}>
            {new Date(offer.observedAt).toLocaleDateString()}
          </time>
        </a>
      </td>
    </tr>
  );
}
