import { snapshotSchema, type Snapshot, isCurrent } from "@shared/catalog";
import { configureCatalog } from "./data";

export let catalog: Snapshot;
export let snapshotLoadError = false;
export async function loadCatalog() {
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}data/latest.json`,
      {
        cache: "no-store",
      }
    );
    if (!response.ok) throw new Error("Price snapshot could not be loaded");
    const checked = snapshotSchema.parse(await response.json());
    catalog = checked;
    configureCatalog(checked);
    snapshotLoadError = false;
  } catch (error) {
    snapshotLoadError = true;
    if (catalog) configureCatalog(catalog);
    throw error;
  }
}
export function sparklines(): Record<string, number[]> {
  const grouped: Record<string, number[]> = {};
  for (const point of [...catalog.history].sort((a, b) =>
    a.observedAt.localeCompare(b.observedAt)
  )) {
    (grouped[point.offerId] ??= []).push(point.pricePerGpuHr);
  }
  return grouped;
}
export function eligibleOffers() {
  return catalog.offers.filter(o => isCurrent(catalog, o));
}
