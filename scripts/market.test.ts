import { describe, it, expect } from "vitest";
import { h100Quote, marketSeries, marketStats } from "../shared/market";
import { parseRunpod } from "./providers";
import { collect } from "./collect";
import fixture from "./fixtures/runpod.json";
const at = "2026-11-05T18:00:00Z",
  now = Date.parse(at);
async function sample() {
  const base = parseRunpod(fixture, at)[0];
  const offers = [
    {
      ...base,
      offerId: "limited",
      gpuModelId: "h100-sxm",
      availability: "limited" as const,
      pricePerGpuHr: 3,
      totalNodePriceHr: 3,
    },
    {
      ...base,
      offerId: "spot",
      gpuModelId: "h100-sxm",
      billingModel: "spot" as const,
      pricePerGpuHr: 0.7,
      totalNodePriceHr: 0.7,
    },
    {
      ...base,
      offerId: "sold",
      gpuModelId: "h100-sxm",
      availability: "unavailable" as const,
      pricePerGpuHr: 1,
      totalNodePriceHr: 1,
    },
  ];
  return collect(
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
}
describe("market observations", () => {
  it("shows limited stock as an eligible H100 quote, separates spot and on-demand, and abstains on stale data", async () => {
    const s = await sample();
    expect(h100Quote(s, "on-demand", now)?.offerId).toBe("limited");
    expect(h100Quote(s, "spot", now)?.offerId).toBe("spot");
    expect(h100Quote(s, "on-demand", now + 3 * 3600000)).toBeUndefined();
  });
  it("orders actual times, isolates the listing, ignores future and out-of-range samples and preserves flat prices", async () => {
    const s = await sample();
    const h = s.history.find(h => h.offerId === "limited")!;
    s.history.push(
      { ...h, observedAt: "2026-11-05T17:00:00Z" },
      { ...h, observedAt: "2026-11-05T19:00:00Z", pricePerGpuHr: 20 },
      {
        ...h,
        offerId: "different",
        observedAt: "2026-11-05T17:30:00Z",
        pricePerGpuHr: 99,
      }
    );
    const p = marketSeries(s, "limited", now - 3600000, now);
    expect(p).toHaveLength(2);
    expect(p[0].time).toBe(now - 3600000);
    expect(marketStats(p)).toMatchObject({
      change: 0,
      percent: 0,
      high: 3,
      low: 3,
      count: 2,
    });
    expect(marketStats([])).toBeNull();
  });
  it("computes sampled change from recorded prices without inventing an opening price", () => {
    expect(
      marketStats([{ price: 2 }, { price: 4 }, { price: 3 }])
    ).toMatchObject({
      first: 2,
      last: 3,
      change: 1,
      percent: 50,
      high: 4,
      low: 2,
    });
  });
});
