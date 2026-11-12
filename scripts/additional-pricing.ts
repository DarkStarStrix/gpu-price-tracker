import { load } from "cheerio";
import { createHash } from "node:crypto";
import {
  offerSchema,
  type GpuOffer,
  type SourceResult,
} from "../shared/catalog";
import { gpuId } from "./gpu";
import { fetchPricingPage } from "./pricing-pages";
import type { Source } from "./providers";

const providers = {
  hotaisle: ["Hot Aisle", "https://hotaisle.xyz/pricing"],
  digitalocean: [
    "DigitalOcean",
    "https://docs.digitalocean.com/products/droplets/details/pricing/",
  ],
  civo: ["Civo", "https://www.civo.com/pricing"],
  jarvislabs: ["Jarvislabs", "https://jarvislabs.ai/pricing"],
  massedcompute: ["Massed Compute", "https://vm.massedcompute.com/pricing"],
  lambda: ["Lambda", "https://lambda.com/pricing"],
} as const;

type ProviderId = keyof typeof providers;
type Listing = {
  sku: string;
  model: string;
  displayName?: string;
  count: number;
  rate: number;
  basis?: NonNullable<GpuOffer["priceBasis"]>;
  billing?: NonNullable<GpuOffer["billingModel"]>;
  vram?: number;
  vcpus?: number;
  ram?: number;
  region?: string;
  cloud?: string;
};

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function usd(value: string, unit = ""): number {
  if (!value.endsWith(unit)) throw new Error("Unexpected price unit");
  const amount = value.slice(0, value.length - unit.length);
  const match = /^\$(\d+(?:\.\d+)?)$/.exec(amount);
  if (!match) throw new Error("Expected USD price");
  return Number(match[1]);
}

function quantity(value: string, unit: RegExp): number {
  const match = unit.exec(value);
  if (!match) throw new Error("Unexpected resource specification");
  return Number(match[1]);
}

function result(
  id: ProviderId,
  html: string,
  at: string,
  listings: Listing[]
): SourceResult {
  if (!listings.length) throw new Error("No verified GPU prices");
  const [name, url] = providers[id];
  const digest = createHash("sha256").update(html).digest("hex");
  const offers = listings.map(listing => {
    const billing = listing.billing ?? "on-demand";
    const basis = listing.basis ?? "per_instance_hour";
    const perGpu = basis === "per_gpu_hour";
    return offerSchema.parse({
      offerId: `${id}:${listing.sku}:${billing}`,
      providerId: id,
      providerName: name,
      gpuModelId: gpuId(listing.model, listing.vram ?? null),
      gpuModelName: listing.displayName ?? listing.model,
      gpuCount: listing.count,
      configurationKnown: true,
      billingModel: billing,
      vramPerGpuGb: listing.vram ?? null,
      vcpus: listing.vcpus ?? null,
      ramGb: listing.ram ?? null,
      region: listing.region ?? "Not specified",
      pricePerGpuHr: perGpu ? listing.rate : listing.rate / listing.count,
      totalNodePriceHr: perGpu ? listing.rate * listing.count : listing.rate,
      availability: "unknown",
      providerLink: url,
      sourceUrl: url,
      cloudType: listing.cloud ?? billing,
      dataSource: "pricing_page",
      sourcePriceHr: listing.rate,
      priceBasis: basis,
      sourceSha256: digest,
      observedAt: at,
    });
  });
  return {
    offers,
    evidence: {
      sourceUrl: url,
      retrievedAt: at,
      contentSha256: digest,
      parserVersion: `${id}-html-1`,
    },
  };
}

