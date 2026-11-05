import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../client/src/lib/data", () => ({ configureCatalog: vi.fn() }));
const snapshot = (at: string) => ({
  version: 1,
  generatedAt: at,
  sources: [],
  offers: [],
  history: [],
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
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
