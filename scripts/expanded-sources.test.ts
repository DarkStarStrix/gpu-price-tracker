import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  parseHyperstack,
  parseVerda,
  parseCrusoe,
  parseVultr,
  parseNebius,
} from "./expanded-sources";
import current from "./fixtures/nebius-current.json";
import series from "./fixtures/nebius-history.json";
import vultr from "./fixtures/vultr.json";
import { collect } from "./collect";
import { parseRunpod, type Source } from "./providers";
import runpod from "./fixtures/runpod.json";
const at = "2026-11-05T18:00:00.000Z";
const html = (id: string) =>
  readFileSync(new URL(`./fixtures/${id}.html`, import.meta.url), "utf8");
const adapter = (fetch: Source["fetch"]): Source => ({
  id: "runpod",
  name: "RunPod",
  configured: true,
  connected: true,
  fetch,
});
describe("expanded public sources", () => {
  it("scopes Hyperstack to on-demand per-GPU rates and does not claim max specs are allocations", () => {
    const r = parseHyperstack(html("hyperstack"), at);
    expect(r.offers).toHaveLength(13);
    expect(r.offers.find(o => o.gpuModelId === "h100-sxm")?.pricePerGpuHr).toBe(
      3.2
    );
    expect(
      r.offers.every(
        o =>
          o.availability === "unknown" &&
          !o.configurationKnown &&
          o.vcpus === null &&
          o.ramGb === null
      )
    ).toBe(true);
    expect(() =>
      parseHyperstack(
        html("hyperstack").replace(/Max pCPUs\s*per GPU/, "vCPUs"),
        at
      )
    ).toThrow();
  });
  it("reads Verda current single-instance rates and retains distinct configurations", () => {
    const r = parseVerda(html("verda"), at);
    expect(r.offers).toHaveLength(13);
    expect(new Set(r.offers.map(o => o.offerId)).size).toBe(13);
    expect(
      r.offers.find(o => o.gpuModelName.includes("GB300"))?.pricePerGpuHr
    ).toBe(13.31);
    expect(
      r.offers.every(
        o => o.configurationKnown && o.billingModel === "on-demand"
      )
    ).toBe(true);
    expect(() =>
      parseVerda(html("verda").replace("Spot price", "Discount"), at)
    ).toThrow();
  });
  it("uses Crusoe current rates, excludes quotes and refuses the dated transition", () => {
    const r = parseCrusoe(html("crusoe"), at);
    expect(r.offers).toHaveLength(7);
    expect(r.exclusions).toHaveLength(5);
    expect(() =>
      parseCrusoe(html("crusoe").replace("NVIDIA H200", "NVIDIA H300"), at)
    ).toThrow();
    expect(r.offers.find(o => o.gpuModelId === "h100-sxm")?.pricePerGpuHr).toBe(
      3.9
    );
    expect(r.offers.some(o => o.gpuModelId === "b200-sxm")).toBe(false);
    expect(() => parseCrusoe(html("crusoe"), "2026-12-01T00:00:00Z")).toThrow();
  });
  it("normalizes full Vultr node price and node VRAM by GPU count, without stock inference", () => {
    const r = parseVultr(vultr, at);
    expect(r.offers).toHaveLength(3);
    const o = r.offers.find(o => o.gpuCount === 4)!;
    expect(o.pricePerGpuHr).toBe(1.671);
    expect(o.vramPerGpuGb).toBe(48);
    expect(o.ramGb).toBe(750);
    expect(o.availability).toBe("unknown");
    expect(() =>
      parseVultr(
        { ...vultr, meta: { ...vultr.meta, links: { next: "more" } } },
        at
      )
    ).toThrow();
  });
  it("imports real hourly spot history with units and provenance distinct from collector observations", async () => {
    const r = parseNebius(current, series, at);
    expect(r.offers.length).toBe(12);
    expect(r.history!.length).toBeGreaterThan(20);
    expect(
      r.history!.every(
        h =>
          h.billingModel === "spot" &&
          h.historyOrigin === "provider_hourly_last"
      )
    ).toBe(true);
    const snapshot = await collect(
      null,
      [
        {
          id: "nebius",
          name: "Nebius",
          connected: true,
          configured: true,
          fetch: async () => r,
        },
      ],
      at
    );
    expect(snapshot.sources[0].status).toBe("ok");
    expect(snapshot.history.length).toBe(r.history!.length + r.offers.length);
    const bad = structuredClone(series);
    bad.items[0].currency = "eur";
    expect(() => parseNebius(current, bad, at)).toThrow();
    expect(() =>
      parseNebius({ ...current, nextPageToken: "more" }, series, at)
    ).toThrow();
  });
  it("excludes the unfinished hourly bucket without backdating it", () => {
    const input = structuredClone(series);
    input.items[0].points.push({
      timestamp: "2026-11-05T18:00:00Z",
      value: "0.95",
    });
    const r = parseNebius(current, input, "2026-11-05T17:30:00Z");
    expect(
      r.history!.every(
        h => Date.parse(h.observedAt) <= Date.parse("2026-11-05T17:30:00Z")
      )
    ).toBe(true);
    input.items[0].points.push({
      timestamp: "2030-01-01T00:00:00Z",
      value: "1",
    });
    expect(() => parseNebius(current, input, at)).toThrow();
  });
  it("rejects future imported observations without publishing a partial provider catalog", async () => {
    const r = parseNebius(current, series, at);
    r.history![0].observedAt = "2030-01-01T00:00:00Z";
    const s = await collect(
      null,
      [
        {
          id: "nebius",
          name: "Nebius",
          connected: true,
          configured: true,
          fetch: async () => r,
        },
      ],
      at
    );
    expect(s.sources[0].status).toBe("error");
    expect(s.offers).toEqual([]);
    expect(s.history).toEqual([]);
    expect(s.poolHistory).toEqual([]);
  });
});
describe("measured pool movement", () => {
  it("records a baseline, additions, removals and changes independently", async () => {
    const offers = parseRunpod(runpod, "2026-11-05T12:00:00Z");
    const first = await collect(
      null,
      [adapter(async () => ({ offers }))],
      "2026-11-05T12:00:00Z"
    );
    expect(first.poolHistory![0]).toMatchObject({
      baseline: true,
      added: 0,
      removed: 0,
    });
    const nextOffers = [
      {
        ...offers[0],
        pricePerGpuHr: 9,
        totalNodePriceHr: 9,
        availability: "limited" as const,
        observedAt: at,
      },
      { ...offers[0], offerId: "runpod:new", observedAt: at },
    ];
    // Force an availability transition independently of fixture's original state.
    first.offers[0].availability = "unavailable";
    const next = await collect(
      first,
      [adapter(async () => ({ offers: nextOffers }))],
      at
    );
    expect(next.poolHistory!.at(-1)).toMatchObject({
      baseline: false,
      total: 2,
      added: 1,
      removed: offers.length - 1,
      priceChanges: 1,
      availabilityChanges: 1,
    });
    const failed = await collect(
      next,
      [
        adapter(async () => {
          throw Error("failure");
        }),
      ],
      "2026-11-05T19:00:00Z"
    );
    expect(failed.poolHistory).toEqual(next.poolHistory);
    expect(failed.offers).toEqual(next.offers);
  });
  it("treats authoritative empty success as removals and migrates old snapshots with a factual baseline", async () => {
    const offers = parseRunpod(runpod, "2026-11-05T12:00:00Z");
    const first = await collect(
      null,
      [adapter(async () => ({ offers }))],
      "2026-11-05T12:00:00Z"
    );
    delete first.poolHistory;
    const next = await collect(
      first,
      [adapter(async () => ({ offers: [] }))],
      at
    );
    expect(next.poolHistory).toHaveLength(2);
    expect(next.poolHistory![0]).toMatchObject({
      baseline: true,
      total: offers.length,
      observedAt: "2026-11-05T12:00:00Z",
    });
    expect(next.poolHistory![1]).toMatchObject({
      baseline: false,
      total: 0,
      removed: offers.length,
    });
  });
});
