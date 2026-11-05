/*
  OffersTable — Live GPU offers table loaded from the published snapshot.
  Features: sorting, filtering, comparison selection (2-3 GPUs), price alert coral glow.
*/

import { useState, useMemo } from "react";
import { catalog, sparklines } from "@/lib/catalog";
import { isCurrent } from "@shared/catalog";

import { formatPrice } from "@/lib/data";
import { Sparkline } from "./Sparkline";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { CategoryBadge } from "./CategoryBadge";
import { ComparisonDrawer } from "./ComparisonDrawer";
import { PriceAlertModal } from "./PriceAlertModal";

import { usePriceAlerts } from "../hooks/usePriceAlerts";
import type { GpuOffer } from "@shared/catalog";

import {
  ExternalLink, ArrowUpDown, ArrowUp, ArrowDown,
  X, Search, SlidersHorizontal, GitCompare, Bell,
  Loader2, Download, Lock,
} from "lucide-react";

type SortKey = "price" | "gpu" | "provider" | "vram" | "availability";
type SortDir = "asc" | "desc";


interface Filters {
  gpuModel: string;
  provider: string;
  availability: string;
  search: string;
  maxPrice: number | null;
}

export function OffersTable() {
  const offers = catalog.offers;
  const isLoading = false;
  const sparklineMap = sparklines();

  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<Filters>({
    gpuModel: "", provider: "", availability: "", search: "", maxPrice: null,
  });
  const [showFilters, setShowFilters] = useState(false);

  // Comparison state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showComparison, setShowComparison] = useState(false);

  // Price alert state
  const { alerts, setAlert, clearAlert, getAlert, isAlertTriggered } = usePriceAlerts();
  const [alertTarget, setAlertTarget] = useState<GpuOffer | null>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const toggleSelect = (offerId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(offerId)) return prev.filter(id => id !== offerId);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, offerId];
    });
  };

  const filteredOffers = useMemo(() => {
    let result = [...offers] as GpuOffer[];
    if (filters.gpuModel)     result = result.filter(o => o.gpuModelId === filters.gpuModel);
    if (filters.provider)     result = result.filter(o => o.providerId === filters.provider);
    if (filters.availability) result = result.filter(o => (!isCurrent(catalog, o) ? "unknown" : o.availability) === filters.availability);
    if (filters.maxPrice !== null) result = result.filter(o => o.pricePerGpuHr <= filters.maxPrice!);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(o =>
        o.gpuModelName.toLowerCase().includes(q) ||
        o.providerName.toLowerCase().includes(q) ||
        o.region.toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "price":        cmp = a.pricePerGpuHr - b.pricePerGpuHr; break;
        case "gpu":          cmp = a.gpuModelName.localeCompare(b.gpuModelName); break;
        case "provider":     cmp = a.providerName.localeCompare(b.providerName); break;
        case "vram":         cmp = (a.vramPerGpuGb ?? -1) - (b.vramPerGpuGb ?? -1); break;
        case "availability": {
          const order: Record<string, number> = { available: 0, limited: 1, unavailable: 2 };
          cmp = (order[a.availability] ?? 3) - (order[b.availability] ?? 3); break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [offers, filters, sortKey, sortDir]);

  const activeFilterCount = [
    filters.gpuModel, filters.provider, filters.availability,
    filters.search, filters.maxPrice !== null ? "x" : "",
  ].filter(Boolean).length;

  const clearFilters = () => setFilters({ gpuModel: "", provider: "", availability: "", search: "", maxPrice: null });

  const selectedOffers = offers.filter(o => selectedIds.includes(o.offerId)).map(o => ({...o, availability: !isCurrent(catalog, o) ? "unknown" as const : o.availability}));
  const alertCount = Object.keys(alerts).length;

  // CSV export of current filtered view
  function exportCSV() {
    const headers = ["GPU","VRAM (GB)","Provider","Region","Config","$/GPU/hr","$/Node/hr","Availability","Cloud Type","Data Source","Observed at","Source URL"];
    const rows = filteredOffers.map(o => [
      o.gpuModelName,
      o.vramPerGpuGb ?? "",
      o.providerName,
      o.region,
      `${o.gpuCount}x GPU / ${o.vcpus ?? "—"} vCPU / ${o.ramGb ?? "—"}GB RAM`,
      o.pricePerGpuHr.toFixed(4),
      o.totalNodePriceHr.toFixed(4),
      !isCurrent(catalog, o) ? "unknown (retained)" : o.availability,
      o.cloudType ?? "",
      o.dataSource, o.observedAt, o.sourceUrl,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? "").replace(/^[=+@-]/, "\'$&").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gpu-prices-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Unique GPU models and providers from live data
  const liveGpuModels = useMemo(() =>
    Array.from(new Map(offers.map(o => [o.gpuModelId, { id: o.gpuModelId, name: o.gpuModelName }])).values()),
    [offers]
  );
  const liveProviders = useMemo(() =>
    Array.from(new Map(offers.map(o => [o.providerId, { id: o.providerId, name: o.providerName }])).values()),
    [offers]
  );

  return (
    <section className="mb-10 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">All Offers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading snapshot…
              </span>
            ) : (
              <>
                <span className="font-data font-medium text-foreground">{filteredOffers.length}</span>
                <span className="text-muted-foreground"> of </span>
                <span className="font-data">{offers.length}</span>
                <span className="text-muted-foreground"> offers</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Alert count badge */}
          {alertCount > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-[oklch(0.65_0.18_25_/_0.3)] rounded-lg bg-[oklch(0.65_0.18_25_/_0.06)] text-[oklch(0.50_0.14_25)]">
              <Bell className="w-3 h-3" />
              {alertCount} alert{alertCount > 1 ? "s" : ""} set
            </div>
          )}

          {/* Compare button */}
          {selectedIds.length > 0 && (
            <button
              onClick={() => setShowComparison(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[oklch(0.22_0.045_255)] text-[oklch(0.95_0.004_85)] rounded-lg hover:bg-[oklch(0.28_0.045_255)] transition-all duration-200"
            >
              <GitCompare className="w-3.5 h-3.5" />
              Compare {selectedIds.length}
            </button>
          )}
          {selectedIds.length > 0 && (
            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="GPU, provider, region…"
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              className="pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-lg w-48 focus:outline-none focus:ring-1 focus:ring-[oklch(0.62_0.19_218_/_0.4)] focus:border-[oklch(0.62_0.19_218_/_0.4)] transition-all duration-200 placeholder:text-muted-foreground/50"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-all duration-200 ${
              showFilters || activeFilterCount > 0
                ? "bg-teal-subtle border-[oklch(0.62_0.19_218_/_0.3)] text-[oklch(0.42_0.16_218)]"
                : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-[oklch(0.82_0.012_85)]"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 w-4 h-4 flex items-center justify-center text-[10px] font-data bg-[oklch(0.62_0.19_218)] text-white rounded-full">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* CSV Export — inline locked button, same height as Filters */}

            <button
              onClick={exportCSV}
              disabled={isLoading}
              title="Export current filtered view as CSV"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-border bg-card text-muted-foreground hover:text-foreground hover:border-[oklch(0.82_0.012_85)] rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>

        </div>
      </div>

      {/* Selection hint */}
      {selectedIds.length === 0 && !isLoading && offers.length > 0 && (
        <p className="mono-label text-muted-foreground mb-3">
          Select 2–3 rows to compare · click the bell icon to set price alerts
        </p>
      )}

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2.5 mb-5 p-4 bg-card border border-border rounded-xl animate-scale-in">
          <select
            value={filters.gpuModel}
            onChange={(e) => setFilters(f => ({ ...f, gpuModel: e.target.value }))}
            className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg font-sans focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All GPUs</option>
            {liveGpuModels.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select
            value={filters.provider}
            onChange={(e) => setFilters(f => ({ ...f, provider: e.target.value }))}
            className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg font-sans focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Providers</option>
            {liveProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select
            value={filters.availability}
            onChange={(e) => setFilters(f => ({ ...f, availability: e.target.value }))}
            className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg font-sans focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Any Availability</option>
            <option value="available">Available</option>
            <option value="limited">Limited</option>
            <option value="unavailable">Unavailable</option>
            <option value="unknown">Unknown</option>
          </select>
          <div className="flex items-center gap-2">
            <label className="mono-label text-muted-foreground">Max $/hr</label>
            <input
              type="number" step="0.5" min="0" placeholder="—"
              value={filters.maxPrice ?? ""}
              onChange={(e) => setFilters(f => ({ ...f, maxPrice: e.target.value ? parseFloat(e.target.value) : null }))}
              className="w-20 px-2.5 py-1.5 text-sm font-data bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-[oklch(0.62_0.19_218)] hover:text-[oklch(0.52_0.19_218)] ml-auto transition-colors"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-xl bg-card shadow-[var(--shadow-sm)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[oklch(0.96_0.005_85)]">
              <th className="px-3 py-3 w-8" />
              <SortHeader label="GPU" sortKey="gpu" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="VRAM" sortKey="vram" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
              <SortHeader label="Provider" sortKey="provider" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left mono-label text-muted-foreground hidden lg:table-cell">Config</th>
              <th className="px-4 py-3 text-left mono-label text-muted-foreground hidden md:table-cell">Region</th>
              <SortHeader label="$/GPU/hr" sortKey="price" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
              <th className="px-4 py-3 text-center mono-label text-muted-foreground hidden lg:table-cell">7d</th>
              <SortHeader label="Avail." sortKey="availability" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
              <th className="px-4 py-3 text-left mono-label text-muted-foreground hidden md:table-cell">Observed</th>
              <th className="px-4 py-3 w-16" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={11} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-6 h-6 text-[oklch(0.62_0.19_218)] animate-spin" />
                    <p className="text-sm text-muted-foreground">Loading observed pricing data…</p>
                  </div>
                </td>
              </tr>
            ) : filteredOffers.map((offer, idx) => (
              <OfferRow
                key={offer.offerId}
                offer={offer}
                isEven={idx % 2 === 0}
                rank={idx}
                isSelected={selectedIds.includes(offer.offerId)}
                onToggleSelect={() => toggleSelect(offer.offerId)}
                isAlertTriggered={isCurrent(catalog, offer) && isAlertTriggered(offer.gpuModelId, offer.pricePerGpuHr)}
                onSetAlert={() => setAlertTarget(offer)}
                hasAlert={!!getAlert(offer.gpuModelId)}
                dbSparkline={sparklineMap[offer.offerId]}
              />
            ))}
            {!isLoading && filteredOffers.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="w-8 h-8 text-border" />
                    <p className="text-muted-foreground text-sm">No offers match your filters.</p>
                    <button onClick={clearFilters} className="text-xs text-[oklch(0.62_0.19_218)] hover:underline">Clear filters</button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Comparison Drawer — available to everyone */}
      {showComparison && selectedOffers.length >= 2 && (

          <ComparisonDrawer
            offers={selectedOffers}
            onClose={() => setShowComparison(false)}
          />

      )}

      {/* Price Alert Modal — available to everyone */}
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

function SortHeader({
  label, sortKey: key, currentKey, dir, onSort, className = "",
}: {
  label: string; sortKey: SortKey; currentKey: SortKey; dir: SortDir; onSort: (k: SortKey) => void; className?: string;
}) {
  const isActive = currentKey === key;
  return (
    <th
      className={`px-4 py-3 text-left mono-label cursor-pointer select-none transition-colors duration-150 ${
        isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      } ${className}`}
      onClick={() => onSort(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive
          ? (dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-25" />
        }
      </span>
    </th>
  );
}

function OfferRow({
  offer, isEven, rank, isSelected, onToggleSelect, isAlertTriggered, onSetAlert, hasAlert, dbSparkline,
}: {
  offer: GpuOffer;
  isEven: boolean;
  rank: number;
  isSelected: boolean;
  onToggleSelect: () => void;
  isAlertTriggered: boolean;
  onSetAlert: () => void;
  hasAlert: boolean;
  dbSparkline?: number[];
}) {
  const isTopOffer = rank < 3;

  const sparkData = dbSparkline ?? [];

  // Coral glow styles when alert is triggered
  const alertGlowClass = isAlertTriggered
    ? "ring-1 ring-[oklch(0.68_0.18_25_/_0.5)] bg-[oklch(0.68_0.18_25_/_0.04)]"
    : "";

  return (
    <tr
      className={`border-b border-border/40 transition-all duration-150 cursor-pointer
        ${isSelected
          ? "bg-[oklch(0.62_0.19_218_/_0.06)] ring-1 ring-inset ring-[oklch(0.62_0.19_218_/_0.25)]"
          : isAlertTriggered
          ? "bg-[oklch(0.68_0.18_25_/_0.03)] hover:bg-[oklch(0.68_0.18_25_/_0.06)]"
          : isEven
          ? "bg-card hover:bg-[oklch(0.62_0.19_218_/_0.025)]"
          : "bg-[oklch(0.975_0.003_85)] hover:bg-[oklch(0.62_0.19_218_/_0.025)]"
        }
        ${alertGlowClass}
      `}
      onClick={onToggleSelect}
    >
      {/* Selection checkbox */}
      <td className="px-3 py-3" onClick={e => { e.stopPropagation(); onToggleSelect(); }}>
        <div className={`w-4 h-4 rounded border-2 transition-all duration-150 flex items-center justify-center ${
          isSelected
            ? "bg-[oklch(0.62_0.19_218)] border-[oklch(0.62_0.19_218)]"
            : "border-border hover:border-[oklch(0.72_0.12_218)]"
        }`}>
          {isSelected && <span className="text-white text-[8px] font-bold">✓</span>}
        </div>
      </td>

      {/* GPU */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {isTopOffer && (
            <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.62_0.19_218)] flex-shrink-0" />
          )}
          {isAlertTriggered && (
            <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.68_0.18_25)] flex-shrink-0 animate-pulse" title="Price alert triggered!" />
          )}
          <div>
            <div className="font-medium text-foreground text-sm">{offer.gpuModelName}</div>
            <div className="font-data text-[10px] text-muted-foreground">{offer.gpuModelId}</div>
          </div>
        </div>
      </td>

      {/* VRAM */}
      <td className="px-4 py-3 font-data text-sm text-foreground hidden sm:table-cell">
        {offer.vramPerGpuGb ?? "—"} <span className="text-muted-foreground text-[10px]">GB</span>
      </td>

      {/* Provider */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">{offer.providerName}</span>
        </div>
        {offer.cloudType && (
          <span className="font-data text-[10px] text-muted-foreground capitalize">{offer.cloudType}</span>
        )}
        <a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer" className="block font-data text-[10px] text-muted-foreground underline" title="Official source for this observation">{offer.dataSource === "pricing_page" ? "Published rate" : "API observation"}</a>
      </td>

      {/* Config */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="font-data text-xs text-muted-foreground">
          {offer.gpuCount}× GPU · {offer.vcpus ?? "—"} vCPU · {offer.ramGb ?? "—"}GB
        </span>
      </td>

      {/* Region */}
      <td className="px-4 py-3 font-data text-xs text-muted-foreground hidden md:table-cell">
        {offer.region}
      </td>

      {/* Price */}
      <td className="px-4 py-3 text-right">
        <div className={`font-data text-base font-semibold tracking-tight ${
          isAlertTriggered ? "text-[oklch(0.55_0.15_25)]" : "text-foreground"
        }`}>
          {formatPrice(offer.pricePerGpuHr)}
        </div>
        {offer.gpuCount > 1 && (
          <div className="font-data text-[10px] text-muted-foreground">
            {formatPrice(offer.totalNodePriceHr)}/node
          </div>
        )}
      </td>

      {/* Sparkline */}
      <td className="px-4 py-3 text-center hidden lg:table-cell">
        {sparkData.length >= 2 ? <Sparkline data={sparkData} width={68} height={20} /> : <span title="History starts with collected observations">—</span>}
      </td>

      {/* Availability */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <AvailabilityBadge state={!isCurrent(catalog, offer) ? "unknown" : offer.availability} />
      </td>

      {/* Observation freshness */}
      <td className="px-4 py-3 hidden md:table-cell">
        <span className="font-data text-[10px]" title={offer.observedAt}>{!isCurrent(catalog, offer) ? "Stale / retained" : (offer.dataSource === "pricing_page" ? "Rate checked" : "Observed")}<br />{new Date(offer.observedAt).toLocaleString()}</span>
      </td>

      {/* Actions */}
      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={onSetAlert}
            className={`inline-flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-150 hover:scale-110 ${
              hasAlert
                ? "text-[oklch(0.62_0.18_25)] hover:bg-[oklch(0.65_0.18_25_/_0.1)]"
                : "text-muted-foreground hover:text-[oklch(0.62_0.18_25)] hover:bg-[oklch(0.65_0.18_25_/_0.08)]"
            }`}
            title="Set a local alert (checked while the page is open)"
          >
            <Bell className="w-3.5 h-3.5" />
          </button>
          <a
            href={offer.providerLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-teal-subtle text-[oklch(0.62_0.19_218)] transition-all duration-150 hover:scale-110"
            title={`Open ${offer.providerName} · Source: ${offer.sourceUrl}`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </td>
    </tr>
  );
}
