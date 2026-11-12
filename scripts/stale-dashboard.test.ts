import { afterEach, it, expect, vi } from "vitest";
import {
  configureCatalog,
  buildComparisons,
  buildProviderSummaries,
  catalogProviders,
  GPU_MODELS,
} from "../client/src/lib/data";
import { parseRunpod } from "./providers";
import { collect } from "./collect";
import fixture from "./fixtures/runpod.json";
const at = "2026-11-05T18:00:00Z";
afterEach(() => vi.useRealTimers());

it("includes providers with no listings and merges GPU and compute feeds by provider ID", () => {
  const snapshot = {
    version: 1 as const,
    generatedAt: at,
    offers: [],
    history: [],
    sources: ["lambda", "gcp"].map(id => ({
      id,
      name: id === "lambda" ? "Lambda" : "Google Cloud",
      status: "ok" as const,
      checkedAt: at,
      lastSuccessAt: at,
      message: "0 offers observed",
    })),
    compute: [
      {
        providerId: "gcp",
        providerName: "Google Cloud",
        url: "https://cloud.google.com",
        kinds: ["tpu" as const],
        status: "ok" as const,
        observedAt: at,
        rates: [],
      },
    ],
  };
  expect(catalogProviders(snapshot)).toMatchObject([
    { source: { id: "lambda" }, kinds: ["gpu"], profile: { name: "Lambda" } },
    { source: { id: "gcp" }, kinds: ["gpu", "tpu"] },
  ]);
  expect(buildProviderSummaries(snapshot)).toMatchObject([
    { source: { id: "lambda" }, offerCount: 0 },
    { source: { id: "gcp" }, offerCount: 0 },
  ]);
});

it("keeps last observed overview prices, GPU inventory and provider summaries after two hours", async () => {
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
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T21:00:00Z"));
  configureCatalog(snapshot);
  expect(GPU_MODELS.length).toBeGreaterThan(0);
  const comparisons = buildComparisons(["h100-sxm"]);
  expect(comparisons).toHaveLength(1);
  expect(comparisons[0].providers[0]).toMatchObject({
    lowestPrice: 2.69,
    availability: "unknown",
  });
  expect(buildProviderSummaries(snapshot)).toMatchObject([
    { source: { id: "runpod" }, offerCount: 4, retained: true },
  ]);
});

import { displayQuote, h100Quote } from "../shared/market";
it("prefers a current quote over a cheaper retained rate and separates billing", async () => {
  const offers = parseRunpod(fixture, at).filter(
    o => o.gpuModelId === "h100-sxm"
  );
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
  const now = Date.parse("2026-11-05T21:00:00Z");
  const fresh = {
    ...offers[0],
    offerId: "fresh",
    observedAt: "2026-11-05T21:00:00Z",
    pricePerGpuHr: 8,
    totalNodePriceHr: 8,
  };
  snapshot.offers.push(fresh, {
    ...fresh,
    offerId: "spot",
    billingModel: "spot",
    pricePerGpuHr: 0.5,
    totalNodePriceHr: 0.5,
  });
  expect(displayQuote(snapshot, "h100-sxm", "on-demand", now)).toMatchObject({
    offer: { offerId: "fresh" },
    retained: false,
  });
  expect(displayQuote(snapshot, "h100-sxm", "spot", now)).toMatchObject({
    offer: { offerId: "spot" },
    retained: false,
  });
  snapshot.offers = snapshot.offers.filter(
    o => !["fresh", "spot"].includes(o.offerId)
  );
  expect(h100Quote(snapshot, "on-demand", now)).toBeUndefined();
  expect(displayQuote(snapshot, "h100-sxm", "on-demand", now)).toMatchObject({
    offer: { pricePerGpuHr: 2.69 },
    retained: true,
  });
  expect(displayQuote(snapshot, "missing", "on-demand", now)).toBeUndefined();
  snapshot.sources[0].status = "error";
  configureCatalog(snapshot);
  expect(
    buildComparisons()[0].providers.every(
      p => p.retained && p.availability === "unknown"
    )
  ).toBe(true);
});
