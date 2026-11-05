import { isCurrent, type Snapshot } from "./catalog";
export function marketOffers(
  snapshot: Snapshot,
  gpu: string,
  billing: string,
  now = Date.now()
) {
  return snapshot.offers
    .filter(
      o =>
        o.gpuModelId === gpu &&
        (o.billingModel ?? "on-demand") === billing &&
        isCurrent(snapshot, o, now)
    )
    .sort(
      (a, b) =>
        a.pricePerGpuHr - b.pricePerGpuHr || a.offerId.localeCompare(b.offerId)
    );
}
export function h100Quote(
  snapshot: Snapshot,
  billing = "on-demand",
  now = Date.now()
) {
  return marketOffers(snapshot, "h100-sxm", billing, now).find(
    o => o.availability !== "unavailable"
  );
}
export function marketSeries(
  snapshot: Snapshot,
  offerId: string,
  since: number,
  until = Date.now()
) {
  return [
    ...new Map(
      snapshot.history
        .filter(
          h =>
            h.offerId === offerId &&
            Date.parse(h.observedAt) >= since &&
            Date.parse(h.observedAt) <= until
        )
        .map(h => [
          Date.parse(h.observedAt),
          {
            time: Date.parse(h.observedAt),
            price: h.pricePerGpuHr,
            origin: h.historyOrigin ?? "collector",
          },
        ])
    ).values(),
  ].sort((a, b) => a.time - b.time);
}
export function marketStats(points: { price: number }[]) {
  if (!points.length) return null;
  const first = points[0].price,
    last = points.at(-1)!.price;
  return {
    first,
    last,
    change: last - first,
    percent: ((last - first) / first) * 100,
    high: Math.max(...points.map(p => p.price)),
    low: Math.min(...points.map(p => p.price)),
    count: points.length,
  };
}
