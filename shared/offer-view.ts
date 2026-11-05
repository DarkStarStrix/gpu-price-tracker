import { isCurrent, type Snapshot, type GpuOffer } from "./catalog";
export const billingLabel = (o: GpuOffer) =>
  o.billingModel === "spot" ? "Spot · interruptible" : "On-demand";
export const cloudLabel = (o: GpuOffer) =>
  o.cloudType === "secure"
    ? "Secure Cloud"
    : o.cloudType === "community"
      ? "Community Cloud"
      : "Cloud tier unspecified";
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
