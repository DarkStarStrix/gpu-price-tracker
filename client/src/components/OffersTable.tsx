/*
  OffersTable — Detailed sortable/filterable listing of all GPU offers
  Data Observatory design: dense data table with inline sparklines, monospace values
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
  Filter, X, Search,
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
    gpuModel: "",
    provider: "",
    availability: "",
    search: "",
    maxPrice: null,
  });
  const [showFilters, setShowFilters] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "price" ? "asc" : "desc");
    }
  };

  const filteredOffers = useMemo(() => {
    let result = [...OFFERS];

    if (filters.gpuModel) {
      result = result.filter(o => o.gpuModelId === filters.gpuModel);
    }
    if (filters.provider) {
      result = result.filter(o => o.providerId === filters.provider);
    }
    if (filters.availability) {
      result = result.filter(o => o.availability === filters.availability);
    }
    if (filters.maxPrice !== null) {
      result = result.filter(o => o.pricePerGpuHr <= filters.maxPrice!);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(o => {
        const gpu = getGpuModel(o.gpuModelId);
        const prov = getProvider(o.providerId);
        return (
          (gpu?.name.toLowerCase().includes(q)) ||
          (prov?.name.toLowerCase().includes(q)) ||
          o.region.toLowerCase().includes(q)
        );
      });
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "price":
          cmp = a.pricePerGpuHr - b.pricePerGpuHr;
          break;
        case "gpu":
          cmp = (getGpuModel(a.gpuModelId)?.name ?? "").localeCompare(getGpuModel(b.gpuModelId)?.name ?? "");
          break;
        case "provider":
          cmp = (getProvider(a.providerId)?.name ?? "").localeCompare(getProvider(b.providerId)?.name ?? "");
          break;
        case "vram":
          cmp = a.vramPerGpuGb - b.vramPerGpuGb;
          break;
        case "reliability":
          cmp = (getProvider(a.providerId)?.reliabilityScore ?? 0) - (getProvider(b.providerId)?.reliabilityScore ?? 0);
          break;
        case "value":
          cmp = bestValueScore(a) - bestValueScore(b);
          break;
        case "availability": {
          const order: Record<AvailabilityState, number> = { available: 0, limited: 1, unavailable: 2 };
          cmp = order[a.availability] - order[b.availability];
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [filters, sortKey, sortDir]);

  const activeFilterCount = [filters.gpuModel, filters.provider, filters.availability, filters.search, filters.maxPrice !== null ? "x" : ""].filter(Boolean).length;

  const clearFilters = () => setFilters({ gpuModel: "", provider: "", availability: "", search: "", maxPrice: null });

  return (
    <section className="mb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">All Offers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            <span className="font-data">{filteredOffers.length}</span> of <span className="font-data">{OFFERS.length}</span> offers
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search GPU, provider, region..."
              value={filters.search}
              onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
              className="pl-8 pr-3 py-1.5 text-sm bg-card border border-border rounded-md w-56 focus:outline-none focus:ring-1 focus:ring-ring font-sans placeholder:text-muted-foreground/60"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-md transition-colors ${
              showFilters || activeFilterCount > 0
                ? "bg-[oklch(0.65_0.18_220_/_0.08)] border-[oklch(0.65_0.18_220_/_0.3)] text-[oklch(0.45_0.14_220)]"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 text-[10px] font-data bg-[oklch(0.65_0.18_220)] text-white rounded-full">{activeFilterCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-card border border-border rounded-md">
          <select
            value={filters.gpuModel}
            onChange={(e) => setFilters(f => ({ ...f, gpuModel: e.target.value }))}
            className="px-2.5 py-1.5 text-sm bg-background border border-border rounded-md font-sans"
          >
            <option value="">All GPUs</option>
            {GPU_MODELS.map(g => (
              <option key={g.id} value={g.id}>{g.name} ({g.vramGb}GB)</option>
            ))}
          </select>

          <select
            value={filters.provider}
            onChange={(e) => setFilters(f => ({ ...f, provider: e.target.value }))}
            className="px-2.5 py-1.5 text-sm bg-background border border-border rounded-md font-sans"
          >
            <option value="">All Providers</option>
            {PROVIDERS.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <select
            value={filters.availability}
            onChange={(e) => setFilters(f => ({ ...f, availability: e.target.value }))}
            className="px-2.5 py-1.5 text-sm bg-background border border-border rounded-md font-sans"
          >
            <option value="">Any Availability</option>
            <option value="available">Available</option>
            <option value="limited">Limited</option>
            <option value="unavailable">Unavailable</option>
          </select>

          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">Max $/hr:</label>
            <input
              type="number"
              step="0.5"
              min="0"
              placeholder="--"
              value={filters.maxPrice ?? ""}
              onChange={(e) => setFilters(f => ({ ...f, maxPrice: e.target.value ? parseFloat(e.target.value) : null }))}
              className="w-20 px-2 py-1.5 text-sm font-data bg-background border border-border rounded-md"
            />
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-xs text-[oklch(0.65_0.18_220)] hover:text-[oklch(0.55_0.18_220)] ml-auto"
            >
              <X className="w-3 h-3" /> Clear all
            </button>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded-md bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-[oklch(0.96_0.005_90)]">
              <SortHeader label="GPU" sortKey="gpu" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <SortHeader label="VRAM" sortKey="vram" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
              <SortHeader label="Provider" sortKey="provider" currentKey={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2.5 text-left text-[11px] font-data font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Config</th>
              <th className="px-3 py-2.5 text-left text-[11px] font-data font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Region</th>
              <SortHeader label="$/GPU/hr" sortKey="price" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
              <th className="px-3 py-2.5 text-center text-[11px] font-data font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">7d Trend</th>
              <SortHeader label="Avail." sortKey="availability" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
              <SortHeader label="Reliability" sortKey="reliability" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
              <th className="px-3 py-2.5 text-center text-[11px] font-data font-medium text-muted-foreground uppercase tracking-wider w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filteredOffers.map((offer, idx) => (
              <OfferRow key={offer.id} offer={offer} isEven={idx % 2 === 0} />
            ))}
            {filteredOffers.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                  No offers match your filters. Try adjusting your criteria.
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
      className={`px-3 py-2.5 text-left text-[11px] font-data font-medium text-muted-foreground uppercase tracking-wider cursor-pointer select-none hover:text-foreground transition-colors ${className}`}
      onClick={() => onSort(key)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive ? (
          dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </span>
    </th>
  );
}

function OfferRow({ offer, isEven }: { offer: Offer; isEven: boolean }) {
  const provider = getProvider(offer.providerId);
  const gpu = getGpuModel(offer.gpuModelId);
  if (!provider || !gpu) return null;

  const sparkData = getSparkline(offer.id, offer.pricePerGpuHr);

  return (
    <tr className={`border-b border-border/40 hover:bg-[oklch(0.65_0.18_220_/_0.03)] transition-colors ${isEven ? "" : "bg-[oklch(0.97_0.003_90)]"}`}>
      {/* GPU */}
      <td className="px-3 py-2.5">
        <div className="font-medium text-foreground">{gpu.name}</div>
        <div className="font-data text-[10px] text-muted-foreground">{gpu.architecture}</div>
      </td>

      {/* VRAM */}
      <td className="px-3 py-2.5 font-data text-sm text-foreground hidden sm:table-cell">
        {offer.vramPerGpuGb} GB
      </td>

      {/* Provider */}
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{provider.name}</span>
          <CategoryBadge category={provider.category} />
        </div>
        {offer.cloudType && (
          <span className="font-data text-[10px] text-muted-foreground">{offer.cloudType}</span>
        )}
      </td>

      {/* Config */}
      <td className="px-3 py-2.5 font-data text-xs text-muted-foreground hidden lg:table-cell">
        <span>{offer.gpuCount}x GPU</span>
        <span className="mx-1 text-border">|</span>
        <span>{offer.vcpus} vCPU</span>
        <span className="mx-1 text-border">|</span>
        <span>{offer.ramGb}GB RAM</span>
      </td>

      {/* Region */}
      <td className="px-3 py-2.5 font-data text-xs text-muted-foreground hidden md:table-cell">
        {offer.region}
      </td>

      {/* Price */}
      <td className="px-3 py-2.5 text-right">
        <span className="font-data text-sm font-semibold text-foreground">{formatPrice(offer.pricePerGpuHr)}</span>
        {offer.gpuCount > 1 && (
          <div className="font-data text-[10px] text-muted-foreground">{formatPrice(offer.totalNodePriceHr)}/node</div>
        )}
      </td>

      {/* Sparkline */}
      <td className="px-3 py-2.5 text-center hidden lg:table-cell">
        <Sparkline data={sparkData} width={72} height={20} />
      </td>

      {/* Availability */}
      <td className="px-3 py-2.5 hidden sm:table-cell">
        <AvailabilityBadge state={offer.availability} />
      </td>

      {/* Reliability */}
      <td className="px-3 py-2.5 hidden md:table-cell">
        <ReliabilityDots score={provider.reliabilityScore} size={5} />
      </td>

      {/* Link */}
      <td className="px-3 py-2.5 text-center">
        <a
          href={offer.providerLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-[oklch(0.65_0.18_220_/_0.08)] text-[oklch(0.65_0.18_220)] transition-colors"
          title={`Open ${provider.name}`}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </td>
    </tr>
  );
}
