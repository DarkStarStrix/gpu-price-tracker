import { expect, it, vi } from "vitest";
import {
  collectCompute,
  parseCloudTpu,
  parseSpheronCpu,
} from "./compute-feeds";
import { snapshotSchema, type Snapshot } from "../shared/catalog";
import {
  overviewSnapshot,
  readSnapshot,
  writeSnapshot,
} from "../shared/browser-snapshot";

const observedAt = "2026-11-12T03:30:00Z";
const at = "2026-11-12T03:45:00Z";
const cpuRow = {
  provider: "data-crunch",
  offerId: "CPU-TURIN.4V.16G",
  name: "0x AMD Turin",
  vcpus: 4,
  memory: 16,
  storage: 500,
  gpuCount: 0,
  price: 0.222,
  available: true,
  maintenance: false,
  instanceType: "DEDICATED",
  clusters: ["Finland 3"],
};
const cpuFeed = {
  page: 1,
  total: 1,
  totalPages: 1,
  data: [{ offers: [cpuRow] }],
};

it("keeps the Spheron hourly rate per instance and rejects GPU rows in the CPU catalog", () => {
  expect(parseSpheronCpu(cpuFeed)).toMatchObject([
    {
      kind: "cpu",
      price: 0.222,
      vcpus: 4,
      region: "Finland 3",
      availability: "available",
    },
  ]);
  expect(() =>
    parseSpheronCpu({
      ...cpuFeed,
      data: [{ offers: [{ ...cpuRow, gpuCount: 1 }] }],
    })
  ).toThrow();
});

it("carries TPU model names across regions and rejects monthly rates", () => {
  const html = `<section><button aria-label="Hourly" aria-checked="true">Hourly</button><div>
    <table><tr><th>Cloud TPU Version (per chip-hour)</th><th>Region</th><th>Location</th><th>On Demand (USD)</th></tr>
    <tr><td rowspan="2">Ironwood</td><td>us-central1</td><td>Iowa</td><td>$12.00</td><td>$6.00</td><td>N/A</td><td>$8.40</td><td>$5.40</td></tr>
    <tr><td>europe-west2</td><td>London</td><td>$13.20</td><td>$6.00</td><td>N/A</td><td>$9.24</td><td>$5.94</td></tr>
    </table></div></section>`;
  expect(parseCloudTpu(html)).toMatchObject([
    { model: "Ironwood", kind: "tpu", price: 12, availability: "unknown" },
    { model: "Ironwood", price: 13.2, region: "London · europe-west2" },
  ]);
  expect(() =>
    parseCloudTpu(html.replace('aria-checked="true"', 'aria-checked="false"'))
  ).toThrow("hourly");
});

it("publishes non-GPU observations separately and retains an unavailable feed's last snapshot", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url.includes("spheron.ai")
        ? new Response(JSON.stringify(cpuFeed), {
            headers: { "content-type": "application/json" },
          })
        : new Response(null, { status: 503 })
    )
  );
  try {
    const feeds = await collectCompute([], observedAt);
    expect(feeds.find(feed => feed.providerId === "spheron")?.status).toBe(
      "ok"
    );
    expect(feeds.find(feed => feed.providerId === "gcp")).toMatchObject({
      status: "error",
      observedAt: null,
      rates: [],
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const retained = await collectCompute(feeds, at);
    const snapshot: Snapshot = {
      version: 1,
      generatedAt: at,
      offers: [],
      history: [],
      sources: [],
      compute: retained,
    };
    const roundTrip = readSnapshot(JSON.parse(writeSnapshot(snapshot)));
    const published = snapshotSchema.parse(overviewSnapshot(roundTrip));
    expect(published.offers).toHaveLength(0);
    expect(published.history).toHaveLength(0);
    expect(
      published.compute?.find(feed => feed.providerId === "spheron")
    ).toMatchObject({
      status: "error",
      observedAt,
      rates: [{ price: 0.222 }],
    });
  } finally {
    vi.unstubAllGlobals();
  }
});
