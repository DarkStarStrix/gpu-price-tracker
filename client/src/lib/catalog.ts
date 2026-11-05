import { snapshotSchema, type Snapshot, isCurrent } from "@shared/catalog";
import { configureCatalog } from "./data";

export let catalog: Snapshot;
export let snapshotLoadError = false;
export let snapshotRefreshing = false;
export let lastCheckedAt: string | null = null;
let revision = 0;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();
export const subscribeCatalog = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const catalogRevision = () => revision;
function notify() {
  revision++;
  for (const listener of listeners) listener();
}
export function loadCatalog(): Promise<void> {
  // Manual, timer and focus refreshes share one request so they cannot race.
  if (pending) return pending;
  snapshotRefreshing = true;
  notify();
  pending = Promise.resolve().then(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}data/latest.json?checked=${Date.now()}`,
        { cache: "no-store", signal: AbortSignal.timeout(20_000) }
      );
      if (!response.ok) throw new Error("Price snapshot could not be loaded");
      const checked = snapshotSchema.parse(await response.json());
      if (
        catalog &&
        Date.parse(checked.generatedAt) < Date.parse(catalog.generatedAt)
      )
        throw new Error("Published snapshot is older than the loaded data");
      catalog = checked;
      configureCatalog(checked);
      lastCheckedAt = new Date().toISOString();
      snapshotLoadError = false;
    } catch (error) {
      snapshotLoadError = true;
      if (catalog) configureCatalog(catalog);
      throw error;
    } finally {
      snapshotRefreshing = false;
      pending = null;
      notify();
    }
  });
  return pending;
}
export function eligibleOffers() {
  return catalog.offers.filter(o => isCurrent(catalog, o));
}
