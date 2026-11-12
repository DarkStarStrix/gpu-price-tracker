import {
  isCurrent,
  type Snapshot,
  type GpuOffer,
  type ListingKind,
} from "@shared/catalog";
import type { ComputeFeed } from "@shared/compute";
import { addedProviders } from "@shared/added-providers";

/*
  GPU Provider Price Tracker — Data Layer
  Contains all provider data, GPU models, normalization logic, and utility functions.
  Provider metadata and projections of the validated, current catalog.
*/

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProviderCategory = "stable" | "marketplace" | "shifting_pool";
export type AvailabilityState =
  "available" | "limited" | "unavailable" | "unknown";
export type BillingModel = "on-demand" | "spot";

export interface Provider {
  id: string;
  name: string;
  category: ProviderCategory;
  website: string;
  notes: string;
}

export interface GpuModel {
  id: string;
  name: string;
  vramGb: number;
}

export type Offer = GpuOffer & { retained: boolean };

interface ProviderSummary {
  source: Snapshot["sources"][number];
  profile: Provider | undefined;
  pricingUrl: string | undefined;
  compute: ComputeFeed | undefined;
  kinds: ListingKind[];
  gpuInventory: string[];
  lowestPrices: Record<string, number>;
  regionCoverage: string[];
  offerCount: number;
  billingModels: BillingModel[];
  retained: boolean;
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
    retained: boolean;
    observedAt: string;
  }[];
  lowestOverall: number;
}

// ─── GPU Models ──────────────────────────────────────────────────────────────

export const GPU_MODELS: GpuModel[] = [];

// ─── Providers ───────────────────────────────────────────────────────────────

export const PROVIDERS: Provider[] = [
  ...(
    [
      ["e2b", "E2B", "https://e2b.dev/"],
      ["daytona", "Daytona", "https://www.daytona.io/"],
      ["modal", "Modal", "https://modal.com/"],
      ["boat", "boat", "https://boat.dev/"],
      ["vercel", "Vercel", "https://vercel.com/sandbox"],
      [
        "cloudflare",
        "Cloudflare",
        "https://developers.cloudflare.com/sandbox/",
      ],
      ["freestyle", "Freestyle", "https://www.freestyle.sh/docs/vms"],
      ["blaxel", "Blaxel", "https://blaxel.ai/pricing"],
      ["northflank", "Northflank", "https://northflank.com/product/sandboxes"],
    ] as const
  ).map(([id, name, website]) => ({
    id,
    name,
    website,
    category: "stable" as const,
    notes: "Published sandbox configurations and usage rates.",
  })),
  {
    id: "hetzner",
    name: "Hetzner",
    website: "https://www.hetzner.com/cloud/",
    category: "stable",
    notes: "USD Cloud CPU rates by datacenter, before VAT and optional IPv4.",
  },
  ...Object.entries(addedProviders).map(([id, provider]) => ({
    id,
    ...provider,
  })),
  {
    id: "lambda",
    name: "Lambda",
    website: "https://lambda.com/instances",
    category: "stable",
    notes:
      "Published on-demand GPU instance rates and node configurations. Check regional stock with Lambda.",
  },
  ...(
    [
      ["hyperstack", "Hyperstack", "https://www.hyperstack.cloud"],
      ["verda", "Verda", "https://verda.com"],
      ["crusoe", "Crusoe", "https://www.crusoe.ai"],
      [
        "vultr",
        "Vultr",
        "https://docs.vultr.com/product-overviews/cloud-compute",
      ],
      ["nebius", "Nebius", "https://nebius.com"],
      ["hotaisle", "Hot Aisle", "https://hotaisle.xyz"],
      ["digitalocean", "DigitalOcean", "https://www.digitalocean.com"],
      ["civo", "Civo", "https://www.civo.com"],
      ["jarvislabs", "Jarvislabs", "https://jarvislabs.ai"],
      ["massedcompute", "Massed Compute", "https://massedcompute.com"],
    ] as const
  ).map(([id, name, website]) => ({
    id,
    name,
    website,
    category: "stable" as const,
    notes:
      id === "nebius"
        ? "Public interruptible spot prices and provider hourly history. Capacity unknown."
        : id === "digitalocean" || id === "jarvislabs"
          ? "Official USD on-demand and spot rates."
          : "Official current USD on-demand rates. Capacity is not checked.",
  })),
  {
    id: "runpod",
    name: "RunPod",
    category: "shifting_pool",
    website: "https://www.runpod.io",
    notes:
      "Public Secure and Community catalog rates. Capacity reported separately.",
  },
  {
    id: "coreweave",
    name: "CoreWeave",
    category: "stable",
    website: "https://www.coreweave.com",
    notes: "Official published on-demand rates. Capacity is not checked.",
  },
  {
    id: "paperspace",
    name: "Paperspace",
    category: "stable",
    website: "https://www.paperspace.com",
    notes: "Official machine pricing tables. Capacity is not checked.",
  },
  {
    id: "runcrate",
    name: "Runcrate",
    category: "stable",
    website: "https://www.runcrate.ai",
    notes:
      "Public pricing feed, lowest listed rate per GPU-hour. Types with no orderable option are excluded.",
  },
];

