import { offerSchema, type GpuOffer } from "../shared/catalog";
import {
  addedProviders,
  type AddedProviderId,
} from "../shared/added-providers";
import { gpuId } from "./gpu";

export function providerOffer(
  providerId: AddedProviderId,
  model: string,
  config: {
    id: string;
    at: string;
    url: string;
    link?: string;
    count?: number;
    minRentalGpus?: number;
    vram?: number | null;
    vcpus?: number | null;
    ram?: number | null;
    region?: string;
    rate: number;
    basis: NonNullable<GpuOffer["priceBasis"]>;
    tier?: string;
    billing?: NonNullable<GpuOffer["billingModel"]>;
    availability?: GpuOffer["availability"];
    digest?: string;
  }
): GpuOffer {
  const count = config.count ?? 1;
  const vram = config.vram || null;
  const billing = config.billing ?? "on-demand";
  const nodeRate =
    config.basis === "per_instance_hour" ? config.rate : config.rate * count;
  return offerSchema.parse({
    offerId: `${providerId}:${config.id}`,
    providerId,
    providerName: addedProviders[providerId].name,
    gpuModelId: gpuId(model, vram),
    gpuModelName: model,
    gpuCount: count,
    minRentalGpus: config.minRentalGpus,
    configurationKnown: config.count !== undefined,
    vramPerGpuGb: vram,
    vcpus: config.vcpus || null,
    ramGb: config.ram || null,
    region: config.region || "Not specified",
    pricePerGpuHr:
      config.basis === "per_gpu_hour" ? config.rate : nodeRate / count,
    totalNodePriceHr: nodeRate,
    availability: config.availability ?? "unknown",
    providerLink: config.link ?? config.url,
    sourceUrl: config.url,
    cloudType: config.tier ?? billing,
    billingModel: billing,
    dataSource: config.digest ? "pricing_page" : "api",
    sourcePriceHr: config.rate,
    priceBasis: config.basis,
    sourceSha256: config.digest,
    observedAt: config.at,
  });
}
