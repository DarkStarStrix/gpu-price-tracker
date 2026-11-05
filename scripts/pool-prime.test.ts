import { describe, it, expect } from "vitest";
import { parsePrime, primeSource } from "./prime";
import { filterPool, billingLabel, cloudLabel } from "../shared/offer-view";
import { collect } from "./collect";
const at = "2026-11-05T18:00:00Z";
const row = {
  cloudId: "test",
  gpuType: "H100",
  socket: "SXM5",
  provider: "test-cloud",
  gpuCount: 1,
  gpuMemory: 80,
  security: "secure_cloud",
  stockStatus: "High",
  prices: { currency: "USD", onDemand: 3.5 },
  isSpot: true,
};
describe("Prime integration and pool filters", () => {
  it("maps explicit stock and separates security tier from billing without treating spot capability as a spot quote", () => {
    const [o] = parsePrime({ items: [row], totalCount: 1 }, at);
    expect(o.pricePerGpuHr).toBe(3.5);
    expect(o.availability).toBe("available");
    expect(billingLabel(o)).toBe("On-demand");
    expect(cloudLabel(o)).toBe("Secure Cloud");
    expect(o.gpuModelId).toBe("h100-sxm");
    expect(
      parsePrime(
        { items: [{ ...row, stockStatus: undefined }], totalCount: 1 },
        at
      )[0].availability
    ).toBe("unknown");
    expect(() => parsePrime({ items: [row], totalCount: 2 }, at)).toThrow();
    expect(() =>
      parsePrime({ items: [{ ...row, gpuCount: 8 }], totalCount: 1 }, at)
    ).toThrow();
    expect(primeSource({}).configured).toBe(false);
  });
  it("filters current pool dimensions together and treats stale stock as unknown", async () => {
    const offers = parsePrime(
      {
        items: [
          row,
          {
            ...row,
            cloudId: "other",
            security: "community_cloud",
            stockStatus: "Low",
            prices: { currency: "USD", communityPrice: 2 },
          },
        ],
        totalCount: 2,
      },
      at
    );
    const s = await collect(
      null,
      [
        {
          id: "prime",
          name: "Prime Intellect",
          configured: true,
          connected: true,
          fetch: async () => ({ offers }),
        },
      ],
      at
    );
    const empty = {
      gpu: "",
      billing: "",
      cloud: "",
      availability: "",
      region: "",
    };
    const now = Date.parse(at);
    expect(
      filterPool(
        s,
        "prime",
        {
          ...empty,
          cloud: "secure",
          billing: "on-demand",
          availability: "available",
          gpu: "h100-sxm",
        },
        now
      )
    ).toHaveLength(1);
    expect(
      filterPool(s, "prime", { ...empty, billing: "spot" }, now)
    ).toHaveLength(0);
    expect(
      filterPool(
        s,
        "prime",
        { ...empty, availability: "available" },
        now + 3 * 3600000
      )
    ).toHaveLength(0);
    expect(
      filterPool(
        s,
        "prime",
        { ...empty, availability: "unknown" },
        now + 3 * 3600000
      )
    ).toHaveLength(2);
  });
});
