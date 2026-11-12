import type { Listing } from "./catalog";

export function estimateJobCost(
  offer: Pick<
    Listing,
    | "configurationKnown"
    | "gpuCount"
    | "minRentalGpus"
    | "pricePerGpuHr"
    | "totalNodePriceHr"
  >,
  gpus: number,
  hours: number
) {
  if (
    !Number.isSafeInteger(gpus) ||
    gpus < 1 ||
    !Number.isFinite(hours) ||
    hours <= 0
  )
    return null;
  if (offer.gpuCount === null || offer.configurationKnown === false) {
    const total = gpus * hours * offer.pricePerGpuHr;
    return Number.isFinite(total)
      ? { total, nodes: null, billedGpus: null }
      : null;
  }
  const nodes = Math.ceil(gpus / offer.gpuCount);
  const fullNodes = nodes - 1;
  const finalNode = Math.max(
    gpus - fullNodes * offer.gpuCount,
    offer.minRentalGpus ?? offer.gpuCount
  );
  const billedGpus = fullNodes * offer.gpuCount + finalNode;
  const finalNodeRate =
    finalNode === offer.gpuCount
      ? offer.totalNodePriceHr
      : finalNode * offer.pricePerGpuHr;
  const total = hours * (fullNodes * offer.totalNodePriceHr + finalNodeRate);
  return Number.isFinite(total) ? { total, nodes, billedGpus } : null;
}
