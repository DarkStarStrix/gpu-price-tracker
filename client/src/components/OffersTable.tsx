/*
  OffersTable — Premium sortable/filterable GPU offers table
  Design: Data Observatory v2 — dense data, hover glow, refined mono typography
*/

import { useState, useMemo } from "react";
import {
  OFFERS, GPU_MODELS, PROVIDERS,
  getProvider, getGpuModel, formatPrice, getSparkline,
  bestValueScore,
  type Offer, type AvailabilityState,
} from "@/lib/data";
import { Sparkline } from "./Sparkline";
import { AvailabilityBadge } from "./AvailabilityBadge";
import { CategoryBadge } from "./CategoryBadge";
import { ReliabilityDots } from "./ReliabilityDots";
import {
  ExternalLink, ArrowUpDown, ArrowUp, ArrowDown,
  Filter, X, Search, SlidersHorizontal,
} from "lucide-react";

type SortKey = "price" | "gpu" | "provider" | "vram" | "reliability" | "value" | "availability";
type SortDir = "asc" | "desc";

interface Filters {
  gpuModel: string;
  provider: string;
  availability: string;
  search: string;
  maxPrice: number | null;
}

export function OffersTable() {
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filters, setFilters] = useState<Filters>({
    gpuModel: "", provider: "", availability: "", search: "", maxPrice: null,
  });
  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "price" ? "asc" : "desc"); }
  };

  const filteredOffers = useMemo(() => {
    let result = [...OFFERS];
    if (filters.gpuModel)    result = result.filter(o => o.gpuModelId === filters.gpuModel);
    if (filters.provider)    result = result.filter(o => o.providerId === filters.provider);
    if (filters.availability) result = result.filter(o => o.availability === filters.availability);
    if (filters.maxPrice !== null) result = result.filter(o => o.pricePerGpuHr <= filters.maxPrice!);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(o => {
        const gpu = getGpuModel(o.gpuModelId);
        const prov = getProvider(o.providerId);
        return (gpu?.name.toLowerCase().includes(q)) || (prov?.name.toLowerCase().includes(q)) || o.region.toLowerCase().includes(q);
      });
    }
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "price":        cmp = a.pricePerGpuHr - b.pricePerGpuHr; break;
        case "gpu":          cmp = (getGpuModel(a.gpuModelId)?.name ?? "").localeCompare(getGpuModel(b.gpuModelId)?.name ?? ""); break;
        case "provider":     cmp = (getProvider(a.providerId)?.name ?? "").localeCompare(getProvider(b.providerId)?.name ?? ""); break;
        case "vram":         cmp = a.vramPerGpuGb - b.vramPerGpuGb; break;
        case "reliability":  cmp = (getProvider(a.providerId)?.reliabilityScore ?? 0) - (getProvider(b.providerId)?.reliabilityScore ?? 0); break;
        case "value":        cmp = bestValueScore(a) - bestValueScore(b); break;
        case "availability": {
          const order: Record<AvailabilityState, number> = { available: 0, limited: 1, unavailable: 2 };
          cmp = order[a.availability] - order[b.availability]; break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return result;
  }, [filters, sortKey, sortDir]);

  const activeFilterCount = [filters.gpuModel, filters.provider, filters.availability, filters.search, filters.maxPrice !== null ? "x" : ""].filter(Boolean).length;
  const clearFilters = () => setFilters({ gpuModel: "", provider: "", availability: "", search: "", maxPrice: null });

  return (
    <section className="mb-10 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">All Offers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-data font-medium text-foreground">{filteredOffers.length}</span>
            <span className="text-muted-foreground"> of </span>
            <span className="font-data">{OFFERS.length}</span>
            <span className="text-muted-foreground"> offers</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="GPU, provider, region…"
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              className="pl-9 pr-3 py-2 text-sm bg-card border border-border rounded-lg w-52 focus:outline-none focus:ring-1 focus:ring-[oklch(0.62_0.19_218_/_0.4)] focus:border-[oklch(0.62_0.19_218_/_0.4)] transition-all duration-200 placeholder:text-muted-foreground/50"
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
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2.5 mb-5 p-4 bg-card border border-border rounded-xl animate-scale-in">
          <select
            value={filters.gpuModel}
            onChange={(e) => setFilters(f => ({ ...f, gpuModel: e.target.value }))}
            className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg font-sans focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All GPUs</option>
            {GPU_MODELS.map(g => <option key={g.id} value={g.id}>{g.name} ({g.vramGb}GB)</option>)}
          </select>
          <select
            value={filters.provider}
            onChange={(e) => setFilters(f => ({ ...f, provider: e.target.value }))}
            className="px-3 py-1.5 text-sm bg-background border border-border rounded-lg font-sans focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">All Providers</option>
            {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
              <SortHeader label="GPU" sortKey="gpu" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="VRAM" sortKey="vram" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
              <SortHeader label="Provider" sortKey="provider" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-4 py-3 text-left mono-label text-muted-foreground hidden lg:table-cell">Config</th>
              <th className="px-4 py-3 text-left mono-label text-muted-foreground hidden md:table-cell">Region</th>
              <SortHeader label="$/GPU/hr" sortKey="price" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
              <th className="px-4 py-3 text-center mono-label text-muted-foreground hidden lg:table-cell">7d</th>
              <SortHeader label="Avail." sortKey="availability" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
              <SortHeader label="Reliability" sortKey="reliability" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {filteredOffers.map((offer, idx) => (
              <OfferRow key={offer.id} offer={offer} isEven={idx % 2 === 0} rank={idx} />
            ))}
            {filteredOffers.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-16 text-center">
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

function OfferRow({ offer, isEven, rank }: { offer: Offer; isEven: boolean; rank: number }) {
  const provider = getProvider(offer.providerId);
  const gpu = getGpuModel(offer.gpuModelId);
  if (!provider || !gpu) return null;

  const sparkData = getSparkline(offer.id, offer.pricePerGpuHr);
  const isTopOffer = rank < 3;

  return (
    <tr
      className={`border-b border-border/40 transition-all duration-150 hover:bg-[oklch(0.62_0.19_218_/_0.025)] ${
        isEven ? "bg-card" : "bg-[oklch(0.975_0.003_85)]"
      }`}
    >
      {/* GPU */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {isTopOffer && (
            <span className="w-1.5 h-1.5 rounded-full bg-[oklch(0.62_0.19_218)] flex-shrink-0" />
          )}
          <div>
            <div className="font-medium text-foreground text-sm">{gpu.name}</div>
            <div className="font-data text-[10px] text-muted-foreground">{gpu.architecture}</div>
          </div>
        </div>
      </td>

      {/* VRAM */}
      <td className="px-4 py-3 font-data text-sm text-foreground hidden sm:table-cell">
        {offer.vramPerGpuGb} <span className="text-muted-foreground text-[10px]">GB</span>
      </td>

      {/* Provider */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">{provider.name}</span>
          <CategoryBadge category={provider.category} />
        </div>
        {offer.cloudType && (
          <span className="font-data text-[10px] text-muted-foreground capitalize">{offer.cloudType}</span>
        )}
      </td>

      {/* Config */}
      <td className="px-4 py-3 hidden lg:table-cell">
        <span className="font-data text-xs text-muted-foreground">
          {offer.gpuCount}× GPU · {offer.vcpus} vCPU · {offer.ramGb}GB
        </span>
      </td>

      {/* Region */}
      <td className="px-4 py-3 font-data text-xs text-muted-foreground hidden md:table-cell">
        {offer.region}
      </td>

      {/* Price */}
      <td className="px-4 py-3 text-right">
        <div className="font-data text-base font-semibold text-foreground tracking-tight">
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
        <Sparkline data={sparkData} width={68} height={20} />
      </td>

      {/* Availability */}
      <td className="px-4 py-3 hidden sm:table-cell">
        <AvailabilityBadge state={offer.availability} />
      </td>

      {/* Reliability */}
      <td className="px-4 py-3 hidden md:table-cell">
        <ReliabilityDots score={provider.reliabilityScore} size={5} />
      </td>

      {/* Link */}
      <td className="px-4 py-3 text-center">
        <a
          href={offer.providerLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-teal-subtle text-[oklch(0.62_0.19_218)] transition-all duration-150 hover:scale-110"
          title={`Open ${provider.name}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </td>
    </tr>
  );
}
