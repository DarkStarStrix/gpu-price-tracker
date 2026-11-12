import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  BellPlus,
  Calculator,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  GitCompare,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  computeListings,
  isCurrent,
  listingUnit,
  type Listing,
  type ListingKind,
} from "@shared/catalog";
import { computeKinds } from "@shared/compute";
import { toCSV } from "@shared/csv";
import {
  priceHistorySummaries,
  type priceHistorySummary,
} from "@shared/market";
import {
  billingLabel,
  cloudTiers,
  reconcileSelection,
  computeSpecs,
} from "@shared/offer-view";
import { catalog, fullCatalog, historyLoadError } from "@/lib/catalog";
import { formatPrice, hourlyPrice, providerLogo } from "@/lib/data";
import { usePriceAlerts } from "../hooks/usePriceAlerts";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { ComparisonDrawer } from "./ComparisonDrawer";
import { PriceAlertModal } from "./PriceAlertModal";
import { JobCostCalculator } from "./JobCostCalculator";
import { Modal } from "./Modal";
import {
  emptyOfferFilters,
  viewLink,
  type HistoryHours,
  type OfferFilters,
  type SharedView,
} from "@/lib/view-link";
import "./offers.css";

type SortKey = "price" | "gpu" | "provider" | "vram" | "availability";
type SortDir = "asc" | "desc";
const pageSize = 25;
const emptyFilters = emptyOfferFilters;
type Filters = OfferFilters;
type FilterOption = readonly [value: string, label: string];
const stockOrder = { available: 0, limited: 1, unavailable: 2, unknown: 3 };
const WatchlistDialog = lazy(() =>
  import("./WatchlistDialog").then(module => ({
    default: module.WatchlistDialog,
  }))
);

function sortOffers(
  a: Listing,
  b: Listing,
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
      return (
        (a.kind ? (a.ramGb ?? -1) : (a.vramPerGpuGb ?? -1)) -
        (b.kind ? (b.ramGb ?? -1) : (b.vramPerGpuGb ?? -1))
      );
  }
}