export function parseHotAisle(html: string, at: string): SourceResult {
  const $ = load(html);
  const plans = [
    { title: "Small", label: "VM", counts: "1x", sizes: [1], cloud: "vm" },
    {
      title: "Medium",
      label: "VM",
      counts: "2x & 4x",
      sizes: [2, 4],
      cloud: "vm",
    },
    {
      title: "Large",
      label: "Bare metal",
      counts: "8x",
      sizes: [8],
      cloud: "bare-metal",
    },
  ] as const;
  const listings = plans.flatMap(plan => {
    const heading = $("h2").filter((_, h) => clean($(h).text()) === plan.title);
    const size = heading.next("div").children("span");
    if (
      heading.length !== 1 ||
      clean(heading.prev("p").text()) !== plan.label ||
      size.length !== 2 ||
      clean(size.eq(0).text()) !== plan.counts ||
      clean(size.eq(1).text()).toUpperCase() !== "MI300X"
    )
      throw new Error("Hot Aisle plan structure changed");
    const rate = usd(clean(heading.next("div").next("p").text()), "/GPU/hr");
    return plan.sizes.map(count => ({
      sku: `mi300x-${plan.cloud}-${count}`,
      model: "AMD MI300X",
      count,
      rate,
      basis: "per_gpu_hour" as const,
      vram: 192,
      cloud: plan.cloud,
    }));
  });
  return result("hotaisle", html, at, listings);
}

export function parseDigitalOcean(html: string, at: string): SourceResult {
  const $ = load(html);
  const listings: Listing[] = [];
  for (const [billing, section] of [
    ["on-demand", "On-Demand GPU Droplet Pricing"],
    ["spot", "Spot GPU Droplet Pricing"],
  ] as const) {
    const heading = $("main h2").filter(
      (_, h) =>
        clean($(h).clone().children(".pill").remove().end().text()) === section
    );
    const table = heading.nextUntil("h2,h3").find("table");
    const headers = table
      .find("thead th")
      .map((_, h) => clean($(h).text()))
      .get();
    const rows = table.find("tbody tr");
    if (
      heading.length !== 1 ||
      table.length !== 1 ||
      headers.join("|") !== "GPU|Price" ||
      !rows.length
    )
      throw new Error("DigitalOcean GPU pricing table changed");
    rows.each((_, row) => {
      const cells = $(row).children("td");
      const label = clean(cells.eq(0).text());
      const gpu = /^((?:AMD|NVIDIA) [A-Za-z0-9 ,\-]+?)(?: \((\d+)x\))?$/.exec(
        label
      );
      if (cells.length !== 2 || !gpu) throw new Error("Unexpected Droplet SKU");
      const [, model, count = "1"] = gpu;
      listings.push({
        sku: `${slug(model)}-${count}`,
        model,
        count: Number(count),
        rate: usd(clean(cells.eq(1).text()), " per hour"),
        billing,
      });
    });
  }
  return result("digitalocean", html, at, listings);
}

export function parseCivo(html: string, at: string): SourceResult {
  const $ = load(html);
  const listings: Listing[] = [];
  $("section#nvidia-gpus table").each((_, element) => {
    const table = $(element);
    const group = table.closest("div[id]");
    const modelHeading = /^NVIDIA (.+) GPU pricing$/.exec(
      clean(group.find("h4").text())
    );
    const headers = table
      .find("thead th")
      .map((_, h) => clean($(h).text()))
      .get();
    const rows = table.find("tbody tr");
    if (
      !modelHeading ||
      headers.join("|") !==
        "Size|RAM|vCPU|Storage|Data Transfer|On-demand|Commitment" ||
      !rows.length
    )
      throw new Error("Civo GPU pricing table changed");
    rows.each((_, row) => {
      const cells = $(row).children("td");
      const sku = /^(\d+) x NVIDIA (\w+)(?: - (\d+)\s*GB(?: HBM3e)?)?$/.exec(
        clean(cells.eq(0).find(".product-detail").text())
      );
      const hourly = cells.eq(5).find('[data-option="hourly"]');
      const raw = clean(hourly.text());
      if (
        cells.length !== headers.length ||
        !sku ||
        hourly.length !== 1 ||
        modelHeading[1].split(" ")[0] !== sku[2]
      )
        throw new Error("Civo GPU plan changed");
      if (raw === "N/Aper hour") return;
      const ram = /^(\d+(?:\.\d+)?)\s*(GB|TB)$/.exec(clean(cells.eq(1).text()));
      if (!ram) throw new Error("Civo RAM unit changed");
      listings.push({
        sku: `${group.attr("id")}-${sku[1]}`,
        model: `NVIDIA ${modelHeading[1].replace(/ \d+GB$/, "")}`,
        count: Number(sku[1]),
        vram: sku[3] ? Number(sku[3]) : undefined,
        vcpus: quantity(clean(cells.eq(2).text()), /^(\d+)(?: cores)?$/),
        ram: Number(ram[1]) * (ram[2] === "TB" ? 1000 : 1),
        rate: usd(raw, "per hour"),
      });
    });
  });
  return result("civo", html, at, listings);
}

