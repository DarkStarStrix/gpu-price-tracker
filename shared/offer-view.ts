import {
  isCurrent,
  type Snapshot,
  type GpuOffer,
  type Listing,
} from "./catalog";
export const billingLabel = (o: Listing) =>
  o.billingModel === "spot" ? "Spot · interruptible" : "On-demand";
export const cloudTiers: [string, string][] = [
  ["secure", "Secure Cloud"],
  ["community", "Community Cloud"],
  ["verified", "Verified Cloud"],
  ["vm", "VM"],
  ["confidential", "Confidential VM"],
  ["bare-metal", "Bare metal"],
];
export const cloudLabel = (o: Listing) =>
  cloudTiers.find(([id]) => id === o.cloudType)?.[1] ??
  "Cloud tier unspecified";
export interface PoolFilters {
  gpu: string;
  billing: string;
  cloud: string;
  availability: string;
  region: string;
}
export function filterPool(
  snapshot: Snapshot,
  provider: string,
  f: PoolFilters,
  now = Date.now()
) {
  return snapshot.offers.filter(
    o =>
      o.providerId === provider &&
      (!f.gpu || o.gpuModelId === f.gpu) &&
      (!f.billing || (o.billingModel ?? "on-demand") === f.billing) &&
      (!f.cloud || o.cloudType === f.cloud) &&
      (!f.region || o.region === f.region) &&
      (!f.availability ||
        (isCurrent(snapshot, o, now) ? o.availability : "unknown") ===
          f.availability)
  );
}

export function reconcileSelection(
  ids: string[],
  offers: Pick<GpuOffer, "offerId">[]
) {
  const current = new Set(offers.map(o => o.offerId));
  return [...new Set(ids)].filter(id => current.has(id)).slice(0, 3);
}

export function computeSpecs(offer: Listing) {
  return [
    offer.vcpus === null ? "" : `${offer.vcpus} vCPU`,
    offer.ramGb === null ? "" : `${offer.ramGb} GB RAM`,
    offer.kind && offer.storageGb ? `${offer.storageGb} GB disk` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