// Each validated snapshot replaces the dashboard's offer projection.
export let OFFERS: Offer[] = [];
export function configureCatalog(snapshot: Snapshot) {
  OFFERS = snapshot.offers.map(o => {
    const retained = !isCurrent(snapshot, o);
    return {
      ...o,
      retained,
      availability: retained ? ("unknown" as const) : o.availability,
    };
  });
  GPU_MODELS.splice(
    0,
    GPU_MODELS.length,
    ...Array.from(
      new Map(
        [...OFFERS]
          .sort(
            (a, b) =>
              Number(b.billingModel === "spot") -
                Number(a.billingModel === "spot") ||
              Number(a.vramPerGpuGb !== null) - Number(b.vramPerGpuGb !== null)
          )
          .map(o => [
            o.gpuModelId,
            {
              id: o.gpuModelId,
              name: o.gpuModelName,
              vramGb: o.vramPerGpuGb ?? 0,
            },
          ])
      ).values()
    )
  );
}

// ─── Utility Functions ───────────────────────────────────────────────────────

export function providerLogo(id: string): string {
  const extensions: Record<string, string> = {
    hyperstack: "webp",
    vultr: "ico",
    sixtytwo: "svg",
    paperspace: "webp",
    hotaisle: "svg",
    lambda: "svg",
    runcrate: "webp",
    modal: "svg",
    hetzner: "ico",
    boat: "ico",
    vercel: "ico",
    blaxel: "ico",
    northflank: "ico",
  };
  return `${import.meta.env.BASE_URL}images/providers/${id}.${extensions[id] ?? "png"}`;
}

export function getProvider(id: string): Provider | undefined {
  return PROVIDERS.find(p => p.id === id);
}

export function getGpuModel(id: string): GpuModel | undefined {
  return GPU_MODELS.find(g => g.id === id);
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

export const hourlyPrice = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 6,
});

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

// ─── Comparison Builder ──────────────────────────────────────────────────────

export function buildComparisons(gpuModelIds?: string[]): ComparisonRow[] {
  const targetModels = gpuModelIds
    ? GPU_MODELS.filter(g => gpuModelIds.includes(g.id))
    : GPU_MODELS;

  return targetModels
    .map(gpu => {
      const gpuOffers = OFFERS.filter(
        o => o.gpuModelId === gpu.id && o.billingModel !== "spot"
      );
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
          const provider = getProvider(offer.providerId);
          return {
            providerId: offer.providerId,
            providerName: provider?.name ?? offer.providerName,
            lowestPrice: offer.pricePerGpuHr,
            availability: offer.availability,
            link: offer.providerLink,
            retained: offer.retained,
            observedAt: offer.observedAt,
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

export function catalogProviders(snapshot: Snapshot) {
  const feeds = new Map(
    (snapshot.compute ?? []).map(feed => [feed.providerId, feed])
  );
  const gpuSources = new Set(snapshot.sources.map(source => source.id));
  const sources: Snapshot["sources"] = [
    ...snapshot.sources,
    ...[...feeds.values()]
      .filter(feed => !gpuSources.has(feed.providerId))
      .map(feed => ({
        id: feed.providerId,
        name: feed.providerName,
        status: feed.status,
        checkedAt: snapshot.generatedAt,
        lastSuccessAt: feed.observedAt,
        message:
          feed.status === "ok"
            ? "Published compute rates"
            : "Compute refresh failed",
      })),
  ];
  return sources.map(source => {
    const compute = feeds.get(source.id);
    const kinds: ListingKind[] = gpuSources.has(source.id) ? ["gpu"] : [];
    if (compute) {
      kinds.push(
        ...new Set(compute.kinds ?? compute.rates.map(rate => rate.kind))
      );
    }
    return { source, compute, kinds, profile: getProvider(source.id) };
  });
}

export function buildProviderSummaries(
  snapshot: Snapshot,
  now = Date.now()
): ProviderSummary[] {
  return catalogProviders(snapshot).map(
    ({ source, compute, profile, kinds }) => {
      const providerOffers = snapshot.offers.filter(
        o => o.providerId === source.id
      );
      const gpuInventory = [
        ...new Set([
          ...providerOffers.map(o => o.gpuModelName),
          ...(source.leaseRates?.map(rate => rate.model) ?? []),
        ]),
      ];
      const lowestPrices: Record<string, number> = {};
      for (const offer of providerOffers) {
        const gpuName = offer.gpuModelName;
        if (
          !lowestPrices[gpuName] ||
          offer.pricePerGpuHr < lowestPrices[gpuName]
        ) {
          lowestPrices[gpuName] = offer.pricePerGpuHr;
        }
      }
      const regionCoverage = Array.from(
        new Set([
          ...providerOffers.map(o => o.region).filter(Boolean),
          ...(source.leaseRates?.map(rate => rate.region) ?? []),
        ])
      );

      return {
        source,
        profile,
        compute,
        kinds,
        pricingUrl:
          source.evidence?.sourceUrl ??
          providerOffers[0]?.sourceUrl ??
          compute?.providerLink ??
          compute?.url,
        gpuInventory,
        lowestPrices,
        regionCoverage,
        offerCount: providerOffers.length,
        billingModels: [
          ...new Set(providerOffers.map(o => o.billingModel ?? "on-demand")),
        ],
        retained: providerOffers.some(o => !isCurrent(snapshot, o, now)),
      };
    }
  );
}
