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

export function priceHistorySummary(
  snapshot: Snapshot,
  offerId: string,
  now = Date.now()
) {
  const points = marketSeries(snapshot, offerId, now - 7 * 86400_000, now);
  const stats = marketStats(points);
  return {
    stats,
    firstAt: points[0]?.time,
    lastAt: points.at(-1)?.time,
    state: !stats
      ? ("empty" as const)
      : stats.count < 2
        ? ("collecting" as const)
        : Math.abs(stats.high - stats.low) < 0.000001
          ? ("unchanged" as const)
          : ("changed" as const),
  };
}

/** Prefer current quotes; retain an explicitly labeled last observation during missed refreshes. */
export function displayQuote(
  snapshot: Snapshot,
  gpu: string,
  billing = "on-demand",
  now = Date.now()
) {
  const eligible = snapshot.offers.filter(
    o =>
      o.gpuModelId === gpu &&
      (o.billingModel ?? "on-demand") === billing &&
      o.availability !== "unavailable"
  );
  const fresh = eligible.filter(o => isCurrent(snapshot, o, now));
  const offer = [...(fresh.length ? fresh : eligible)].sort(
    (a, b) =>
      a.pricePerGpuHr - b.pricePerGpuHr || a.offerId.localeCompare(b.offerId)
  )[0];
  return offer
    ? { offer, retained: !isCurrent(snapshot, offer, now) }
    : undefined;
}
