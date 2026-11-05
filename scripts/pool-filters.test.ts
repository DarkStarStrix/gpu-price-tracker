import { describe, it, expect } from "vitest";
import { parseRunpod } from "./providers";
import fixture from "./fixtures/runpod.json";
import { filterPool } from "../shared/offer-view";
import { collect } from "./collect";
const at = "2026-11-05T18:00:00Z";
describe("pool filters", () => {
  it("filters current pool dimensions together and treats stale stock as unknown", async () => {
    const offers = parseRunpod(fixture, at);
    const s = await collect(
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
        "runpod",
        {
          ...empty,
          cloud: "secure",
          billing: "on-demand",
          availability: "limited",
          gpu: "a100-pcie-80",
        },
        now
      )
    ).toHaveLength(1);
    expect(
      filterPool(s, "runpod", { ...empty, billing: "spot" }, now)
    ).toHaveLength(0);
    expect(
      filterPool(
        s,
        "runpod",
        { ...empty, availability: "limited" },
        now + 3 * 3600000
      )
    ).toHaveLength(0);
    expect(
      filterPool(
        s,
        "runpod",
        { ...empty, availability: "unknown" },
        now + 3 * 3600000
      )
    ).toHaveLength(offers.length);
  });
});
