import { load } from "cheerio";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import {
  offerSchema,
  type GpuOffer,
  type SourceResult,
} from "../shared/catalog";
import type { Source } from "./providers";
import { fetchPricingPage } from "./pricing-pages";
import { gpuId } from "./gpu";

export const urls = {
  hyperstack: "https://www.hyperstack.cloud/gpu-pricing",
  verda: "https://verda.com/pricing",
  crusoe: "https://www.crusoe.ai/cloud/pricing",
  vultr: "https://api.vultr.com/v2/plans?per_page=500",
  nebius: "https://api.nebius.cloud/billing/v1alpha1/spot-price",
};
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
function price(s: string) {
  const m = /^\$(\d+(?:\.\d+)?)(?:\s*\/\s*(?:h|hr|GPU-hr))?$/.exec(s);
  if (!m || Number(m[1]) <= 0) throw new Error("Unexpected USD price");
  return Number(m[1]);
}
function pageOffer(
  id: "hyperstack" | "verda" | "crusoe",
  name: string,
  vram: number,
  rate: number,
  html: string,
  at: string,
  extra: Partial<GpuOffer> = {}
): GpuOffer {
  return offerSchema.parse({
    offerId: `${id}:${slug(name)}:on-demand`,
    providerId: id,
    providerName: {
      hyperstack: "Hyperstack",
      verda: "Verda",
      crusoe: "Crusoe",
    }[id],
    gpuModelId: gpuId(name, vram),
    gpuModelName: name,
    gpuCount: 1,
    configurationKnown: false,
    billingModel: "on-demand",
    vramPerGpuGb: vram,
    vcpus: null,
    ramGb: null,
    region: "Not specified",
    pricePerGpuHr: rate,
    totalNodePriceHr: rate,
    availability: "unknown",
    providerLink: urls[id],
    sourceUrl: urls[id],
    cloudType: "on-demand",
    dataSource: "pricing_page",
    sourcePriceHr: rate,
    priceBasis: "per_gpu_hour",
    sourceSha256: hash(html),
    observedAt: at,
    ...extra,
  });
}
function pageResult(
  id: "hyperstack" | "verda" | "crusoe",
  offers: GpuOffer[],
  html: string,
  at: string,
  exclusions: SourceResult["exclusions"] = []
): SourceResult {
  if (!offers.length) throw new Error("No verified GPU rows");
  return {
    offers,
    exclusions,
    evidence: {
      sourceUrl: urls[id],
      retrievedAt: at,
      contentSha256: hash(html),
      parserVersion: `${id}-html-1`,
    },
  };
}
export function parseHyperstack(html: string, at: string): SourceResult {
  const $ = load(html);
  const card = $("h3")
    .filter((_, e) => clean($(e).text()) === "On-Demand GPU Pricing")
    .closest(".page-price_card");
  if (
    card.length !== 1 ||
    card
      .find(".page-price_card_head_item")
      .map((_, e) => clean($(e).text()))
      .get()
      .join("|") !==
      "GPU Model|VRAM (GB)|Max pCPUs per GPU|Max RAM (GB) per GPU|Pricing Per Hour"
  )
    throw new Error("Hyperstack headers changed");
  const offers: GpuOffer[] = [];
  card.find(".page-price_card_row_item").each((_, e) => {
    const v = $(e)
      .children(".page-price_card_row_item_col")
      .map((_, c) => clean($(c).text()))
      .get();
    if (v.length !== 5 || !/^\d+$/.test(v[1]))
      throw new Error("Hyperstack row changed");
    offers.push(
      pageOffer("hyperstack", v[0], Number(v[1]), price(v[4]), html, at)
    );
  });
  return pageResult("hyperstack", offers, html, at);
}
export function parseVerda(html: string, at: string): SourceResult {
  const $ = load(html);
  const tables = $("table").filter(
    (_, t) =>
      clean($(t).parent().parent().prevAll("h2,h3").first().text()) ===
        "On-demand" &&
      clean($(t).parent().parent().prevAll("h2").first().text()) ===
        "GPU instances"
  );
  if (
    tables.length !== 1 ||
    tables
      .find("th")
      .map((_, e) => clean($(e).text()))
      .get()
      .join("|") !== "Hardware|CPUs|RAM|GPU VRAM|Price|Spot price"
  )
    throw new Error("Verda table changed");
  const offers: GpuOffer[] = [];
  tables
    .find("tbody tr")
    .filter((_, e) => $(e).children("td").length > 0)
    .each((_, e) => {
      const v = $(e)
        .children("td")
        .map((_, c) => clean($(c).text()))
        .get();
      if (v.length !== 6 || !/^1x\s/.test(v[0]) || !/^\d+\s*GB$/.test(v[3]))
        throw new Error("Verda row changed");
      const o = pageOffer(
        "verda",
        v[0].replace(/^1x\s*/, ""),
        Number(v[3].replace(/\D/g, "")),
        price(v[4]),
        html,
        at,
        {
          configurationKnown: true,
          priceBasis: "per_instance_hour",
          ramGb: Number(v[2].replace(/\D/g, "")),
        }
      );
      o.offerId += `:${slug(v[1])}cpu:${slug(v[2])}ram`;
      offers.push(o);
    });
  return pageResult("verda", offers, html, at);
}
export function parseCrusoe(html: string, at: string): SourceResult {
  const $ = load(html);
  const header = clean(
    $(".pricing-table-heading")
      .filter((_, e) => $(e).text().includes("GPU model"))
      .text()
  );
  if (
    !header.includes("Current on-demand") ||
    !header.includes("New on-demandstarting Dec 1, 2026")
  )
    throw new Error("Crusoe rate columns changed");
  // The reviewed transition is Dec 1, 2026. Stop rather than extending old rates past it.
  if (Date.parse(at) >= Date.parse("2026-12-01T00:00:00Z"))
    throw new Error("Crusoe rate transition requires review");
  const columns = $(".pricing_gpu-item").first().children(".w-dyn-list");
  if (columns.length !== 3) throw new Error("Crusoe columns changed");
  const models = columns.eq(0).find("[data-sort-name]");
  const rates = columns.eq(1).find("[role=listitem]");
  if (!models.length || models.length !== rates.length)
    throw new Error("Crusoe rows changed");
  // Price columns have no model IDs; lock the reviewed model/tag order before joining them.
  const identities = models
    .map(
      (_, e) =>
        `${clean($(e).find(".pricing-item-heading").text())}|${clean($(e).find(".pricing_tags-wr").text())}`
    )
    .get();
  const expected = [
    "NVIDIA Vera Rubin|288GBNVL72",
    "NVIDIA GB300|288GBNVL72",
    "NVIDIA B300|288GBHGX",
    "NVIDIA GB200|186GBNVL72",
    "NVIDIA B200|180GBHGX",
    "NVIDIA H200|141GBHGX",
    "NVIDIA H100|80GBHGX",
    "NVIDIA A100|80GBSXM",
    "NVIDIA A100|80GBPCIe",
    "NVIDIA L40S|48GB",
    "AMD MI355X|288GB",
    "AMD MI300X|192GB",
  ];
  if (identities.join(";") !== expected.join(";"))
    throw new Error("Crusoe model order changed");
  const offers: GpuOffer[] = [],
    exclusions: NonNullable<SourceResult["exclusions"]> = [];
  models.each((i, e) => {
    const name = clean($(e).find(".pricing-item-heading").text());
    const tags = clean($(e).find(".pricing_tags-wr").text());
    const memory = /(\d+)GB/.exec(tags);
    const value = clean(rates.eq(i).text());
    if (!name || !memory) throw new Error("Crusoe model changed");
    if (/^Contact sales$/i.test(value)) {
      exclusions.push({ row: name, reason: "quote_required" });
      return;
    }
    const model = `${name} ${tags.replace(/HGX/g, "SXM")}`;
    offers.push(
      pageOffer("crusoe", model, Number(memory[1]), price(value), html, at)
    );
  });
  return pageResult("crusoe", offers, html, at, exclusions);
}
const vultrSchema = z.object({
  plans: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      gpu_count: z.number().optional(),
      gpu_type: z.string().optional(),
      gpu_vram_gb: z.number().optional(),
      hourly_cost: z.number(),
      vcpu_count: z.number(),
      ram: z.number(),
    })
  ),
  meta: z.object({
    total: z.number(),
    links: z.object({ next: z.string().nullable() }),
  }),
});
export function parseVultr(payload: unknown, at: string): SourceResult {
  const d = vultrSchema.parse(payload);
  if (d.meta.links.next || d.plans.length !== d.meta.total)
    throw new Error("Incomplete Vultr catalog");
  const offers = d.plans
    .filter(p => (p.gpu_count ?? 0) > 0)
    .map(p => {
      if (!p.gpu_type || !p.gpu_vram_gb)
        throw new Error("Missing GPU specification");
      const count = p.gpu_count!;
      return offerSchema.parse({
        offerId: `vultr:${p.id}`,
        providerId: "vultr",
        providerName: "Vultr",
        gpuModelId: gpuId(
          p.gpu_type.replaceAll("_", " "),
          p.gpu_vram_gb / count
        ),
        gpuModelName: p.gpu_type.replaceAll("_", " "),
        gpuCount: count,
        configurationKnown: true,
        billingModel: "on-demand",
        vramPerGpuGb: p.gpu_vram_gb / count,
        vcpus: p.vcpu_count,
        ramGb: p.ram / 1024,
        region: "Not specified",
        pricePerGpuHr: p.hourly_cost / count,
        totalNodePriceHr: p.hourly_cost,
        availability: "unknown",
        providerLink: "https://www.vultr.com/pricing/",
        sourceUrl: urls.vultr,
        cloudType: "on-demand",
        dataSource: "api",
        observedAt: at,
      });
    });
  if (!offers.length) throw new Error("Empty GPU catalog");
  return { offers };
}
const sku = z.object({
  skuId: z.string(),
  productTitle: z.string(),
  region: z.string(),
  computeInstance: z.object({ platform: z.string() }),
});
const spotPrice = z.object({
  value: z.string().regex(/^\d+(?:\.\d+)?$/),
  currency: z.literal("usd"),
  unitTitle: z.literal("GPU hour"),
});
const currentSchema = z.object({
  items: z.array(
    sku.extend({ price: spotPrice, effectiveTime: z.string().datetime() })
  ),
  nextPageToken: z.string().optional(),
});
const seriesSchema = z.object({
  items: z.array(
    sku.extend({
      currency: z.literal("usd"),
      unitTitle: z.literal("GPU hour"),
      points: z.array(
        z.object({
          timestamp: z.string().datetime(),
          value: z.string().regex(/^\d+(?:\.\d+)?$/),
        })
      ),
    })
  ),
  nextPageToken: z.string().optional(),
});
export function parseNebius(
  current: unknown,
  series: unknown,
  at: string
): SourceResult {
  const d = currentSchema.parse(current),
    h = seriesSchema.parse(series);
  if (d.nextPageToken || h.nextPageToken)
    throw new Error("Incomplete Nebius catalog");
  const offers = d.items.map(p => {
    if (Date.parse(p.effectiveTime) > Date.parse(at))
      throw new Error("Future spot price");
    return offerSchema.parse({
      offerId: `nebius:${p.skuId}`,
      providerId: "nebius",
      providerName: "Nebius",
      gpuModelId: p.computeInstance.platform.replace(/^gpu-/, ""),
      gpuModelName: p.productTitle.replace(/^Preemptible /, ""),
      gpuCount: 1,
      configurationKnown: false,
      billingModel: "spot",
      vramPerGpuGb: null,
      vcpus: null,
      ramGb: null,
      region: p.region,
      pricePerGpuHr: Number(p.price.value),
      totalNodePriceHr: Number(p.price.value),
      availability: "unknown",
      providerLink: "https://nebius.com/spot-prices",
      sourceUrl: urls.nebius,
      cloudType: "spot",
      dataSource: "api",
      observedAt: at,
    });
  });
  if (!offers.length) throw new Error("Empty spot catalog");
  const history = h.items.flatMap(p => {
    const o = offers.find(o => o.offerId === `nebius:${p.skuId}`);
    if (!o || o.gpuModelId !== p.computeInstance.platform.replace(/^gpu-/, ""))
      throw new Error("Spot history identity mismatch");
    // Interval timestamps denote their end. The live API includes the open bucket.
    if (
      p.points.some(
        point =>
          Date.parse(point.timestamp) >
          Math.ceil(Date.parse(at) / 3600_000) * 3600_000
      )
    )
      throw new Error("Unexpected future history interval");
    return p.points
      .filter(
        p =>
          Date.parse(p.timestamp) >= Date.parse(at) - 7 * 86400_000 &&
          Date.parse(p.timestamp) <= Date.parse(at)
      )
      .map(p => ({
        offerId: o.offerId,
        providerId: o.providerId,
        gpuModelId: o.gpuModelId,
        cloudType: o.cloudType,
        billingModel: "spot" as const,
        historyOrigin: "provider_hourly_last" as const,
        pricePerGpuHr: Number(p.value),
        observedAt: p.timestamp,
        sourceUrl: `${urls.nebius}/list-series`,
        dataSource: "api" as const,
      }));
  });
  return { offers, history };
}
async function publicJson(id: string, url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      Accept: "application/json",
      "User-Agent": "gpu-price-tracker/2.0 (public pricing collector)",
    },
  });
  if (!response.ok) throw new Error("Public API HTTP failure");
  if (!response.body) throw new Error("Public API has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > 2_000_000) {
      await reader.cancel();
      throw new Error("Public API response exceeds limit");
    }
    chunks.push(value);
  }
  const body = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks)
  );
  await mkdir("work/provider-evidence", { recursive: true });
  await writeFile(`work/provider-evidence/${id}.json`, body);
  return JSON.parse(body);
}
export function expandedSources(): Source[] {
  return [
    ...(
      [
        ["hyperstack", "Hyperstack", parseHyperstack],
        ["verda", "Verda", parseVerda],
        ["crusoe", "Crusoe", parseCrusoe],
      ] as const
    ).map(([id, name, parse]) => ({
      id,
      name,
      configured: true,
      connected: true,
      fetch: (at: string) => fetchPricingPage(id, urls[id], at, parse),
    })),
    {
      id: "vultr",
      name: "Vultr",
      configured: true,
      connected: true,
      fetch: async at => parseVultr(await publicJson("vultr", urls.vultr), at),
    },
    {
      id: "nebius",
      name: "Nebius",
      configured: true,
      connected: true,
      fetch: async at => {
        const q = new URLSearchParams({
          "filters.startTime": new Date(
            Date.parse(at) - 7 * 86400_000 + 60_000
          ).toISOString(),
          "filters.endTime": at,
          "aggregation.granularity": "GRANULARITY_HOUR_1",
          "aggregation.method": "METHOD_LAST_PRICE",
          pageSize: "100",
        });
        return parseNebius(
          await publicJson("nebius-current", `${urls.nebius}?pageSize=100`),
          await publicJson("nebius-history", `${urls.nebius}/list-series?${q}`),
          at
        );
      },
    },
  ];
}
