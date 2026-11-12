import type { GpuOffer } from "./catalog";

export function estimateJobCost(
  offer: Pick<
    GpuOffer,
    "configurationKnown" | "gpuCount" | "pricePerGpuHr" | "totalNodePriceHr"
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
  if (offer.configurationKnown === false) {
    const total = gpus * hours * offer.pricePerGpuHr;
    return Number.isFinite(total)
      ? { total, nodes: null, billedGpus: null }
      : null;
  }
  const nodes = Math.ceil(gpus / offer.gpuCount);
  const total = nodes * hours * offer.totalNodePriceHr;
  return Number.isFinite(total)
    ? { total, nodes, billedGpus: nodes * offer.gpuCount }
    : null;
}
