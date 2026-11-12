import { z } from "zod";
import type { GpuOffer, SourceResult } from "../shared/catalog";
import { addedProviders } from "../shared/added-providers";
import { fetchPublicText } from "./http";
import { providerOffer } from "./provider-offer";
import type { Source } from "./providers";

const lium = "https://lium.io/api/public/v1/nodes?include_rented=true";
const gpuAi = "https://api.gpu.ai/v1/pricing";
const gpuAiTypes = "https://api.gpu.ai/v1/gpu-types";
const openRelay = "https://api.openrelay.inc/v1/public/pricing";
const linode = "https://api.linode.com/v4/linode/types?page_size=500";
const oracle =
  "https://apexapps.oracle.com/pls/apex/cetools/api/v1/products/?currencyCode=USD";
const azure = "https://prices.azure.com/api/retail/prices";
const text = z.string().min(1);
const price = z.number().positive();
const positiveCount = z.number().int().positive();
const nonnegativeCount = z.number().int().nonnegative();
const timestamp = z.iso.datetime({ offset: true });
const gpuBasis = "per_gpu_hour" as const;
const instanceBasis = "per_instance_hour" as const;

const liumFeed = z.object({
  generated_at: timestamp,
  count: nonnegativeCount,
  nodes: z.array(
    z.object({
      id: z.uuid(),
      gpu_model: text,
      gpu_count: positiveCount,
      min_rentable_gpu_count: positiveCount,
      available_gpu_count: nonnegativeCount,
      available_now: z.boolean(),
      price_per_gpu_hour: price,
      price_per_node_hour: price,
      gpu_memory_gb: z.number().nonnegative().nullable(),
      cpu_count: nonnegativeCount.nullable(),
      ram_gb: z.number().nonnegative().nullable(),
      tier: z.enum(["secure", "spot"]),
      country_code: z.string().nullable(),
      city: z.string().nullable(),
    })
  ),
});

export function parseLium(data: unknown, at: string): SourceResult {
  const { count, nodes, generated_at } = liumFeed.parse(data);
  const age = Date.parse(at) - Date.parse(generated_at);
  if (count !== nodes.length || age < -120_000 || age > 900_000)
    throw new Error("Lium feed is incomplete or stale");
  const offers = nodes.map(node => {
    const free = node.available_gpu_count;
    if (
      free > node.gpu_count ||
      node.available_now !== free > 0 ||
      Math.abs(
        node.price_per_node_hour - node.gpu_count * node.price_per_gpu_hour
      ) > 0.00001
    )
      throw new Error("Lium node capacity or price is inconsistent");
    return providerOffer("lium", node.gpu_model, {
      id: `${node.id}:${node.tier}`,
      at,
      url: lium,
      link: `https://lium.io/browse-pods/${node.id}`,
      count: node.gpu_count,
      minRentalGpus: node.min_rentable_gpu_count,
      vram: node.gpu_memory_gb,
      vcpus: node.cpu_count,
      ram: node.ram_gb,
      region: [node.city, node.country_code].filter(Boolean).join(", "),
      rate: node.price_per_gpu_hour,
      basis: gpuBasis,
      tier: node.tier,
      billing: node.tier === "spot" ? "spot" : "on-demand",
      availability:
        free === 0
          ? "unavailable"
          : free < node.gpu_count
            ? "limited"
            : "available",
    });
  });
  return { offers };
}

const gpuAiOffer = z.object({
  gpu_type: z.string().regex(/^[a-z0-9_]+$/),
  gpu_count: positiveCount,
  offering_id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  region: text,
  cpu_cores: z.number().nonnegative(),
  ram_gb: z.number().nonnegative(),
  tier: z.enum(["on_demand", "spot"]),
  capacity_class: z.enum(["community", "secure"]),
  price_per_hour: price,
  available: nonnegativeCount,
});
function cursorPage<T extends z.ZodType>(row: T) {
  return z.object({ data: z.array(row), next_cursor: text.nullable() });
}
const gpuAiPage = cursorPage(gpuAiOffer);
const gpuAiCatalog = cursorPage(
  z.object({
    gpu_type: text,
    vram_gb: price,
  })
);

function gpuAiName(type: string): string {
  return type
    .toUpperCase()
    .replaceAll("_", " ")
    .replace(/(\d+)GB$/, "$1 GB");
}

