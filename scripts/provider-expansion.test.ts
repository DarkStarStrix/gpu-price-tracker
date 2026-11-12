import { describe, expect, it } from "vitest";
import {
  parseAzure,
  parseGpuAi,
  parseLinode,
  parseLium,
  parseOpenRelay,
  parseOracle,
  parseSpheron,
  parseVoltageGpu,
} from "./provider-feeds";
import {
  parseCanopy,
  parseGoogleCloud,
  parseOvh,
  parseSesterce,
  parseSixtytwo,
  parseThunder,
} from "./provider-rate-cards";
import { collect } from "./collect";
import { estimateJobCost } from "../shared/job-cost";
import { readSnapshot, writeSnapshot } from "../shared/browser-snapshot";

const at = "2026-11-12T03:00:00Z";

it("reads Sesterce node rates and rejects disagreement between the price columns", () => {
  const html = `<dl><dt>GPU</dt><dt>Cost From</dt><dt>vRAM</dt><dt>vCPU</dt><dt>RAM</dt><dt>Regions</dt><dt>Cost From</dt></dl>
    <dl><dt><a href="/compute/new?gpuType=H100&amp;numGpus=8">H100</a></dt>
    <dt>$28.16/h</dt><dt>640 GB</dt><dt>192</dt><dt>960 GB</dt><dt>+2</dt><dt>$28.16/h</dt></dl>`;
  expect(parseSesterce(html, at).offers).toMatchObject([
    {
      gpuCount: 8,
      vramPerGpuGb: 80,
      pricePerGpuHr: 3.52,
      totalNodePriceHr: 28.16,
      availability: "unknown",
    },
  ]);
  expect(() => parseSesterce(html.replace("$28.16/h", "$4.52/h"), at)).toThrow(
    "Sesterce configuration"
  );
});

it("normalizes Spheron whole-node rates once and rejects incomplete pages", () => {
  const row = {
    provider: "spheron-es",
    offerId: "us-west-h100",
    instanceType: "SPOT",
    gpuCount: 8,
    price: 24,
    available: true,
    maintenance: true,
    clusters: ["US West"],
    gpu_memory: 80,
    vcpus: 192,
    memory: 1500,
  };
  const page = {
    total: 1,
    limit: 100,
    page: 1,
    totalPages: 1,
    data: [
      {
        gpuType: "H100_SXM5",
        displayName: "H100 SXM5",
        offers: [row, { ...row, instanceType: "CLUSTER" }],
      },
    ],
  };
  expect(parseSpheron([page], at).offers).toMatchObject([
    {
      gpuModelId: "h100-sxm",
      gpuCount: 8,
      totalNodePriceHr: 24,
      pricePerGpuHr: 3,
      availability: "unavailable",
      billingModel: "spot",
      region: "US West",
    },
  ]);
  expect(() =>
    parseSpheron([{ ...page, total: 101, totalPages: 2 }], at)
  ).toThrow("Incomplete");
});

it("keeps VoltageGPU price floors distinct from configured VMs and rejects stale feeds", () => {
  const feed = {
    meta: { updatedAt: at, stale: false, scope: "rentable" },
    gpus: [
      {
        model: "RTX 4090",
        vram: "24 GB",
        pricePerHour: 0.5,
        spotOnly: true,
        availableOnDemand: 0,
        availableSpot: 8,
      },
    ],
    confidentialVm: {
      tiers: [
        {
          resourceName: "h200-xlarge",
          model: "H200",
          vram: "141 GB",
          gpuCount: 8,
          pricePerHour: 64,
          available: 0,
        },
      ],
    },
    dedicated: { tiers: [] },
  };
  expect(parseVoltageGpu(feed, at).offers).toMatchObject([
    {
      billingModel: "spot",
      pricePerGpuHr: 0.5,
      configurationKnown: false,
      availability: "available",
    },
    {
      billingModel: "on-demand",
      pricePerGpuHr: 8,
      configurationKnown: true,
      cloudType: "confidential",
      availability: "unavailable",
    },
  ]);
  expect(() => parseVoltageGpu(feed, "2026-11-12T03:21:00Z")).toThrow("stale");
});

