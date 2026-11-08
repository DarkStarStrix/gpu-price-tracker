// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { it, expect, vi } from "vitest";
import App from "../client/src/App";
import { loadCatalog } from "../client/src/lib/catalog";
import { parseRunpod } from "./providers";
import { collect } from "./collect";
import fixture from "./fixtures/runpod.json";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it("renders retained prices and provider inventory without presenting stale stock as fresh", async () => {
  const at = "2026-11-05T18:00:00Z";
  const offers = parseRunpod(fixture, at);
  const snapshot = await collect(
    null,
    [
      {
        id: "runpod",
        name: "RunPod",
        configured: true,
        connected: true,
        fetch: async () => ({ offers }),
      },
    ],
    at
  );
  vi.useFakeTimers({
    toFake: [
      "Date",
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });
  vi.setSystemTime(new Date("2026-11-05T21:00:00Z"));
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot })
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await loadCatalog();
    await act(() => root.render(<App />));
    await act(() => vi.advanceTimersByTime(1600));
    const text = host.textContent!;
    expect(text).toContain("Last observed quote · not current");
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Showing last observed prices where fresh data is unavailable."
    );
    expect(text).not.toMatch(/refresh overdue/i);
    expect(text).toContain("4 Offers");
    expect(text).toContain("$2.69");
    expect(text).toContain("Awaiting a fresh stock report");
    expect(host.querySelector('[title^="Provider reports "]')).toBeNull();
    expect(text).not.toContain("No current verified prices");
    expect(
      host.querySelector('a[href="https://www.runpod.io/pricing"]')
    ).not.toBeNull();
    const providers = [...host.querySelectorAll("button")].find(
      button => button.textContent === "Providers"
    )!;
    await act(() => providers.click());
    expect(host.textContent).toContain("Last observed prices");
    expect(host.textContent).toContain("4 offers");
    expect(host.textContent).not.toMatch(/refresh overdue/i);
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
