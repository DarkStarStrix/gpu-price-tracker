// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import App from "../client/src/App";
import { loadCatalog } from "../client/src/lib/catalog";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("reports each refresh outcome while keeping the current tab open", async () => {
  const response = (generatedAt: string) => ({
    ok: true,
    json: async () => ({
      version: 1,
      generatedAt,
      sources: [],
      offers: [],
      history: [],
    }),
  });
  const original = response("2026-11-07T19:00:00Z");
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(original)
      .mockResolvedValueOnce(response("2026-11-07T19:15:00Z"))
      .mockRejectedValueOnce(new Error("offline"))
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const button = (label: string) =>
    [...host.querySelectorAll("button")].find(b => b.textContent === label)!;
  const status = () => host.querySelector('[role="status"]')?.textContent;

  try {
    await loadCatalog();
    await act(() => root.render(<App />));
    await act(() => button("Providers").click());
    const providers = host.querySelector(
      'img[alt="Provider network constellation"]'
    );
    expect(providers).not.toBeNull();

    await act(async () => button("Refresh").click());
    expect(status()).toContain("No newer snapshot has been published.");

    await act(async () => button("Refresh").click());
    expect(status()).toContain("New snapshot loaded.");

    await act(async () => button("Refresh").click());
    expect(status()).toContain("Snapshot check failed");
    expect(status()).toContain("showing the last validated data");
    expect(host.contains(providers)).toBe(true);
    expect(
      host.querySelector('a[href$="/actions/workflows/pages.yml"]')
    ).not.toBeNull();
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
