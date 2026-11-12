// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import type { Snapshot } from "../shared/catalog";
import App from "../client/src/App";
import { loadCatalog } from "../client/src/lib/catalog";
import { parseRunpod } from "./providers";
import runpod from "./fixtures/runpod.json";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("updates mounted provider profiles and preserves the last observations on failure", async () => {
  const start = "2026-11-07T19:00:00Z";
  const observedAt = "2026-11-07T19:15:00Z";
  const failedAt = "2026-11-07T19:30:00Z";
  const recoveredAt = "2026-11-07T19:45:00Z";
  vi.setSystemTime(new Date(recoveredAt));
  const id = "test-provider";
  const source = (
    checkedAt: string,
    status: "ok" | "error",
    lastSuccessAt: string | null
  ): Snapshot["sources"][number] => ({
    id,
    name: "Test Provider",
    checkedAt,
    status,
    lastSuccessAt,
    message: "",
  });
  const url = "https://example.com/pricing";
  const offers: Snapshot["offers"] = [
    {
      ...parseRunpod(runpod, observedAt)[0],
      providerId: id,
      providerName: "Test Provider",
      providerLink: url,
      sourceUrl: url,
      region: "Test region",
    },
  ];
  const response = (
    report: Snapshot["sources"][number],
    offers: Snapshot["offers"] = []
  ) => ({
    ok: true,
    json: async (): Promise<Snapshot> => ({
      version: 1,
      generatedAt: report.checkedAt,
      sources: [report],
      offers,
      history: [],
    }),
  });
  const original = response(source(start, "error", null));
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(
        response(source(observedAt, "ok", observedAt), offers)
      )
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(
        response(source(failedAt, "error", observedAt), offers)
      )
      .mockResolvedValueOnce(response(source(recoveredAt, "ok", recoveredAt)))
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) =>
    [...host.querySelectorAll("button")].find(b => b.textContent === label)!;
  const status = () => host.querySelector('[role="status"]')?.textContent;
  const profile = () => host.querySelector("article")!;
  const checkTime = (selector = "time") =>
    profile().querySelector(selector)?.getAttribute("datetime");

  try {
    await loadCatalog();
    await act(() => root.render(<App />));
    await act(async () => {
      button("Providers").click();
      await vi.dynamicImportSettled();
    });
    const providers = host.querySelector(
      'img[alt="Provider network constellation"]'
    );
    expect(providers).not.toBeNull();
    expect(profile().textContent).toContain("Test Provider");
    expect(profile().textContent).toContain(
      "Awaiting the first successful refresh"
    );
    expect(profile().querySelector("img")).toBeNull();
    expect(checkTime()).toBe(start);

    await act(async () => button("Refresh").click());
    expect(status()).toContain("No newer snapshot has been published.");

    await act(async () => button("Refresh").click());
    expect(status()).toContain("New snapshot loaded.");
    const price = `$${offers[0].pricePerGpuHr.toFixed(2)}`;
    expect(profile().textContent).toContain("Connected");
    expect(profile().textContent).toContain(offers[0].gpuModelName);
    expect(profile().textContent).toContain("Test region");
    expect(profile().textContent).toContain(price);
    expect(profile().querySelector("details a")?.getAttribute("href")).toBe(
      url
    );

    await act(async () => button("Refresh").click());
    expect(status()).toContain("Snapshot check failed");
    expect(status()).toContain("showing the last validated data");
    expect(host.contains(providers)).toBe(true);
    expect(profile().textContent).toContain(price);
    expect(checkTime()).toBe(observedAt);

    await act(() => loadCatalog());
    expect(profile().textContent).toContain("Refresh failed");
    expect(profile().textContent).toContain("Last observed prices");
    expect(profile().textContent).toContain(price);
    expect(checkTime("details time")).toBe(failedAt);
    expect(checkTime("time[title]")).toBe(observedAt);

    await act(() => loadCatalog());
    expect(profile().textContent).toContain("No offers listed");
    expect(profile().textContent).not.toContain(price);
    expect(profile().textContent).not.toContain("Test region");
    expect(checkTime("time[title]")).toBe(recoveredAt);
    expect(
      host.querySelector('a[href$="/actions/workflows/pages.yml"]')
    ).not.toBeNull();
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