it("publishes Sixtytwo term pricing only in the source profile and retains it after a failed check", async () => {
  const html = `<main><p>Prices per GPU-hour unless noted.</p>
    <table><thead><tr><th>GPU</th><th>Quantity</th><th>Location</th><th>Term</th><th>Ready</th><th>Price</th></tr></thead>
    <tbody><tr><td>H100 SXM</td><td>32</td><td>US</td><td>12 months, prepaid</td><td>3 to 4 weeks</td><td>$2.79</td></tr>
    <tr><td>H100 SXM</td><td>8 per node</td><td>India</td><td>12 months</td><td>2 weeks</td><td>$16,183 per node per month</td></tr></tbody></table>
    <table><thead><tr><th>GPU</th><th>Quantity</th><th>Region</th><th>Price</th><th>Go-live</th><th>Term</th></tr></thead>
    <tbody><tr><td>B300 SXM</td><td>16</td><td>US Northwest</td><td>$5.04</td><td>Live</td><td>24 months</td></tr></tbody></table></main>`;
  const adapter = {
    id: "sixtytwo",
    name: "Sixtytwo",
    configured: true,
    connected: true,
    fetch: async () => parseSixtytwo(html, at),
  };
  const first = await collect(null, [adapter], at);
  const durable = readSnapshot(JSON.parse(writeSnapshot(first)));
  expect(durable.offers).toEqual([]);
  expect(durable.history).toEqual([]);
  expect(durable.poolHistory).toEqual([]);
  expect(durable.sources[0].leaseRates).toMatchObject([
    { pricePerGpuHr: 2.79, term: "12 months, prepaid", ready: "3 to 4 weeks" },
    { pricePerGpuHr: 5.04, term: "24 months", ready: "Live" },
  ]);
  expect(() =>
    parseSixtytwo(html.replace("GPU-hour", "node-month"), at)
  ).toThrow("units");
  const failed = await collect(
    durable,
    [
      {
        ...adapter,
        fetch: async () => {
          throw new Error("offline");
        },
      },
    ],
    "2026-11-12T03:15:00Z"
  );
  expect(failed.sources[0]).toMatchObject({
    status: "error",
    lastSuccessAt: at,
    leaseRates: durable.sources[0].leaseRates,
  });
});

const node = {
  id: "6c5f66c8-d6ba-4f87-8466-b728520e9095",
  gpu_model: "H200",
  gpu_count: 8,
  min_rentable_gpu_count: 2,
  available_gpu_count: 2,
  available_now: true,
  price_per_gpu_hour: 4.08,
  price_per_node_hour: 32.64,
  gpu_memory_gb: 140,
  cpu_count: 127,
  ram_gb: 1575,
  tier: "spot",
  country_code: "FI",
  city: "Helsinki",
};
const lium = { generated_at: at, count: 1, nodes: [node] };
const boardRow = {
  gpu_type: "h100_sxm",
  gpu_count: 8,
  offering_id: "12345678",
  region: "us-east",
  cpu_cores: 128,
  ram_gb: 1000,
  tier: "on_demand",
  capacity_class: "community",
  price_per_hour: 22.3,
  available: 1,
};
const gpuTypes = {
  data: [{ gpu_type: "h100_sxm", vram_gb: 80 }],
  next_cursor: null,
};

