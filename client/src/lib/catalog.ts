import { snapshotSchema, type Snapshot, isCurrent } from "@shared/catalog";
import { mergeHistory, readSnapshot } from "@shared/browser-snapshot";
import { configureCatalog } from "./data";

export let catalog: Snapshot;
export let snapshotLoadError = false;
export let snapshotRefreshing = false;
export let lastCheckedAt: string | null = null;
export let lastCheckResult: "updated" | "unchanged" | null = null;
export let fullCatalog: Snapshot | undefined;
export let historyLoadError = false;
let revision = 0;
let pending: Promise<void> | null = null;
let historyRequest: { at: string; promise: Promise<void> } | undefined;
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
      const file = import.meta.env.PROD ? "current.json" : "latest.json";
      const initial = import.meta.env.PROD && !catalog && !snapshotLoadError;
      const preload =
        initial && typeof document !== "undefined"
          ? document.querySelector<HTMLLinkElement>("#current-price-preload")
              ?.href
          : undefined;
      const response = await fetch(
        preload ??
          `${import.meta.env.BASE_URL}data/${file}?checked=${Date.now()}`,
        {
          cache: preload ? "default" : "no-store",
          signal: AbortSignal.timeout(20_000),
        }
      );
      if (!response.ok) throw new Error("Price snapshot could not be loaded");
      const payload: unknown = await response.json();
      const checked = import.meta.env.PROD
        ? snapshotSchema.parse(payload)
        : readSnapshot(payload);
      const previousTime = catalog ? Date.parse(catalog.generatedAt) : null;
      const checkedTime = Date.parse(checked.generatedAt);
      if (previousTime !== null && checkedTime < previousTime)
        throw new Error("Published snapshot is older than the loaded data");
      lastCheckResult = checkedTime === previousTime ? "unchanged" : "updated";
      catalog = checked;
      if (!import.meta.env.PROD) fullCatalog = checked;
      if (lastCheckResult === "updated") historyLoadError = false;
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

export function loadHistory(): Promise<void> {
  const at = catalog.generatedAt;
  if (fullCatalog?.generatedAt === at) return Promise.resolve();
  if (historyRequest?.at === at) return historyRequest.promise;

  historyLoadError = false;
  const promise = Promise.resolve().then(async () => {
    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}data/history.json?revision=${encodeURIComponent(at)}`,
        { cache: "no-store", signal: AbortSignal.timeout(20_000) }
      );
      if (!response.ok) throw new Error("Price history could not be loaded");
      const data: unknown = await response.json();
      if (catalog.generatedAt !== at) return;
      fullCatalog = mergeHistory(catalog, data);
    } catch (error) {
      if (catalog.generatedAt === at) historyLoadError = true;
      throw error;
    } finally {
      if (historyRequest?.at === at) historyRequest = undefined;
      notify();
    }
  });
  historyRequest = { at, promise };
  notify();
  return promise;
}
export function eligibleOffers() {
  return catalog.offers.filter(o => isCurrent(catalog, o));
}