export function parseJarvislabs(html: string, at: string): SourceResult {
  const $ = load(html);
  const section = $("section#on_demand");
  const table = section.find('[role="table"]');
  const count = section.find('button[aria-pressed="true"]');
  const currency = $(
    'button[aria-label="Show prices in US Dollars"][aria-checked="true"]'
  );
  const headers = table
    .find('[role="columnheader"]')
    .map((_, h) => clean($(h).text()))
    .get();
  if (
    section.length !== 1 ||
    table.length !== 1 ||
    currency.length !== 1 ||
    count.length !== 1 ||
    clean(count.text()) !== "1×" ||
    headers.join("|") !== "GPU|VRAM|vCPUs|RAM|On-demand / hr|Spot / hr"
  )
    throw new Error("Jarvislabs pricing mode changed");
  const listings: Listing[] = [];
  table
    .find('[role="row"]')
    .has('[role="rowheader"]')
    .each((_, row) => {
      const cells = $(row).children('[role="cell"]');
      const model = clean($(row).children('[role="rowheader"]').text());
      if (!/^NVIDIA [A-Za-z0-9 ]+$/.test(model) || cells.length !== 5)
        throw new Error("Jarvislabs GPU plan changed");
      const config = {
        sku: `${slug(model)}-1`,
        model,
        count: 1,
        vram: quantity(clean(cells.eq(0).text()), /^(\d+)\s*GB$/),
        vcpus: quantity(clean(cells.eq(1).text()), /^(\d+)$/),
        ram: quantity(clean(cells.eq(2).text()), /^(\d+)\s*GB$/),
      };
      const spot = cells
        .eq(4)
        .find("span")
        .filter((_, span) => /^\$[\d.]+$/.test(clean($(span).text())));
      if (spot.length !== 1) throw new Error("Jarvislabs spot rate changed");
      listings.push(
        { ...config, rate: usd(clean(cells.eq(3).text())) },
        { ...config, rate: usd(clean(spot.text())), billing: "spot" }
      );
    });
  return result("jarvislabs", html, at, listings);
}

export function parseMassedCompute(html: string, at: string): SourceResult {
  const $ = load(html);
  const heading = $("main h2").filter(
    (_, h) => clean($(h).text()) === "On-Demand GPU Pricing"
  );
  if (heading.length !== 1)
    throw new Error("Massed Compute pricing section changed");
  const listings: Listing[] = [];
  $("main table").each((_, element) => {
    const table = $(element);
    const headers = table
      .find("thead th")
      .map((_, h) => clean($(h).text()))
      .get();
    if (headers.join("|") !== "Qty|vCPU|RAM|Storage|Price|")
      throw new Error("Massed Compute GPU table changed");
    const label = clean(
      table.parent().parent().children().first().children("span").first().text()
    );
    const rows = table.find("tbody tr");
    if (!/^(?:[ABHL]\d|DGX A\d|RTX )/.test(label) || !rows.length)
      throw new Error("Massed Compute GPU card changed");
    const vram = /\((\d+)GB\)/.exec(label)?.[1];
    const model = label
      .replace(/\s+\(\d+GB\)|\s+\[[^\]]+\]|\s+NVLink$/g, "")
      .replace(/\bSXM[456]\b/g, "SXM")
      .replace(/^DGX A100$/, "A100 SXM");
    rows.each((_, row) => {
      const cells = $(row).children("td");
      if (cells.length !== headers.length)
        throw new Error("Massed Compute GPU row changed");
      const count = quantity(clean(cells.eq(0).text()), /^×(\d+)$/);
      const raw = clean(cells.eq(4).text());
      if (raw === "Request" && clean(cells.eq(5).text()) === "Contact") return;
      listings.push({
        sku: `${slug(label)}-${count}`,
        model,
        displayName: label,
        count,
        vram: vram ? Number(vram) : undefined,
        vcpus: quantity(clean(cells.eq(1).text()), /^(\d+)$/),
        ram: quantity(clean(cells.eq(2).text()), /^(\d+)\s*GB$/),
        rate: usd(raw, "/hr"),
      });
    });
  });
  return result("massedcompute", html, at, listings);
}

