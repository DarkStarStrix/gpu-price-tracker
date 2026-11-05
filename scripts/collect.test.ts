import { describe, it, expect } from "vitest";
import { parseRunpod, parseLambda, gpuId, type Source } from "./providers";
import { collect } from "./collect";
import { isStale, isCurrent, snapshotSchema } from "../shared/catalog";
import fixture from "./fixtures/runpod.json";
const at = "2026-11-05T12:00:00.000Z";
const later = "2026-11-05T13:00:00.000Z";
const source = (fetch: Source["fetch"]): Source => ({
  id: "runpod",
  name: "RunPod",
  configured: true,
  connected: true,
  fetch,
});
const offers = parseRunpod(fixture, at);

describe("provider contracts", () => {
  it("uses public per-GPU catalog prices and keeps cloud tiers and physical variants distinct", () => {
    const a100 = offers.filter(o => o.gpuModelId === "a100-pcie-80");
    expect(a100).toHaveLength(2);
    expect(a100.find(o => o.cloudType === "secure")?.pricePerGpuHr).toBe(
      fixture.data.gpuTypes[0].securePrice
    );
    expect(
      a100.every(
        o =>
          o.vcpus === null && o.ramGb === null && o.region === "Not specified"
      )
    ).toBe(true);
    expect(gpuId("NVIDIA H100 PCIe", 80)).not.toBe(gpuId("H100 SXM", 80));
    expect(gpuId("H100", 80)).toBe("h100-unspecified");
    expect(gpuId("RTX 4090", 24)).toBe("rtx-4090");
  });
  it("does not infer availability from a price, a cloud flag, or absent capacity", () => {
    const input = structuredClone(fixture);
    const missingStock = {
      ...input,
      data: {
        gpuTypes: input.data.gpuTypes.map(g => ({
          ...g,
          secure: { ...g.secure, stockStatus: null },
        })),
      },
    };
    expect(
      parseRunpod(missingStock, at).find(o => o.offerId.includes("PCIe:secure"))
        ?.availability
    ).toBe("unknown");
  });
  it("rejects GraphQL errors returned with HTTP-success-shaped data", () => {
    expect(() =>
      parseRunpod({ ...fixture, errors: [{ message: "failure" }] }, at)
    ).toThrow();
  });
  it("rejects schema drift and invalid prices instead of publishing success-shaped defaults", () => {
    expect(() => parseRunpod({ data: {} }, at)).toThrow();
    const invalid = structuredClone(fixture);
    invalid.data.gpuTypes[0].securePrice = -1;
    expect(() => parseRunpod(invalid, at)).toThrow();
  });
  it("converts Lambda cents per node-hour to dollars per GPU-hour once", () => {
    const [offer] = parseLambda(
      {
        data: {
          eight: {
            instance_type: {
              name: "eight",
              gpu_description: "H100 SXM",
              price_cents_per_hour: 2400,
              specs: { gpus: 8, memory_gib: 1800, vcpus: 208 },
            },
            regions_with_capacity_available: [{ name: "us-west-1" }],
          },
        },
      },
      at
    );
    expect(offer.pricePerGpuHr).toBe(3);
    expect(offer.totalNodePriceHr).toBe(24);
    expect(offer.gpuCount).toBe(8);
    expect(offer.region).toBe("us-west-1");
    expect(offer.vramPerGpuGb).toBeNull();
  });
});
describe("snapshot publication", () => {
  it("replaces a successful provider catalog so removed offers cannot linger", async () => {
    const first = await collect(null, [source(async () => offers)], at);
    const next = await collect(
      first,
      [source(async () => [{ ...offers[0], observedAt: later }])],
      later
    );
    expect(next.offers).toHaveLength(1);
    expect(next.sources[0].status).toBe("ok");
    expect(next.history).toHaveLength(offers.length + 1);
  });
  it("retains the previous prices and timestamps on failure and leaks no exception text", async () => {
    const first = await collect(null, [source(async () => offers)], at);
    const next = await collect(
      first,
      [
        source(async () => {
          throw new Error("secret-key-must-never-publish");
        }),
      ],
      later
    );
    expect(next.offers).toEqual(first.offers);
    expect(next.history).toEqual(first.history);
    expect(next.sources[0]).toMatchObject({
      status: "error",
      lastSuccessAt: at,
      checkedAt: later,
    });
    expect(JSON.stringify(next)).not.toContain("secret-key");
  });
  it("marks missing credentials without performing a request or substituting sample data", async () => {
    const next = await collect(
      null,
      [
        {
          ...source(async () => {
            throw new Error("must not run");
          }),
          configured: false,
        },
      ],
      at
    );
    expect(next.offers).toEqual([]);
    expect(next.sources[0].status).toBe("not_configured");
  });
  it("quarantines an entire invalid or duplicate response at the provider boundary", async () => {
    const first = await collect(null, [source(async () => offers)], at);
    const duplicate = [
      { ...offers[0], observedAt: later },
      { ...offers[0], observedAt: later },
    ];
    const next = await collect(first, [source(async () => duplicate)], later);
    expect(next.sources[0].status).toBe("error");
    expect(next.offers).toEqual(first.offers);
    const wrongProvider = await collect(
      first,
      [
        source(async () => [
          { ...offers[0], providerId: "lambda", observedAt: later },
        ]),
      ],
      later
    );
    expect(wrongProvider.sources[0].status).toBe("error");
  });
  it("accepts an authoritative empty catalog without retaining phantom availability", async () => {
    const first = await collect(null, [source(async () => offers)], at);
    const next = await collect(first, [source(async () => [])], later);
    expect(next.offers).toEqual([]);
    expect(next.sources[0].status).toBe("ok");
  });
  it("keeps history for seven days, never appends observations for failed refreshes, and deduplicates retries", async () => {
    const first = await collect(null, [source(async () => offers)], at);
    const repeat = await collect(first, [source(async () => offers)], at);
    expect(repeat.history).toHaveLength(first.history.length);
    const old = await collect(
      first,
      [
        source(async () => {
          throw new Error();
        }),
      ],
      "2026-11-13T12:00:00.000Z"
    );
    expect(old.history).toEqual([]);
    expect(old.offers).toEqual(first.offers);
  });
  it("rejects corrupted previous state and future-dated observations", async () => {
    const first = await collect(null, [source(async () => offers)], at);
    expect(() => snapshotSchema.parse({ ...first, version: 2 })).toThrow();
    expect(() =>
      snapshotSchema.parse({
        ...first,
        generatedAt: "2026-01-01T00:00:00.000Z",
      })
    ).toThrow();
  });
  it("excludes retained prices from current metrics even when the previous observation is recent", async () => {
    const first = await collect(null, [source(async () => offers)], at);
    const failed = await collect(
      first,
      [
        source(async () => {
          throw new Error();
        }),
      ],
      later
    );
    expect(isCurrent(first, offers[0], Date.parse(later))).toBe(true);
    expect(isCurrent(failed, offers[0], Date.parse(later))).toBe(false);
  });
  it("marks observations stale by their observation time rather than the latest build time", () => {
    expect(isStale(at, Date.parse(later))).toBe(false);
    expect(isStale(at, Date.parse("2026-11-05T14:00:01.000Z"))).toBe(true);
  });
});