export function parseGpuAi(
  pages: unknown[],
  catalog: unknown,
  at: string
): SourceResult {
  const types = gpuAiCatalog.parse(catalog);
  if (types.next_cursor || !types.data.length || !pages.length)
    throw new Error("Incomplete GPU.ai GPU types");
  const memory = new Map(types.data.map(type => [type.gpu_type, type.vram_gb]));
  const offers = pages.flatMap((payload, index) => {
    const page = gpuAiPage.parse(payload);
    if (Boolean(page.next_cursor) !== index < pages.length - 1)
      throw new Error("Incomplete GPU.ai pricing board");
    return page.data.map(row => {
      const model = gpuAiName(row.gpu_type);
      const vram =
        memory.get(row.gpu_type) ?? Number(/_(\d+)gb$/.exec(row.gpu_type)?.[1]);
      return providerOffer("gpu-ai", model, {
        id: `${row.offering_id}:${row.tier}`,
        at,
        url: gpuAi,
        link: "https://gpu.ai/",
        count: row.gpu_count,
        vram: vram || null,
        vcpus: row.cpu_cores,
        ram: row.ram_gb,
        region: row.region,
        rate: row.price_per_hour,
        basis: instanceBasis,
        billing: row.tier === "spot" ? "spot" : "on-demand",
        tier: row.capacity_class,
        availability: row.available > 0 ? "available" : "unavailable",
      });
    });
  });
  return { offers };
}

const relayFeed = z.object({
  generatedAt: timestamp,
  gpu: z.array(
    z.object({
      id: z.uuid(),
      name: text,
      manufacturer: text,
      vramGb: price,
      communityCents: nonnegativeCount.nullable(),
      verifiedCents: nonnegativeCount.nullable(),
    })
  ),
});
export function parseOpenRelay(data: unknown, at: string): SourceResult {
  const feed = relayFeed.parse(data);
  const offers = feed.gpu.flatMap(gpu =>
    (
      [
        ["community", gpu.communityCents],
        ["verified", gpu.verifiedCents],
      ] as const
    ).flatMap(([tier, cents]) =>
      cents
        ? [
            providerOffer("openrelay", `${gpu.manufacturer} ${gpu.name}`, {
              id: `${gpu.id}:${tier}`,
              at,
              url: openRelay,
              link: "https://openrelay.inc/pricing",
              vram: gpu.vramGb,
              rate: cents / 100,
              basis: gpuBasis,
              tier,
            }),
          ]
        : []
    )
  );
  if (!offers.length) throw new Error("Empty OpenRelay rate card");
  return { offers };
}

const linodeFeed = z.object({
  pages: positiveCount,
  results: nonnegativeCount,
  data: z.array(
    z.object({
      id: text,
      label: text,
      gpus: nonnegativeCount,
      vcpus: positiveCount,
      memory: positiveCount,
      price: z.object({ hourly: price }),
    })
  ),
});
export function parseLinode(data: unknown, at: string): SourceResult {
  const feed = linodeFeed.parse(data);
  if (feed.pages !== 1 || feed.results !== feed.data.length)
    throw new Error("Incomplete Akamai plan catalog");
  const offers = feed.data
    .filter(row => row.gpus > 0)
    .map(row => {
      const hardware = [
        [/\bRTX\s*4000 Ada\b/i, "RTX 4000 Ada", 20],
        [/\bRTX\s*PRO\s*6000\b/i, "RTX PRO 6000 Blackwell Server Edition", 96],
        [/\bRTX\s*6000\s+GPU\b/i, "Quadro RTX 6000", 24],
      ] as const;
      const model = hardware.find(([pattern]) => pattern.test(row.label));
      if (!model) throw new Error("Unknown Akamai GPU plan");
      return providerOffer("linode", model[1], {
        id: row.id,
        at,
        url: linode,
        link: "https://techdocs.akamai.com/cloud-computing/docs/gpu-compute-instances",
        count: row.gpus,
        vram: model[2],
        vcpus: row.vcpus,
        ram: row.memory / 1024,
        rate: row.price.hourly,
        basis: instanceBasis,
      });
    });
  if (!offers.length) throw new Error("Empty Akamai GPU catalog");
  return { offers };
}

const oracleFeed = z.object({
  items: z.array(
    z.object({
      partNumber: text,
      displayName: text,
      serviceCategory: z.string().optional(),
      metricName: text,
      currencyCodeLocalizations: z
        .array(
          z.object({
            currencyCode: text,
            prices: z.array(
              z.object({ model: text, value: z.number().nonnegative() })
            ),
          })
        )
        .optional(),
    })
  ),
});
export function parseOracle(data: unknown, at: string): SourceResult {
  const offers = oracleFeed.parse(data).items.flatMap(row => {
    if (
      row.metricName !== "GPU Per Hour" ||
      row.serviceCategory !== "Compute - GPU"
    )
      return [];
    const model =
      /(?:^| - )Compute\s*- GPU - (L40S|H200|MI300X|MI355X|GB200|GB300|B200|B300|A100|A10|H100|RTX PRO 6000)(?: - v2)?$/.exec(
        row.displayName
      )?.[1];
    if (!model) return [];
    const rate = row.currencyCodeLocalizations
      ?.find(c => c.currencyCode === "USD")
      ?.prices.find(p => p.model === "PAY_AS_YOU_GO")?.value;
    if (!rate) return [];
    return [
      providerOffer("oracle", model, {
        id: row.partNumber,
        at,
        url: oracle,
        link: "https://www.oracle.com/cloud/price-list/",
        rate,
        basis: gpuBasis,
      }),
    ];
  });
  if (!offers.length) throw new Error("Empty Oracle GPU rate card");
  return { offers };
}