describe("GPU catalog APIs", () => {
  it("preserves full-node prices and stock distinctions on Lium", () => {
    const offer = parseLium(lium, at).offers[0];
    expect(offer).toMatchObject({
      gpuCount: 8,
      pricePerGpuHr: 4.08,
      totalNodePriceHr: 32.64,
      availability: "limited",
      billingModel: "spot",
      region: "Helsinki, FI",
    });
    expect(estimateJobCost(offer, 1, 2)).toEqual({
      total: 16.32,
      nodes: 1,
      billedGpus: 2,
    });
    expect(estimateJobCost(offer, 3, 2)).toEqual({
      total: 24.48,
      nodes: 1,
      billedGpus: 3,
    });
    expect(estimateJobCost(offer, 9, 1)).toMatchObject({
      nodes: 2,
      billedGpus: 10,
    });
    expect(
      parseLium(
        {
          ...lium,
          nodes: [{ ...node, available_gpu_count: 0, available_now: false }],
        },
        at
      ).offers[0].availability
    ).toBe("unavailable");
    expect(() => parseLium({ ...lium, count: 2 }, at)).toThrow("incomplete");
    expect(() =>
      parseLium({ ...lium, generated_at: "2026-11-12T02:00:00Z" }, at)
    ).toThrow("stale");
    expect(() =>
      parseLium(
        {
          ...lium,
          nodes: [{ ...node, price_per_node_hour: 4.08 }],
        },
        at
      )
    ).toThrow("inconsistent");
  });

  it("requires all GPU.ai pages and divides the whole offer price once", () => {
    expect(
      parseGpuAi([{ data: [boardRow], next_cursor: null }], gpuTypes, at)
        .offers[0]
    ).toMatchObject({
      gpuModelId: "h100-sxm",
      pricePerGpuHr: 22.3 / 8,
      totalNodePriceHr: 22.3,
      vramPerGpuGb: 80,
      availability: "available",
      cloudType: "community",
    });
    expect(() =>
      parseGpuAi([{ data: [boardRow], next_cursor: "next" }], gpuTypes, at)
    ).toThrow("Incomplete");
  });

  it("labels API rate cards as price-only observations", () => {
    const linode = parseLinode(
      {
        pages: 1,
        results: 1,
        data: [
          {
            id: "g6-rtx6000-192",
            label: "Dedicated 128GB + RTX6000 GPU x4",
            gpus: 4,
            vcpus: 24,
            memory: 131072,
            price: { hourly: 6 },
          },
        ],
      },
      at
    ).offers[0];
    expect(linode).toMatchObject({
      gpuCount: 4,
      pricePerGpuHr: 1.5,
      totalNodePriceHr: 6,
      availability: "unknown",
      vramPerGpuGb: 24,
      configurationKnown: true,
    });
    const tiers = parseOpenRelay(
      {
        generatedAt: at,
        gpu: [
          {
            id: node.id,
            name: "H200",
            manufacturer: "NVIDIA",
            vramGb: 141,
            communityCents: 240,
            verifiedCents: 300,
          },
        ],
      },
      at
    ).offers;
    expect(
      tiers.map(o => [
        o.cloudType,
        o.pricePerGpuHr,
        o.availability,
        o.configurationKnown,
      ])
    ).toEqual([
      ["community", 2.4, "unknown", false],
      ["verified", 3, "unknown", false],
    ]);
  });

  it("excludes non-compute Oracle license meters", () => {
    const row = {
      partNumber: "B98415",
      displayName: "Oracle Cloud Infrastructure - Compute - GPU - H100",
      serviceCategory: "Compute - GPU",
      metricName: "GPU Per Hour",
      currencyCodeLocalizations: [
        {
          currencyCode: "USD",
          prices: [{ model: "PAY_AS_YOU_GO", value: 10 }],
        },
      ],
    };
    const items = [
      row,
      {
        ...row,
        partNumber: "B1",
        displayName: "OCI - NVIDIA AI Enterprise - H100",
      },
    ];
    expect(parseOracle({ items }, at).offers).toMatchObject([
      {
        offerId: "oracle:B98415",
        pricePerGpuHr: 10,
        configurationKnown: false,
      },
    ]);
  });

  it("selects Azure Linux spot meters and retains the whole VM cost", () => {
    const row = {
      currencyCode: "USD",
      unitOfMeasure: "1 Hour",
      retailPrice: 18.4,
      armRegionName: "eastus",
      armSkuName: "Standard_ND96isr_H100_v5",
      productName: "Virtual Machines NDsr H100 v5 Series",
      meterName: "ND96isrH100v5 Spot",
      effectiveStartDate: "2026-11-01T00:00:00Z",
      skuId: "SKU",
      meterId: "METER",
      type: "Consumption",
    };
    expect(
      parseAzure(
        {
          NextPageLink: null,
          Items: [
            row,
            { ...row, productName: row.productName + " Windows" },
            { ...row, meterName: "ND96isrH100v5 Low Priority" },
          ],
        },
        at
      )
    ).toMatchObject([
      {
        gpuCount: 8,
        billingModel: "spot",
        pricePerGpuHr: 18.4 / 8,
        totalNodePriceHr: 18.4,
      },
    ]);
  });
});

