import { isCurrent, type Snapshot, type GpuOffer } from "@shared/catalog";

/*
  GPU Provider Price Tracker — Data Layer
  Contains all provider data, GPU models, normalization logic, and utility functions.
  Data sourced from provider pricing pages (Lambda, RunPod, CoreWeave, TensorDock, FluidStack, Paperspace).
*/

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProviderCategory = "stable" | "marketplace" | "shifting_pool";
export type AvailabilityState =
  | "available"
  | "limited"
  | "unavailable"
  | "unknown";
export type BillingModel = "on-demand" | "spot" | "reserved";

export interface Provider {
  id: string;
  name: string;
  category: ProviderCategory;
  website: string;
  regions: string[];
  billingModel: BillingModel;
  notes: string;
  logo?: string;
}

export interface GpuModel {
  id: string;
  name: string;
  aliases: string[];
  vramGb: number;
  architecture: string;
  generation: "current" | "previous" | "legacy";
}

export type Offer = GpuOffer;

export interface ProviderSummary {
  provider: Provider;
  gpuInventory: string[];
  lowestPrices: Record<string, number>;
  regionCoverage: string[];
  offerCount: number;
}

export interface ComparisonRow {
  gpuModelId: string;
  gpuModelName: string;
  vramGb: number;
  providers: {
    providerId: string;
    providerName: string;
    lowestPrice: number;
    availability: AvailabilityState;
    link: string;
  }[];
  lowestOverall: number;
}

// ─── GPU Models ──────────────────────────────────────────────────────────────

export const GPU_MODELS: GpuModel[] = [];

// ─── Providers ───────────────────────────────────────────────────────────────

export const PROVIDERS: Provider[] = [
  {
    id: "lambda",
    name: "Lambda",
    category: "stable",
    website: "https://lambda.ai",
    regions: ["US-East", "US-West", "US-South", "EU-Central"],
    billingModel: "on-demand",
    notes:
      "Lambda Cloud instance catalog. Credentials required for collection.",
  },
  {
    id: "runpod",
    name: "RunPod",
    category: "shifting_pool",
    website: "https://www.runpod.io",
    regions: ["US", "EU", "CA"],
    billingModel: "on-demand",
    notes:
      "Public Secure and Community catalog rates. Capacity reported separately.",
  },
  {
    id: "tensordock",
    name: "TensorDock",
    category: "marketplace",
    website: "https://www.tensordock.com",
    regions: ["US", "EU", "Asia"],
    billingModel: "on-demand",
    notes: "Provider profile retained. Price collection is not connected.",
  },
  {
    id: "coreweave",
    name: "CoreWeave",
    category: "stable",
    website: "https://www.coreweave.com",
    regions: ["US-East", "US-West", "EU-West"],
    billingModel: "on-demand",
    notes:
      "Official published on-demand rates. Capacity is not checked.",
  },
  {
    id: "fluidstack",
    name: "FluidStack",
    category: "shifting_pool",
    website: "https://www.fluidstack.io",
    regions: ["US", "EU", "Asia"],
    billingModel: "on-demand",
    notes: "Provider profile retained. Price collection is not connected.",
  },
  {
    id: "paperspace",
    name: "Paperspace",
    category: "stable",
    website: "https://www.paperspace.com",
    regions: ["US-East", "US-West", "EU"],
    billingModel: "on-demand",
    notes: "Official machine pricing tables. Capacity is not checked.",
  },
];

// Catalog is validated and installed once before the dashboard mounts.
export let OFFERS: Offer[] = [];
export function configureCatalog(snapshot: Snapshot) {
  OFFERS = snapshot.offers.filter(o => isCurrent(snapshot, o));
  GPU_MODELS.splice(
    0,
    GPU_MODELS.length,
    ...Array.from(
      new Map(
        OFFERS.map(o => [
          o.gpuModelId,
          {
            id: o.gpuModelId,
            name: o.gpuModelName,
            aliases: [],
            vramGb: o.vramPerGpuGb ?? 0,
            architecture: "Not specified",
            generation: "current" as const,
          },
        ])
      ).values()
    )
  );
}