const azureShapes = {
  Standard_NC24ads_A100_v4: ["A100 PCIe", 1, 80],
  Standard_NC48ads_A100_v4: ["A100 PCIe", 2, 80],
  Standard_NC96ads_A100_v4: ["A100 PCIe", 4, 80],
  Standard_NC40ads_H100_v5: ["H100 NVL", 1, 94],
  Standard_NC80adis_H100_v5: ["H100 NVL", 2, 94],
  Standard_ND96isr_H100_v5: ["H100 SXM", 8, 80],
  Standard_ND96isr_H200_v5: ["H200 SXM", 8, 141],
  Standard_ND96amsr_A100_v4: ["A100 SXM", 8, 80],
} as const;
const azureFeed = z.object({
  NextPageLink: text.nullable(),
  Items: z.array(
    z.object({
      currencyCode: z.literal("USD"),
      unitOfMeasure: z.literal("1 Hour"),
      retailPrice: z.number().nonnegative(),
      armRegionName: text,
      meterName: text,
      productName: text,
      armSkuName: text,
      effectiveStartDate: text,
      skuId: text,
      meterId: text,
      type: z.literal("Consumption"),
    })
  ),
});

export function parseAzure(data: unknown, at: string): GpuOffer[] {
  const feed = azureFeed.parse(data);
  if (feed.NextPageLink)
    throw new Error("Incomplete Azure retail price response");
  return feed.Items.flatMap(row => {
    if (!Object.hasOwn(azureShapes, row.armSkuName)) return [];
    const shape = azureShapes[row.armSkuName as keyof typeof azureShapes];
    if (
      !shape ||
      !row.retailPrice ||
      /\bWindows\b/i.test(row.productName) ||
      /Low Priority/i.test(row.meterName) ||
      Date.parse(row.effectiveStartDate) > Date.parse(at)
    )
      return [];
    const [model, count, vram] = shape;
    const billing = /\bSpot$/.test(row.meterName) ? "spot" : "on-demand";
    return [
      providerOffer("azure", model, {
        id: `${row.armRegionName}:${row.skuId}:${row.meterId}`,
        at,
        url: azure,
        link: "https://azure.microsoft.com/en-us/pricing/details/virtual-machines/linux/",
        count,
        vram,
        region: row.armRegionName,
        rate: row.retailPrice,
        basis: instanceBasis,
        billing,
      }),
    ];
  });
}

async function json(url: string): Promise<unknown> {
  return JSON.parse(await fetchPublicText(url, "application/json"));
}
async function gpuAiPricing(at: string): Promise<SourceResult> {
  const catalog = await json(gpuAiTypes);
  const pages = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "200" });
    if (cursor) query.set("cursor", cursor);
    const page = await json(`${gpuAi}?${query}`);
    pages.push(page);
    cursor = gpuAiPage.parse(page).next_cursor;
    if (cursor && (cursors.has(cursor) || pages.length === 12))
      throw new Error("GPU.ai pricing pagination did not finish");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return parseGpuAi(pages, catalog, at);
}

export function providerFeedSources(): Source[] {
  return [
    {
      id: "lium",
      fetch: async (at: string) => parseLium(await json(lium), at),
    },
    { id: "gpu-ai", fetch: gpuAiPricing },
    {
      id: "openrelay",
      fetch: async (at: string) => parseOpenRelay(await json(openRelay), at),
    },
    {
      id: "linode",
      fetch: async (at: string) => parseLinode(await json(linode), at),
    },
    {
      id: "oracle",
      fetch: async (at: string) => parseOracle(await json(oracle), at),
    },
    {
      id: "azure",
      fetch: async (at: string) => {
        const plans = Object.keys(azureShapes)
          .map(sku => `armSkuName eq '${sku}'`)
          .join(" or ");
        const results = await Promise.all(
          ["eastus", "westus2", "centralus"].map(async region => {
            const query = new URLSearchParams({
              "api-version": "2023-01-01-preview",
              $filter: `serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and priceType eq 'Consumption' and isPrimaryMeterRegion eq true and (${plans})`,
            });
            return parseAzure(
              await json(`${azure}?${query.toString().replaceAll("+", "%20")}`),
              at
            );
          })
        );
        const offers = results.flat();
        if (!offers.length) throw new Error("Empty Azure GPU rate card");
        return { offers };
      },
    },
  ].map(source => ({
    ...source,
    name: addedProviders[source.id as keyof typeof addedProviders].name,
    configured: true,
    connected: true,
  }));
}