function table(headers: string[], rows: string[][]): string {
  return `<table><thead><tr>${headers.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows
    .map(row => `<tr>${row.map(c => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

it("keeps per-GPU and whole-instance rate cards distinct", () => {
  const canopy = table(
    [
      "Instance Type",
      "vCPUs",
      "RAM",
      "NVMe Storage",
      "Public IP",
      "Price/Hour/GPU",
    ],
    [
      ["8x NVIDIA SXM5 H100", "160", "1.5 TB", "6 TB", "1", "$3.25"],
      ["8x NVIDIA SXM5 B200", "240", "1.5 TB", "8 TB", "1", "Get Quote"],
    ]
  );
  expect(parseCanopy(canopy, at)).toMatchObject({
    offers: [
      {
        totalNodePriceHr: 26,
        pricePerGpuHr: 3.25,
        availability: "unknown",
        priceBasis: "per_gpu_hour",
      },
    ],
    exclusions: [{ reason: "quote_required" }],
  });
  const ovh = table(
    [
      "Name",
      "Memory",
      "vCore",
      "GPU",
      "Storage",
      "Public network",
      "Private network",
      "Price(excl. taxes/hour)",
      "Price(excl. taxes/month)",
    ],
    [
      [
        "l40s-180",
        "180 GB",
        "30",
        "2x L40S (48 GB HBM2)",
        "400 GB NVMe",
        "16 Gbit/s",
        "16 Gbit/s max.",
        "$3.6",
        "$2,592",
      ],
    ]
  );
  expect(parseOvh(ovh, at).offers[0]).toMatchObject({
    totalNodePriceHr: 3.6,
    pricePerGpuHr: 1.8,
  });
  const thunder = table(
    ["GPU", "VRAM", "vCPUs", "RAM", "Disk", "Price", "Action"],
    [
      [
        "H100 SXM",
        "80 GB",
        "4 included · 16 max",
        "32–128 GB",
        "100–500 GB",
        "€3.20/hr",
        "Launch",
      ],
    ]
  );
  expect(() => parseThunder(thunder, at)).toThrow("USD hourly");
});

it("keeps Google Cloud fractional GPUs and placeholder rates out of full-GPU prices", () => {
  const html = table(
    [
      "Machine type",
      "GPU",
      "Components",
      "Price (USD)*",
      "Current Spot pricing (USD)",
    ],
    [
      [
        "g4-standard-6",
        "NVIDIA RTX PRO 6000",
        "GPUs: 1/8 vCPUs: 6",
        "$0.64 / 1 hour",
        "$0.24 / 1 hour",
      ],
      [
        "g2-standard-24",
        "NVIDIA L4",
        "GPUs: 2 vCPUs: 24",
        "$2 / 1 hour",
        "g2-standard-24-spot",
      ],
    ]
  );
  expect(parseGoogleCloud(html, at).offers).toMatchObject([
    {
      gpuModelId: "l4",
      gpuCount: 2,
      billingModel: "on-demand",
      totalNodePriceHr: 2,
      pricePerGpuHr: 1,
    },
  ]);
});

it("retains all observations and evidence when packing the durable snapshot", async () => {
  const source = {
    id: "lium",
    name: "Lium",
    configured: true,
    connected: true,
    fetch: async () => parseLium(lium, at),
  };
  const snapshot = await collect(null, [source], at);
  snapshot.history.push({
    ...snapshot.history[0],
    observedAt: "2026-11-12T02:45:00Z",
    dataSource: "pricing_page",
    sourceUrl: "https://example.com/old-price",
    sourceSha256: "a".repeat(64),
    historyOrigin: undefined,
  });
  const old = JSON.parse(JSON.stringify(snapshot));
  const packed = JSON.parse(writeSnapshot(snapshot));
  expect(readSnapshot(old)).toEqual(snapshot);
  expect(readSnapshot(packed)).toEqual(snapshot);
  packed.packedHistory.points[0][1] = 9999;
  expect(() => readSnapshot(packed)).toThrow(
    "Invalid published price history point"
  );
});
