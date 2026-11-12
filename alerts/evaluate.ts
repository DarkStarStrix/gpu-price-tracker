import {
  computeListings,
  isCurrent,
  listingUnit,
  type Listing,
  type Snapshot,
} from "../shared/catalog";
import type { Evaluation, Watch } from "../shared/watchlist";

export function evaluateWatches(
  watches: Watch[],
  previous: Evaluation,
  snapshot: Snapshot,
  now = Date.now()
): Evaluation {
  const offers = new Map<string, Listing>(
    [...snapshot.offers, ...computeListings(snapshot)].map(offer => [
      offer.offerId,
      offer,
    ])
  );
  const previousById = new Map(
    previous.observed.map(observation => [observation.offerId, observation])
  );
  const queued = new Map(
    previous.pending
      .filter(event => now - Date.parse(event.at) <= 2 * 3_600_000)
      .map(event => [event.offerId, event])
  );
  const observed: Evaluation["observed"] = [];
  const pending: Evaluation["pending"] = [];
  for (const watch of watches) {
    const offer = offers.get(watch.offerId);
    const before = previousById.get(watch.offerId);
    let event = queued.get(watch.offerId);
    if (
      offer &&
      isCurrent(snapshot, offer, now) &&
      (!before || offer.observedAt > before.at)
    ) {
      const below = watch.price !== null && offer.pricePerGpuHr <= watch.price;
      const stock =
        offer.availability === "unknown"
          ? (before?.stock ?? null)
          : offer.availability;
      const events = [];
      if (before && below && !before.below)
        events.push(
          `USD ${offer.pricePerGpuHr.toFixed(3)} per ${listingUnit(offer.kind)} reached your target.`
        );
      if (
        before &&
        watch.restock &&
        offer.availability === "available" &&
        before.stock !== "available"
      )
        events.push("The provider now reports available stock.");
      if (events.length) {
        event = {
          offerId: watch.offerId,
          at: offer.observedAt,
          title: `${offer.providerName} · ${offer.gpuModelName}`.slice(0, 100),
          body: events.join(" "),
          gpu: offer.gpuModelId,
          billing: offer.billingModel ?? "on-demand",
        };
      }
      observed.push({
        offerId: watch.offerId,
        at: offer.observedAt,
        below,
        stock,
      });
    } else if (before) {
      observed.push(before);
    }
    if (event) pending.push(event);
  }
  return { observed, pending };
}