export function parseLambda(html: string, at: string): SourceResult {
  const $ = load(html);
  const listings: Listing[] = [];
  const counts = new Set<number>();
  const effectiveCounts = new Set<number>();
  const skus = new Set<string>();
  const sizeLabel = /^([1-9]\d*)x$/;
  const tabs = new Map(
    $('[role="tab"][id]')
      .map((_, tab) => [[$(tab).attr("id"), clean($(tab).text())] as const])
      .get()
  );
  $("table").each((_, element) => {
    const table = $(element);
    const headers = table
      .find("thead th")
      .map((_, cell) => clean($(cell).text()))
      .get();
    if (headers.join("|") !== "Plan|VRAM/GPU|vCPUs|RAM|STORAGE|PRICE/GPU/HR*")
      return;
    const label = table.closest('[role="tabpanel"]').attr("aria-labelledby");
    const count = quantity(tabs.get(label) ?? "", sizeLabel);
    const rows = table.find("tbody tr");
    if (counts.has(count) || !rows.length)
      throw new Error("Invalid Lambda instance size table");
    counts.add(count);
    const footer = clean(table.next("p").text());
    if (/\b(?:take|takes) effect\b|\beffective (?:from|on)\b/i.test(footer)) {
      const date =
        /These prices take effect ([A-Za-z]+ \d{1,2}, \d{4}), at (\d{2}:\d{2}) UTC\./.exec(
          footer
        );
      const effectiveAt = date ? Date.parse(`${date[1]} ${date[2]} UTC`) : NaN;
      if (!Number.isFinite(effectiveAt))
        throw new Error("Unrecognized Lambda price effective date");
      if (Date.parse(at) >= effectiveAt) effectiveCounts.add(count);
    } else {
      effectiveCounts.add(count);
    }
    rows.each((_, row) => {
      const cells = $(row).children("th,td");
      const label = clean(cells.eq(0).text());
      if (cells.length !== headers.length || !label)
        throw new Error("Invalid Lambda instance row");
      // Lambda's instance documentation identifies these HGX models as SXM.
      const model = label.replace(/^NVIDIA HGX ([AH]100)$/, "NVIDIA $1 SXM");
      const vram = quantity(clean(cells.eq(1).text()), /^(\d+) GB$/);
      const sku = `${gpuId(model, vram)}-${count}`;
      if (skus.has(sku)) throw new Error("Duplicate Lambda instance SKU");
      skus.add(sku);
      listings.push({
        sku,
        model,
        count,
        vram,
        vcpus: quantity(clean(cells.eq(2).text()), /^(\d+)$/),
        ram: quantity(clean(cells.eq(3).text()), /^(\d+) GiB$/),
        rate: usd(clean(cells.eq(5).text())),
        basis: "per_gpu_hour",
      });
    });
  });
  if (
    [...tabs.values()].filter(label => sizeLabel.test(label)).length !==
    counts.size
  )
    throw new Error("Missing Lambda instance size table");
  const parsed = result("lambda", html, at, listings);
  return {
    ...parsed,
    offers: parsed.offers.filter(offer => effectiveCounts.has(offer.gpuCount)),
  };
}

export function additionalPricingSources(): Source[] {
  return (
    [
      ["hotaisle", parseHotAisle],
      ["digitalocean", parseDigitalOcean],
      ["civo", parseCivo],
      ["jarvislabs", parseJarvislabs],
      ["massedcompute", parseMassedCompute],
      ["lambda", parseLambda],
    ] as const
  ).map(([id, parse]) => {
    const [name, url] = providers[id];
    return {
      id,
      name,
      configured: true,
      connected: true,
      fetch: at => fetchPricingPage(id, url, at, parse),
    };
  });
}
