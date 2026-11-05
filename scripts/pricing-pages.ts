import { load } from "cheerio";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import {
  offerSchema,
  type GpuOffer,
  type SourceResult,
  type Exclusion,
} from "../shared/catalog";
import { gpuId } from "./gpu";
import type { Source } from "./providers";

export const COREWEAVE_URL = "https://www.coreweave.com/pricing";
export const PAPERSPACE_URL =
  "https://docs.digitalocean.com/products/paperspace/pricing/";
const text = (s: string) => s.replace(/\s+/g, " ").trim();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
function requireCurrentPricing(bodyText: string) {
  // A dated rate transition needs explicit review; do not guess which rate is in force.
  if (/\b(?:take|takes) effect\b|\beffective (?:from|on)\b/i.test(bodyText))
    throw new Error("Effective-date notice requires review");
}

function number(s: string): number {
  if (!/^\d[\d,]*(?:\.\d+)?$/.test(s))
    throw new Error("Unexpected numeric cell");
  const n = Number(s.replaceAll(",", ""));
  if (!Number.isFinite(n) || n <= 0) throw new Error("Invalid positive number");
  return n;
}
function dollars(s: string): number {
  if (!/^\$\d[\d,]*(?:\.\d+)?$/.test(s))
    throw new Error("Unexpected USD price cell");
  return number(s.slice(1));
}
function result(
  offers: GpuOffer[],
  exclusions: Exclusion[],
  html: string,
  at: string,
  url: string,
  version: string
): SourceResult {
  if (!offers.length) throw new Error("No verified prices extracted");
  return {
    offers,
    exclusions,
    evidence: {
      sourceUrl: url,
      retrievedAt: at,
      contentSha256: hash(html),
      parserVersion: version,
    },
  };
}
export function parseCoreweave(html: string, at: string): SourceResult {
  const $ = load(html);
  requireCurrentPricing(
    text(
      $("body").clone().find("script, style, noscript").remove().end().text()
    )
  );
  const offers: GpuOffer[] = [];
  const exclusions: Exclusion[] = [];
  const regions: string[] = [];
  $(".table-v2.gpu-pricing").each((_, table) => {
    const headers = $(table)
      .find(".table-v2-header .table-header-text")
      .map((_, cell) => text($(cell).text()))
      .get();
    if (headers[0] === "CPU Model" || headers[0] === "Product") return;
    if (
      headers.slice(0, 7).join("|") !==
      "GPU Model|GPU Count|VRAM (GB)|vCPUs|System RAM(GB)|Local Storage(TB)|On-Demand Price (Per Hour)"
    )
      throw new Error("CoreWeave pricing headers changed");
    const region = text($(table).prevAll("h5").first().text())
      .replace(/^REGION:\s*/i, "")
      .toUpperCase();
    if (!["NORTH AMERICA", "EUROPE"].includes(region))
      throw new Error("Unknown pricing region");
    regions.push(region);
    const rows = $(table).find(".table-v2-body [role=list] > [role=listitem]");
    if (!rows.length) throw new Error("CoreWeave pricing rows missing");
    rows.each((_, row) => {
      // Desktop cells occur once per row. Mobile markup repeats both model and prices.
      const cells = $(row)
        .find(".table-grid")
        .first()
        .children(".table-v2-cell");
      if (cells.length !== headers.length)
        throw new Error("CoreWeave row structure changed");
      const values = cells.map((_, cell) => text($(cell).text())).get();
      const name = text(cells.first().find(".table-model-name").first().text());
      if (!name) throw new Error("Missing GPU model");
      const identity = `${region}:${name}`;
      if (/^contact sales$/i.test(values[6])) {
        exclusions.push({ row: identity, reason: "quote_required" });
        return;
      }
      const count = number(values[1].replace(/\^1$/, ""));
      if (!Number.isInteger(count)) throw new Error("Non-integer GPU count");
      const nodePrice = dollars(values[6]);
      const vram = number(values[2]);
      // NVIDIA's HGX H100/H200 baseboards use SXM GPUs; retain all configuration names.
      const normalizedName = /HGX H(?:100|200)/i.test(name)
        ? `${name} SXM`
        : name;
      offers.push(
        offerSchema.parse({
          offerId: `coreweave:${region.toLowerCase().replaceAll(" ", "-")}:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${count}x:on-demand`,
          providerId: "coreweave",
          providerName: "CoreWeave",
          gpuModelId: gpuId(normalizedName, vram),
          gpuModelName: name,
          gpuCount: count,
          vramPerGpuGb: vram,
          vcpus: number(values[3]),
          ramGb: number(values[4]),
          region,
          pricePerGpuHr: nodePrice / count,
          totalNodePriceHr: nodePrice,
          availability: "unknown",
          providerLink: COREWEAVE_URL,
          sourceUrl: COREWEAVE_URL,
          cloudType: "on-demand",
          dataSource: "pricing_page",
          sourcePriceHr: nodePrice,
          priceBasis: "per_instance_hour",
          sourceSha256: hash(html),
          observedAt: at,
        })
      );
    });
  });
  if (regions.sort().join("|") !== "EUROPE|NORTH AMERICA")
    throw new Error("CoreWeave region coverage changed");
  return result(
    offers,
    exclusions,
    html,
    at,
    COREWEAVE_URL,
    "coreweave-html-1"
  );
}

