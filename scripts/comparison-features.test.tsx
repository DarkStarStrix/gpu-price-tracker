// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { OffersTable } from "../client/src/components/OffersTable";
import {
  emptyOfferFilters,
  readViewLink,
  viewLink,
} from "../client/src/lib/view-link";
import { loadCatalog } from "../client/src/lib/catalog";
import { estimateJobCost } from "../shared/job-cost";
import { collect } from "./collect";
import { parseRunpod } from "./providers";
import fixture from "./fixtures/runpod.json";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("rounds to whole nodes and labels an unknown node size as a per-GPU estimate", () => {
  const node = { gpuCount: 8, totalNodePriceHr: 12, pricePerGpuHr: 1.5 };
  expect(estimateJobCost(node, 3, 2.5)).toEqual({
    nodes: 1,
    billedGpus: 8,
    total: 30,
  });
  expect(estimateJobCost(node, 9, 2.5)).toEqual({
    nodes: 2,
    billedGpus: 16,
    total: 60,
  });
  expect(
    estimateJobCost({ ...node, configurationKnown: false }, 3, 2.5)
  ).toEqual({ nodes: null, billedGpus: null, total: 11.25 });
  expect(estimateJobCost(node, 1.5, 4)).toBeNull();
  expect(estimateJobCost(node, 1, 0)).toBeNull();
});

it("opens shared exact listings with the saved filters and time window", async () => {
  const at = new Date().toISOString();
  const offers = parseRunpod(fixture, at).slice(0, 2);
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
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot })
  );
  const clipboard = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText: clipboard } });
  const filters = {
    ...emptyOfferFilters,
    provider: "runpod",
    search: "A100 & GPU",
    region: "Not specified",
  };
  const base = "https://darkstarstrix.github.io/gpu-price-tracker/";
  const ids = [offers[1].offerId, offers[0].offerId, "retired"];
  const through = Date.parse(at);
  const state = { view: "offers", ids, filters, hours: 24, through } as const;
  const url = new URL(viewLink(state, base));
  const shared = readViewLink(url.search);
  expect(shared).toEqual(state);
  const trends = {
    view: "trends",
    id: offers[0].offerId,
    gpu: offers[0].gpuModelId,
    billing: "on-demand",
    hours: 1,
    movers: true,
    through,
    bounds: { start: through - 30_000, end: through - 5_000 },
  } as const;
  expect(readViewLink(new URL(viewLink(trends, base)).search)).toEqual(trends);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await loadCatalog();
    if (shared?.view !== "offers") throw new Error("Expected an Offers view");
    await act(() => root.render(<OffersTable shared={shared} />));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Compare 2 listings");
    expect(dialog.textContent).toContain(
      "Some listings from this link are missing"
    );
    expect(dialog.querySelector("select")?.value).toBe("24");
    expect(
      host.querySelector('input[type="search"]')?.getAttribute("value")
    ).toBe(filters.search);
    const copy = [...dialog.querySelectorAll("button")].find(button =>
      button.textContent?.includes("Copy share link")
    )!;
    await act(() => copy.click());
    const reshared = readViewLink(new URL(clipboard.mock.calls[0][0]).search);
    expect(reshared).toEqual({ ...state, ids: ids.slice(0, 2) });
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