// ─── Utility Functions ───────────────────────────────────────────────────────

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find(p => p.id === id);
}

export function getGpuModel(id: string): GpuModel | undefined {
  return GPU_MODELS.find(g => g.id === id);
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

export function formatPriceCompact(price: number): string {
  if (price >= 10) return `$${price.toFixed(1)}`;
  return `$${price.toFixed(2)}`;
}

export function categoryLabel(cat: ProviderCategory): string {
  switch (cat) {
    case "stable":
      return "Stable";
    case "marketplace":
      return "Marketplace";
    case "shifting_pool":
      return "Shifting Pool";
  }
}

export function categoryColor(cat: ProviderCategory): string {
  switch (cat) {
    case "stable":
      return "bg-teal/15 text-teal";
    case "marketplace":
      return "bg-coral/15 text-coral";
    case "shifting_pool":
      return "bg-limited/15 text-limited";
  }
}

export function availabilityLabel(state: AvailabilityState): string {
  switch (state) {
    case "available":
      return "Available";
    case "limited":
      return "Limited";
    case "unavailable":
      return "Unavailable";
    case "unknown":
      return "Unknown";
  }
}

export function availabilityColor(state: AvailabilityState): string {
  switch (state) {
    case "available":
      return "text-available";
    case "limited":
      return "text-limited";
    case "unavailable":
      return "text-unavailable";
    case "unknown":
      return "text-muted-foreground";
  }
}

// ─── Comparison Builder ──────────────────────────────────────────────────────

export function buildComparisons(gpuModelIds?: string[]): ComparisonRow[] {
  const targetModels = gpuModelIds
    ? GPU_MODELS.filter(g => gpuModelIds.includes(g.id))
    : GPU_MODELS;

  return targetModels
    .map(gpu => {
      const gpuOffers = OFFERS.filter(o => o.gpuModelId === gpu.id);
      const providerMap = new Map<string, Offer>();

      // Keep lowest price per provider
      for (const offer of gpuOffers) {
        const existing = providerMap.get(offer.providerId);
        if (!existing || offer.pricePerGpuHr < existing.pricePerGpuHr) {
          providerMap.set(offer.providerId, offer);
        }
      }

      const providers = Array.from(providerMap.values())
        .map(offer => {
          const provider = getProvider(offer.providerId)!;
          return {
            providerId: offer.providerId,
            providerName: provider.name,
            lowestPrice: offer.pricePerGpuHr,
            availability: offer.availability,
            link: offer.providerLink,
          };
        })
        .sort((a, b) => a.lowestPrice - b.lowestPrice);

      const lowestOverall = providers.length > 0 ? providers[0].lowestPrice : 0;

      return {
        gpuModelId: gpu.id,
        gpuModelName: gpu.name,
        vramGb: gpu.vramGb,
        providers,
        lowestOverall,
      };
    })
    .filter(row => row.providers.length > 0);
}

// ─── Provider Summary Builder ────────────────────────────────────────────────

export function buildProviderSummaries(): ProviderSummary[] {
  return PROVIDERS.map(provider => {
    const providerOffers = OFFERS.filter(o => o.providerId === provider.id);
    const gpuIds = Array.from(new Set(providerOffers.map(o => o.gpuModelId)));
    const gpuInventory = gpuIds.map(id => getGpuModel(id)?.name ?? id);
    const lowestPrices: Record<string, number> = {};
    for (const offer of providerOffers) {
      const gpuName = getGpuModel(offer.gpuModelId)?.name ?? offer.gpuModelId;
      if (
        !lowestPrices[gpuName] ||
        offer.pricePerGpuHr < lowestPrices[gpuName]
      ) {
        lowestPrices[gpuName] = offer.pricePerGpuHr;
      }
    }
    const regionCoverage = Array.from(
      new Set(providerOffers.map(o => o.region))
    );

    return {
      provider,
      gpuInventory,
      lowestPrices,
      regionCoverage,
      offerCount: providerOffers.length,
    };
  });
}
