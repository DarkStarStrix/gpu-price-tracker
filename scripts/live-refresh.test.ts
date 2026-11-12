import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encodeHistory,
  mergeHistory,
  overviewSnapshot,
} from "../shared/browser-snapshot";
import { marketSeries } from "../shared/market";
import type { Snapshot } from "../shared/catalog";
vi.mock("../client/src/lib/data", () => ({ configureCatalog: vi.fn() }));
const snapshot = (at: string): Snapshot => ({
  version: 1,
  generatedAt: at,
  sources: [],
  offers: [],
  history: [],
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("installs history only for the matching current catalog and ignores superseded requests", async () => {
  vi.stubEnv("PROD", true);
  const old = snapshot("2026-11-05T17:00:00Z");
  const next = snapshot("2026-11-05T17:15:00Z");
  next.history = [
    {
      offerId: "historical",
      providerId: "nebius",
      gpuModelId: "h100-sxm",
      cloudType: "interruptible",
      billingModel: "spot",
      observedAt: next.generatedAt,
      pricePerGpuHr: 1.35,
      historyOrigin: "provider_hourly_last",
    },
  ];
  const response = (data: unknown) => ({ ok: true, json: async () => data });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(overviewSnapshot(old)));
  vi.stubGlobal("fetch", fetchMock);
  const store = await import("../client/src/lib/catalog");
  await store.loadCatalog();
  expect(fetchMock.mock.calls[0][0]).toContain("current.json");
  expect(store.fullCatalog).toBeUndefined();

  let finishOld!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finishOld = resolve;
      })
  );
  const oldRequest = store.loadHistory();
  expect(store.loadHistory()).toBe(oldRequest);
  await Promise.resolve();
  fetchMock.mockResolvedValueOnce(response(overviewSnapshot(next)));
  await store.loadCatalog();
  finishOld(response(encodeHistory(old)));
  await oldRequest;
  expect(store.fullCatalog).toBeUndefined();
  expect(store.historyLoadError).toBe(false);

  fetchMock.mockResolvedValueOnce(response(encodeHistory(old)));
  await expect(store.loadHistory()).rejects.toThrow("another snapshot");
  expect(store.historyLoadError).toBe(true);
  expect(store.catalog.generatedAt).toBe(next.generatedAt);

  fetchMock.mockResolvedValueOnce(response(encodeHistory(next)));
  await store.loadHistory();
  expect(store.historyLoadError).toBe(false);
  expect(store.fullCatalog?.history).toEqual(next.history);
  expect(store.catalog.history).toHaveLength(0);
});

it("preserves recorded prices and order in the compact history and rejects invalid samples", () => {
  const original: Snapshot = {
    ...snapshot("2026-11-05T17:15:00Z"),
    history: [1.25, 1.35].map(pricePerGpuHr => ({
      offerId: "historical",
      providerId: "nebius",
      gpuModelId: "h100-sxm",
      cloudType: "interruptible",
      billingModel: "spot",
      observedAt: "2026-11-05T17:00:00Z",
      pricePerGpuHr,
      historyOrigin: "provider_hourly_last",
      sourceUrl: "https://nebius.com/",
    })),
  };
  const file = encodeHistory(original);
  const current = overviewSnapshot(original);
  const roundTrip = mergeHistory(current, JSON.parse(JSON.stringify(file)));
  expect(file.listings).toHaveLength(1);
  expect(marketSeries(roundTrip, "historical", 0)).toEqual(
    marketSeries(original, "historical", 0)
  );
  file.points[0][0] = 1;
  expect(() => mergeHistory(current, file)).toThrow(
    "Invalid published price history"
  );
});
describe("published snapshot refresh", () => {
  it("notifies the mounted app when a fresh snapshot arrives and deduplicates competing refreshes", async () => {
    let finish!: (value: unknown) => void;
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Promise(resolve => {
          finish = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const c = await import("../client/src/lib/catalog");
    const listener = vi.fn();
    const unsubscribe = c.subscribeCatalog(listener);
    const first = c.loadCatalog();
    expect(c.snapshotRefreshing).toBe(true);
    expect(c.loadCatalog()).toBe(first);
    await Promise.resolve();
    finish({ ok: true, json: async () => snapshot("2026-11-05T17:00:00Z") });
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(c.catalog.generatedAt).toBe("2026-11-05T17:00:00Z");
    expect(c.snapshotRefreshing).toBe(false);
    expect(c.snapshotLoadError).toBe(false);
    expect(c.lastCheckedAt).not.toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("?checked=");
    unsubscribe();
  });
  it("publishes new data without a reload and preserves the last valid snapshot on failure or rollback", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const c = await import("../client/src/lib/catalog");
    const respond = (at: string) =>
      f.mockResolvedValueOnce({ ok: true, json: async () => snapshot(at) });
    respond("2026-11-05T17:00:00Z");
    await c.loadCatalog();
    const before = c.catalogRevision();
    respond("2026-11-05T17:15:00Z");
    await c.loadCatalog();
    expect(c.catalog.generatedAt).toBe("2026-11-05T17:15:00Z");
    expect(c.catalogRevision()).toBeGreaterThan(before);
    const lastCheck = c.lastCheckedAt;
    f.mockRejectedValueOnce(Error("offline"));
    await expect(c.loadCatalog()).rejects.toThrow();
    expect(c.catalog.generatedAt).toBe("2026-11-05T17:15:00Z");
    expect(c.lastCheckedAt).toBe(lastCheck);
    expect(c.snapshotLoadError).toBe(true);
    respond("2026-11-05T17:00:00Z");
    await expect(c.loadCatalog()).rejects.toThrow("older");
    expect(c.catalog.generatedAt).toBe("2026-11-05T17:15:00Z");
    f.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ invalid: true }),
    });
    await expect(c.loadCatalog()).rejects.toThrow();
    expect(c.catalog.generatedAt).toBe("2026-11-05T17:15:00Z");
    respond("2026-11-05T17:30:00Z");
    await c.loadCatalog();
    expect(c.snapshotLoadError).toBe(false);
  });
});
