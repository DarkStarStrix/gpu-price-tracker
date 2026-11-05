import type { GpuOffer, PoolPoint } from "./catalog";

// Count observed listings, never physical GPUs. Failed refreshes do not call this function.
export function measurePool(
  providerId: string,
  previous: GpuOffer[],
  current: GpuOffer[],
  observedAt: string,
  comparable: boolean
): PoolPoint {
  const before = new Map(previous.map(o => [o.offerId, o]));
  const after = new Map(current.map(o => [o.offerId, o]));
  return {
    providerId,
    observedAt,
    baseline: !comparable,
    total: current.length,
    available: current.filter(o => o.availability === "available").length,
    limited: current.filter(o => o.availability === "limited").length,
    unavailable: current.filter(o => o.availability === "unavailable").length,
    unknown: current.filter(o => o.availability === "unknown").length,
    added: comparable ? current.filter(o => !before.has(o.offerId)).length : 0,
    removed: comparable
      ? previous.filter(o => !after.has(o.offerId)).length
      : 0,
    priceChanges: comparable
      ? current.filter(
          o =>
            before.has(o.offerId) &&
            Math.abs(before.get(o.offerId)!.pricePerGpuHr - o.pricePerGpuHr) >
              0.00001
        ).length
      : 0,
    availabilityChanges: comparable
      ? current.filter(
          o =>
            before.has(o.offerId) &&
            before.get(o.offerId)!.availability !== o.availability
        ).length
      : 0,
  };
}