export function parsePaperspace(html: string, at: string): SourceResult {
  const $ = load(html);
  requireCurrentPricing(
    text(
      $("body").clone().find("script, style, noscript").remove().end().text()
    )
  );
  const offers: GpuOffer[] = [];
  const exclusions: Exclusion[] = [];
  const prices = new Map<string, number>();
  function table(label: string) {
    const matches = $("table").filter(
      (_, node) => text($(node).find("thead th").first().text()) === label
    );
    if (matches.length !== 1)
      throw new Error("Paperspace pricing table missing or duplicated");
    if (
      matches
        .find("thead th")
        .map((_, cell) => text($(cell).text()))
        .get()
        .join("|") !== `${label}|Hourly Price|Subscription Plan`
    )
      throw new Error("Paperspace headers changed");
    return matches;
  }
  const single = table("GPU Machine");
  const multi = table("Multi-GPU Machine");
  const bodyText = text($("body").text());
  if (
    !bodyText.includes(
      "Pricing is calculated by multiplying the base rate of a single GPU by the number of GPUs"
    )
  )
    throw new Error("Multi-GPU price interpretation changed");
  function offer(name: string, count: number, nodePrice: number) {
    const base = name.replace(/\s*×\s*\d+$/, "");
    // Generic machine types do not establish physical GPU form factors or memory.
    const model =
      base === "A100-80G" ? "a100-80-unspecified" : gpuId(base, null);
    offers.push(
      offerSchema.parse({
        offerId: `paperspace:${base.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:${count}x:on-demand`,
        providerId: "paperspace",
        providerName: "Paperspace",
        gpuModelId: model,
        gpuModelName: base,
        gpuCount: count,
        vramPerGpuGb: null,
        vcpus: null,
        ramGb: null,
        region: "Not specified",
        pricePerGpuHr: nodePrice / count,
        totalNodePriceHr: nodePrice,
        availability: "unknown",
        providerLink: PAPERSPACE_URL,
        sourceUrl: PAPERSPACE_URL,
        cloudType: "on-demand",
        dataSource: "pricing_page",
        sourcePriceHr: nodePrice,
        priceBasis: "per_instance_hour",
        sourceSha256: hash(html),
        observedAt: at,
      })
    );
  }
  single.find("tbody tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length !== 3) throw new Error("Paperspace row structure changed");
    const name = text(cells.eq(0).text());
    const price = dollars(text(cells.eq(1).text()).replace(/\/hr$/, ""));
    if (!name || prices.has(name))
      throw new Error("Duplicate or missing machine name");
    prices.set(name, price);
    if (name.includes("/")) {
      exclusions.push({ row: name, reason: "ambiguous_model" });
      return;
    }
    offer(name, 1, price);
  });
  multi.find("tbody tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length !== 3) throw new Error("Paperspace row structure changed");
    const name = text(cells.eq(0).text());
    const match = /^(.+)\s+×(\d+)$/.exec(name);
    if (!match) throw new Error("Unknown multi-GPU machine format");
    const count = number(match[2]);
    if (!Number.isInteger(count)) throw new Error("Non-integer GPU count");
    const price = dollars(text(cells.eq(1).text()).replace(/\/hr$/, ""));
    const basePrice =
      prices.get(match[1]) ??
      (match[1] === "V100-32G" ? prices.get("V100 / V100-32G") : undefined);
    if (
      basePrice === undefined ||
      Math.abs(price - basePrice * count) > 0.00001
    ) {
      exclusions.push({ row: name, reason: "inconsistent_price" });
      return;
    }
    offer(name, count, price);
  });
  return result(
    offers,
    exclusions,
    html,
    at,
    PAPERSPACE_URL,
    "paperspace-html-1"
  );
}

export async function fetchPricingPage(
  id: string,
  url: string,
  at: string,
  parse: (html: string, at: string) => SourceResult
): Promise<SourceResult> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20_000),
    headers: {
      "User-Agent": "gpu-price-tracker/2.0 (public pricing collector)",
      Accept: "text/html",
    },
  });
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("text/html")
  )
    throw new Error("Pricing page HTTP failure");
  if (Number(response.headers.get("content-length")) > 2_000_000)
    throw new Error("Pricing page exceeds limit");
  if (!response.body) throw new Error("Pricing page has no body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new Error("Pricing page exceeds limit");
    }
    chunks.push(value);
  }
  const html = new TextDecoder("utf-8", { fatal: true }).decode(
    Buffer.concat(chunks)
  );
  // Only public HTML goes into short-lived source artifacts; never authenticated API bodies.
  await mkdir("work/provider-evidence", { recursive: true });
  await writeFile(`work/provider-evidence/${id}.html`, html);
  const evidence = {
    sourceUrl: url,
    retrievedAt: at,
    contentSha256: hash(html),
    parserVersion: `${id}-html-1`,
  };
  await writeFile(
    `work/provider-evidence/${id}.json`,
    JSON.stringify(evidence, null, 2) + "\n"
  );
  // Preserve rejected public pages too, so schema drift can be reproduced from the artifact.
  return parse(html, at);
}
export function publicPricingSources(): Source[] {
  return [
    {
      id: "coreweave",
      name: "CoreWeave",
      configured: true,
      connected: true,
      fetch: at =>
        fetchPricingPage("coreweave", COREWEAVE_URL, at, parseCoreweave),
    },
    {
      id: "paperspace",
      name: "Paperspace",
      configured: true,
      connected: true,
      fetch: at =>
        fetchPricingPage("paperspace", PAPERSPACE_URL, at, parsePaperspace),
    },
  ];
}