export function OffersTable({
  initialGpu = "",
  kind = "gpu",
  onViewHistory,
  shared,
}: {
  initialGpu?: string;
  kind?: ListingKind;
  onViewHistory?: (id: string) => void;
  shared?: Extract<SharedView, { view: "offers" }>;
}) {
  const snapshot = catalog;
  const gpu = kind === "gpu";
  const title = gpu ? "GPU offers" : computeKinds[kind].label;
  const unit = listingUnit(kind);
  const headingId = useId();
  const advancedId = useId();
  const offers = useMemo<Listing[]>(
    () => (gpu ? snapshot.offers : computeListings(snapshot, kind)),
    [snapshot, gpu, kind]
  );
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<Filters>(
    shared?.filters ?? {
      ...emptyFilters,
      gpuModel: initialGpu,
    }
  );
  const [showFilters, setShowFilters] = useState(() =>
    Boolean(
      shared &&
      (shared.filters.availability ||
        shared.filters.region ||
        shared.filters.cloud ||
        shared.filters.maxPrice)
    )
  );
  const [page, setPage] = useState(1);
  const tableStart = useRef<HTMLHeadingElement>(null);

  const [storedSelectedIds, setSelectedIds] = useState<string[]>(
    shared?.ids ?? []
  );
  const [showComparison, setShowComparison] = useState(
    () => reconcileSelection(shared?.ids ?? [], offers).length >= 2
  );
  const [historyHours, setHistoryHours] = useState<HistoryHours>(
    shared?.hours ?? 168
  );
  const [historyThrough, setHistoryThrough] = useState(shared?.through);
  const comparisonThrough = historyThrough ?? Date.now();
  const [costOffer, setCostOffer] = useState<Listing | null>(null);
  const [watchOffer, setWatchOffer] = useState<Listing | null | undefined>();
  const selectedIds = reconcileSelection(storedSelectedIds, offers);
  const missingSharedCount =
    shared?.ids.filter(id => !offers.some(offer => offer.offerId === id))
      .length ?? 0;
  useEffect(() => {
    if (selectedIds.length !== storedSelectedIds.length)
      setSelectedIds(ids => reconcileSelection(ids, offers));
    if (selectedIds.length < 2) setShowComparison(false);
  }, [offers, selectedIds.length, storedSelectedIds.length]);

  const alertKey = (offer: Listing) =>
    offer.kind ? offer.offerId : offer.gpuModelId;
  const {
    alerts,
    setAlert,
    clearAlert,
    getAlert,
    isAlertTriggered,
    storageError,
  } = usePriceAlerts();
  const [alertTarget, setAlertTarget] = useState<Listing | null>(null);

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
  const visible = useMemo(
    () => filtered.slice(firstIndex, firstIndex + pageSize),
    [filtered, firstIndex]
  );
  const historySnapshot =
    fullCatalog?.generatedAt === snapshot.generatedAt ? fullCatalog : undefined;
  const historyByListing = useMemo(
    () =>
      historySnapshot
        ? priceHistorySummaries(
            historySnapshot,
            visible.map(({ offer }) => offer.offerId)
          )
        : undefined,
    [historySnapshot, visible]
  );
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
  const alertCount = new Set(offers.map(alertKey).filter(id => alerts[id]))
    .size;
  const failedFeeds = (snapshot.compute ?? []).filter(
    feed =>
      !gpu &&
      feed.status === "error" &&
      (feed.kinds?.includes(kind) ||
        feed.rates.some(rate => rate.kind === kind))
  );

  function exportCSV() {
    const headers = [
      gpu ? "GPU" : "Configuration",
      gpu ? "VRAM (GB)" : "RAM (GB)",
      "Provider",
      "Region",
      "Config",
      `USD/${unit}`,
      ...(gpu ? ["$/Node/hr"] : []),
      "Availability",
      "Cloud Type",
      "Data Source",
      "Observed at",
      "Source URL",
      "Billing",
      ...(gpu ? [] : ["Terms"]),
    ];
    const rows = filtered.map(({ offer: o, retained }) => [
      o.gpuModelName,
      (o.kind ? o.ramGb : o.vramPerGpuGb) ?? "",
      o.providerName,
      o.region,
      o.kind
        ? computeSpecs(o)
        : o.configurationKnown === false
          ? "Per-GPU rate; node size unspecified"
          : `${o.gpuCount}x GPU / ${o.vcpus ?? "—"} vCPU / ${o.ramGb ?? "—"}GB RAM`,
      o.kind ? String(o.pricePerGpuHr) : o.pricePerGpuHr.toFixed(4),
      ...(o.kind
        ? []
        : [
            o.configurationKnown === false ? "" : o.totalNodePriceHr.toFixed(4),
          ]),
      retained ? "unknown (retained)" : o.availability,
      o.cloudType,
      o.dataSource,
      o.observedAt,
      o.sourceUrl,
      o.billingModel ?? "on-demand",
      ...(o.kind ? [o.terms ?? ""] : []),
    ]);
    const url = URL.createObjectURL(
      new Blob([toCSV([headers, ...rows])], { type: "text/csv" })
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${kind}-prices-${new Date().toISOString().slice(0, 10)}.csv`;
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
    <section className="offer-market" aria-labelledby={headingId}>
      <div className="offer-market__intro">
        <div>
          <h1 id={headingId}>{title}</h1>
          <p>Compare hourly rates, configurations, and reported stock.</p>
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
                placeholder={
                  gpu
                    ? "GPU, provider, region"
                    : "Configuration, provider, region"
                }
                value={filters.search}
                onChange={e => updateFilter("search", e.target.value)}
              />
            </span>
          </label>
          {filter(
            "gpuModel",
            gpu ? "GPU model" : "Configuration",
            gpu ? "All GPUs" : "All configurations",
            liveGpuModels
          )}
          {filter("provider", "Provider", "All providers", liveProviders)}
          {filter("billing", "Billing", "All billing", [
            ["on-demand", "On-demand"],
            ["spot", "Spot · interruptible"],
          ])}
          <button
            type="button"
            className="offer-button"
            aria-expanded={showFilters}
            aria-controls={advancedId}
            onClick={() => setShowFilters(value => !value)}
          >
            <SlidersHorizontal size={16} /> More filters
            {extraFilters > 0 ? ` (${extraFilters})` : ""}
          </button>
        </div>
        <div id={advancedId} hidden={!showFilters}>
          <div className="offer-market__extra-filters">
            {filter("availability", "Stock", "Any stock status", [
              ["available", "Available"],
              ["limited", "Limited"],
              ["unavailable", "Unavailable"],
              ["unknown", "Needs stock check"],
            ])}
            {filter("region", "Region", "All regions", regions)}
            {gpu &&
              filter("cloud", "Cloud tier", "All cloud tiers", cloudTiers)}
            <label className="offer-field">
              Max USD / {unit}
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
          <button
            type="button"
            className="offer-button"
            onClick={() => setWatchOffer(null)}
          >
            <BellPlus size={15} /> Watchlist
          </button>
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
      {failedFeeds.length > 0 && (
        <p role="status" className="mb-2 text-sm text-muted-foreground">
          Refresh failed for{" "}
          {failedFeeds.map(feed => feed.providerName).join(", ")}.
        </p>
      )}
      {storageError && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          Browser storage unavailable. Alert settings are unchanged.
        </p>
      )}
      {missingSharedCount > 0 && (
        <p role="status" className="mb-2 text-sm text-muted-foreground">
          {missingSharedCount}{" "}
          {missingSharedCount === 1
            ? "listing from this link is"
            : "listings from this link are"}{" "}
          missing from the current catalog.
        </p>
      )}

      <div
        className="offer-market__table-wrap"
        tabIndex={0}
        role="region"
        aria-label={`${title} results`}
      >
        <table className="offer-market__table" aria-label={title}>
          <thead>
            <tr>
              <th scope="col" className="offer-select">
                <span className="sr-only">Select for comparison</span>
              </th>
              {sort(gpu ? "GPU" : "Configuration", "gpu")}
              {sort(`USD / ${unit}`, "price", "offer-rate")}
              {sort("Provider", "provider")}
              {sort(gpu ? "VRAM" : "RAM", "vram")}
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
                history={historyByListing?.get(offer.offerId)}
                onEstimate={() => setCostOffer(offer)}
                onWatch={() => setWatchOffer(offer)}
                retained={retained}
                availability={availability}
                isSelected={selectedIds.includes(offer.offerId)}
                selectionFull={selectedIds.length === 3}
                onToggleSelect={() => toggleSelect(offer.offerId)}
                isAlertTriggered={
                  !retained &&
                  isAlertTriggered(alertKey(offer), offer.pricePerGpuHr)
                }
                onSetAlert={() => setAlertTarget(offer)}
                hasAlert={!!getAlert(alertKey(offer))}
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
          hours={historyHours}
          through={comparisonThrough}
          anchored={historyThrough !== undefined}
          onHoursChange={hours => {
            setHistoryHours(hours);
            setHistoryThrough(undefined);
          }}
          history={
            fullCatalog?.generatedAt === catalog.generatedAt
              ? fullCatalog
              : undefined
          }
          shareUrl={viewLink(
            {
              view: "offers",
              ids: selectedIds,
              kind,
              filters,
              hours: historyHours,
              through: comparisonThrough,
            },
            window.location.href
          )}
          missingSharedCount={missingSharedCount}
          onClose={() => setShowComparison(false)}
        />
      )}
      {costOffer && (
        <Modal titleId="job-estimate-title" onClose={() => setCostOffer(null)}>
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 id="job-estimate-title" className="text-lg font-semibold">
                Estimate job cost
              </h2>
              <button
                type="button"
                aria-label="Close estimate"
                className="rounded p-2 hover:bg-muted"
                onClick={() => setCostOffer(null)}
              >
                <X size={18} />
              </button>
            </div>
            <JobCostCalculator offers={[costOffer]} />
          </div>
        </Modal>
      )}
      {watchOffer !== undefined && (
        <Suspense fallback={<p role="status">Loading watchlist…</p>}>
          <WatchlistDialog
            offer={watchOffer}
            onClose={() => setWatchOffer(undefined)}
          />
        </Suspense>
      )}
      {alertTarget && (
        <PriceAlertModal
          gpuModelId={alertKey(alertTarget)}
          gpuModelName={alertTarget.gpuModelName}
          currentPrice={alertTarget.pricePerGpuHr}
          kind={alertTarget.kind}
          existingAlert={getAlert(alertKey(alertTarget))}
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
  history,
  onEstimate,
  onWatch,
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
  offer: Listing;
  history?: ReturnType<typeof priceHistorySummary>;
  onEstimate: () => void;
  onWatch: () => void;
  retained: boolean;
  availability: Listing["availability"];
  isSelected: boolean;
  selectionFull: boolean;
  onToggleSelect: () => void;
  isAlertTriggered: boolean;
  onSetAlert: () => void;
  hasAlert: boolean;
  onViewHistory?: () => void;
}) {
  const historyLabel = !history
    ? historyLoadError
      ? "History unavailable"
      : "Loading history…"
    : history.state === "empty"
      ? "No samples"
      : history.state === "collecting"
        ? "First sample"
        : history.state === "unchanged"
          ? "Unchanged"
          : `${history.stats!.change >= 0 ? "+" : ""}${history.stats!.percent.toFixed(2)}%`;
  const memory = offer.kind ? offer.ramGb : offer.vramPerGpuGb;
  const tier = cloudTiers.find(([id]) => id === offer.cloudType)?.[1];
  const observed = new Date(offer.observedAt).toLocaleString();
  const node = offer.kind
    ? computeSpecs(offer)
    : offer.configurationKnown === false
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
        {node && <small>{node}</small>}
        {offer.kind && offer.terms && <small>{offer.terms}</small>}
      </th>
      <td className="offer-rate">
        <strong className="font-data">
          {offer.kind
            ? hourlyPrice.format(offer.pricePerGpuHr)
            : formatPrice(offer.pricePerGpuHr)}
        </strong>
        {!offer.kind &&
          offer.configurationKnown !== false &&
          offer.gpuCount > 1 && (
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
        {memory === null ? "—" : `${memory} GB`}
      </td>
      <td className="offer-history">
        {onViewHistory ? (
          <button
            type="button"
            className="offer-text-button"
            onClick={onViewHistory}
            aria-label={`View history for ${description}`}
            title={
              history?.firstAt
                ? `${new Date(history.firstAt).toLocaleString()} – ${new Date(history.lastAt!).toLocaleString()}`
                : undefined
            }
          >
            {historyLabel}
          </button>
        ) : (
          <span>{historyLabel}</span>
        )}
        {history?.stats && (
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
            aria-label={`Estimate job cost for ${description}`}
            title="Estimate job cost"
            onClick={onEstimate}
          >
            <Calculator size={16} />
          </button>
          <button
            type="button"
            className="offer-button offer-icon-button"
            aria-label={`Watch listing for ${description}`}
            title="Watch price or stock"
            onClick={onWatch}
          >
            <BellPlus size={16} />
          </button>
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
          href={offer.kind ? offer.providerLink : offer.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Observed ${observed}`}
        >
          {offer.kind ? "Pricing details" : "Source"} <ExternalLink size={11} />
          <time dateTime={offer.observedAt}>
            {new Date(offer.observedAt).toLocaleDateString()}
          </time>
        </a>
      </td>
    </tr>
  );
}
