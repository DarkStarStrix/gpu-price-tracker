import { createHash } from "node:crypto";
import { load } from "cheerio";
import {
  addedProviders,
  type AddedProviderId,
} from "../shared/added-providers";
import type { GpuOffer, SourceResult } from "../shared/catalog";
import { fetchPricingPage } from "./pricing-pages";
import { providerOffer } from "./provider-offer";
import type { Source } from "./providers";

const pages = {
  thunder: "https://www.thundercompute.com/pricing",
  ovhcloud: "https://us.ovhcloud.com/public-cloud/prices/",
  canopy: "https://www.canopywave.com/pricing",
  latitude: "https://www.latitude.sh/pricing",
  denvr: "https://www.denvr.com/pricing",
  oblivus: "https://oblivus.com/pricing",
  gcp: "https://cloud.google.com/products/compute/pricing/accelerator-optimized",
  sixtytwo: "https://sixtytwo.ai/capacity",
} as const satisfies Partial<Record<AddedProviderId, string>>;
type CardId = keyof typeof pages;
const pageByteLimits: Partial<Record<CardId, number>> = {
  denvr: 4_000_000,
  gcp: 8_000_000,
};

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
function usd(text: string, pattern = /^\$(\d+(?:\.\d+)?)$/): number {
  const match = pattern.exec(text);
  if (!match) throw new Error("Expected USD hourly price");
  return Number(match[1]);
}
function gb(text: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(GB|TB)$/.exec(text);
  if (!match) throw new Error("Unexpected memory specification");
  return Number(match[1]) * (match[2] === "TB" ? 1000 : 1);
}

function pricingRows(html: string, matches: (headers: string) => boolean) {
  const $ = load(html);
  const rows: string[][] = [];
  $("table").each((_, table) => {
    const headers = $(table)
      .find("thead th")
      .map((_, h) => clean($(h).text()))
      .get()
      .join("|");
    if (!matches(headers)) return;
    $(table)
      .find("tbody tr")
      .each((_, row) => {
        rows.push(
          $(row)
            .children("td,th")
            .map((_, c) => clean($(c).text()))
            .get()
        );
      });
  });
  if (!rows.length) throw new Error("GPU pricing table changed");
  return rows;
}

function card(id: CardId, html: string, at: string) {
  const digest = createHash("sha256").update(html).digest("hex");
  const url = pages[id];
  return {
    offer: (
      model: string,
      config: Omit<Parameters<typeof providerOffer>[2], "url" | "at" | "digest">
    ) => providerOffer(id, model, { ...config, at, url, digest }),
    evidence: {
      sourceUrl: url,
      retrievedAt: at,
      contentSha256: digest,
      parserVersion: `${id}-html-1`,
    },
  };
}

export function parseThunder(html: string, at: string): SourceResult {
  const { offer, evidence } = card("thunder", html, at);
  const rows = pricingRows(
    html,
    h => h === "GPU|VRAM|vCPUs|RAM|Disk|Price|Action"
  );
  const offers = rows
    .filter(row => row[0] !== "Extra vCPU")
    .map(row => {
      const [model, vram, cpu, , , rate] = row;
      const included = /^(\d+) included · \d+ max$/.exec(cpu);
      if (row.length !== 7 || !included)
        throw new Error("Unexpected Thunder GPU plan");
      return offer(model, {
        id: model.toLowerCase().replace(/ +/g, "-"),
        count: 1,
        vram: gb(vram),
        vcpus: Number(included[1]),
        rate: usd(rate, /^\$(\d+(?:\.\d+)?)\/hr$/),
        basis: "per_instance_hour",
      });
    });
  if (!offers.length) throw new Error("Empty Thunder GPU catalog");
  return { offers, evidence };
}

export function parseSixtytwo(html: string, at: string): SourceResult {
  const { evidence } = card("sixtytwo", html, at);
  if (!/Prices per GPU-hour unless noted/i.test(load(html)("main").text()))
    throw new Error("Sixtytwo GPU rate units changed");

  const leaseRates = [
    ...pricingRows(html, h => h === "GPU|Quantity|Location|Term|Ready|Price"),
    ...pricingRows(
      html,
      h => h === "GPU|Quantity|Region|Price|Go-live|Term"
    ).map(([model, quantity, region, rate, ready, term]) => [
      model,
      quantity,
      region,
      term,
      ready,
      rate,
    ]),
  ].flatMap(([model, quantity, region, term, ready, rate]) => {
    if (
      !/^\$\d+(?:\.\d{1,4})?$/.test(rate) ||
      !/\b(?:months?|years?)\b/i.test(term)
    )
      return [];
    return [{ model, quantity, region, term, ready, pricePerGpuHr: usd(rate) }];
  });
  if (!leaseRates.length) throw new Error("No explicit Sixtytwo lease rates");
  return { offers: [], leaseRates, evidence };
}

export function parseOvh(html: string, at: string): SourceResult {
  const { offer, evidence } = card("ovhcloud", html, at);
  const rows = pricingRows(
    html,
    h =>
      h ===
      "Name|Memory|vCore|GPU|Storage|Public network|Private network|Price(excl. taxes/hour)|Price(excl. taxes/month)"
  );
  return {
    evidence,
    offers: rows.map(row => {
      const [id, ram, cpu, gpu, , , , rate] = row;
      const model = /^(\d+)x (.+) \((\d+) GB [^()]+\)$/.exec(gpu);
      if (row.length !== 9 || !model || !/^\d+$/.test(cpu))
        throw new Error("Unexpected OVHcloud GPU plan");
      return offer(model[2], {
        id,
        count: Number(model[1]),
        vram: Number(model[3]),
        vcpus: Number(cpu),
        ram: gb(ram),
        rate: usd(rate),
        basis: "per_instance_hour",
      });
    }),
  };
}

export function parseCanopy(html: string, at: string): SourceResult {
  const { offer, evidence } = card("canopy", html, at);
  const rows = pricingRows(
    html,
    h => h === "Instance Type|vCPUs|RAM|NVMe Storage|Public IP|Price/Hour/GPU"
  );
  const exclusions: NonNullable<SourceResult["exclusions"]> = [];
  const offers = rows.flatMap(row => {
    const [label, cpu, ram, , , rate] = row;
    if (rate === "Get Quote") {
      exclusions.push({ row: label, reason: "quote_required" });
      return [];
    }
    const model = /^(\d+)x NVIDIA (SXM\d?) ([A-Z0-9]+)$/.exec(label);
    if (row.length !== 6 || !model || !/^\d+$/.test(cpu))
      throw new Error("Unexpected Canopy Wave GPU plan");
    const name = `${model[3]} SXM`;
    return [
      offer(name, {
        id: `${name.toLowerCase().replace(" ", "-")}-${model[1]}`,
        count: Number(model[1]),
        vcpus: Number(cpu),
        ram: gb(ram),
        rate: usd(rate),
        basis: "per_gpu_hour",
      }),
    ];
  });
  if (!offers.length) throw new Error("Empty Canopy Wave GPU rate card");
  return { offers, evidence, exclusions };
}

export function parseLatitude(html: string, at: string): SourceResult {
  const { offer, evidence } = card("latitude", html, at);
  const $ = load(html);
  const table = $("table").filter(
    (_, t) =>
      $(t)
        .find("thead th")
        .map((_, h) => clean($(h).text()))
        .get()
        .join("|") ===
      "Plan|GPU|VRAM|Storage|Network20 TB free out / ∞ in|Locations|Starting At"
  );
  if (table.length !== 1) throw new Error("Latitude GPU rate table changed");
  const offers = table
    .find("tbody tr")
    .toArray()
    .map(row => {
      const cells = $(row).children("td");
      const id = clean(cells.eq(0).find("a span").first().text());
      const link = cells.eq(0).find("a").attr("href");
      const gpuCell = cells.eq(1).find("a > div").eq(1);
      const gpu = clean(
        gpuCell
          .find("div")
          .filter((_, e) => $(e).children().length === 0)
          .first()
          .text() || gpuCell.text()
      );
      const model = /^(\d+) x NVIDIA (?:HGX )?(.+)$/.exec(gpu);
      const vram = /(\d+) GB per GPU$/.exec(clean(cells.eq(2).text()));
      const hourly = clean(cells.eq(6).find("a span").first().text());
      if (
        cells.length !== 7 ||
        !/^[a-z0-9.]+$/.test(id) ||
        !link ||
        !/^\/pricing\/[a-z0-9-]+$/.test(link) ||
        !model ||
        !vram
      )
        throw new Error("Unexpected Latitude GPU plan");
      return offer(model[2].replace(/ \d+GB$/, ""), {
        id,
        link: new URL(link, pages.latitude).href,
        count: Number(model[1]),
        vram: Number(vram[1]),
        rate: usd(hourly, /^\$(\d+(?:\.\d+)?)\/hr$/),
        basis: "per_instance_hour",
        tier: "bare-metal",
      });
    });
  if (!offers.length) throw new Error("Empty Latitude GPU rate card");
  return { offers, evidence };
}

export function parseDenvr(html: string, at: string): SourceResult {
  const { offer, evidence } = card("denvr", html, at);
  const $ = load(html);
  const offers: GpuOffer[] = [];
  const ids = new Set<string>();
  $(".wixui-repeater__item").each((_, row) => {
    const cells = $(row)
      .find('[data-testid="richTextElement"]')
      .map((_, cell) => clean($(cell).text()))
      .get();
    const [model, count, vram, cpu, ram, , , rate] = cells;
    if (
      cells.length !== 8 ||
      !/^(?:NVIDIA|Intel|AMD) /.test(model) ||
      rate === "Reserved only" ||
      /\bMIG\b/.test(model)
    )
      return;
    const id = `${model.toLowerCase().replace(/ +/g, "-")}-${count}-${vram.replace(/ /g, "")}`;
    if (ids.has(id)) return;
    if (!/^\d+$/.test(count) || !/^\d+$/.test(cpu))
      throw new Error("Unexpected Denvr GPU configuration");
    offers.push(
      offer(model, {
        id,
        count: Number(count),
        vram: gb(vram),
        vcpus: Number(cpu),
        ram: gb(ram),
        rate: usd(rate, /^\$(\d+(?:\.\d+)?) \/ GPU$/),
        basis: "per_gpu_hour",
      })
    );
    ids.add(id);
  });
  if (!offers.length) throw new Error("Empty Denvr GPU rate card");
  return { offers, evidence };
}

export function parseOblivus(html: string, at: string): SourceResult {
  const { offer, evidence } = card("oblivus", html, at);
  const $ = load(html);
  const offers = [];
  for (const element of $("table").filter(
    (_, t) => clean($(t).find("th").first().text()) === "Specifications"
  )) {
    const table = $(element);
    const modal = table.closest(".modal-content");
    const name = clean(modal.find(".modal-title").first().text())
      .replace(/\s+\d+GB\b/, "")
      .replace(/SXM5/i, "SXM");
    const fields = new Map(
      table
        .find("tbody tr")
        .map((_, row) => {
          const cells = $(row).children("td");
          return [[clean(cells.eq(0).text()), cells.eq(1)] as const];
        })
        .get()
    );
    const meta = clean(fields.get("Meta")?.text() ?? "");
    const configs = fields.get("Configurations");
    const vram = /^(\d+)\s*GB\b/.exec(
      clean(fields.get("GPU Memory")?.text() ?? "")
    );
    const rates = modal.find("*").filter((_, e) =>
      $(e)
        .contents()
        .toArray()
        .some(c => c.type === "text" && /^On-Demand:/.test(clean(c.data)))
    );
    if (
      !/^[A-Z0-9_]+$/.test(meta) ||
      !configs?.length ||
      !vram ||
      rates.length !== 1
    )
      throw new Error("Unexpected Oblivus GPU plan");
    const rate = usd(clean(rates.text()), /^On-Demand: \$(\d+(?:\.\d+)?)\/hr$/);
    for (const config of configs.children("b")) {
      const label = clean($(config).text());
      const details = /^(\d+)x GPU - (\d+) vCPU - (\d+)GB RAM - /.exec(
        clean($(config).next("li").text())
      );
      if (!details || label !== `${meta}_x${details[1]}`)
        throw new Error("Unexpected Oblivus configuration");
      offers.push(
        offer(name, {
          id: label,
          count: Number(details[1]),
          vcpus: Number(details[2]),
          ram: Number(details[3]),
          vram: Number(vram[1]),
          rate,
          basis: "per_gpu_hour",
        })
      );
    }
  }
  if (!offers.length) throw new Error("Empty Oblivus GPU rate card");
  return { offers, evidence };
}

export function parseGoogleCloud(html: string, at: string): SourceResult {
  const { offer, evidence } = card("gcp", html, at);
  const $ = load(html);
  const offers = [];
  for (const element of $("table")) {
    const table = $(element);
    const headers = table
      .find("tr")
      .first()
      .children()
      .map((_, e) => clean($(e).text()))
      .get();
    if (headers.slice(0, 3).join("|") !== "Machine type|GPU|Components")
      continue;
    const onDemand = headers.findIndex(h => h.startsWith("Price (USD)*"));
    const spot = headers.indexOf("Current Spot pricing (USD)");
    if (onDemand < 0 || spot < 0)
      throw new Error("Google Cloud rate columns changed");
    for (const row of table.find("tr").slice(1)) {
      const cells = $(row).children("td");
      const id = clean(cells.eq(0).text());
      const model = clean(cells.eq(1).text()).replace(/^Nvidia /i, "");
      if (!model) continue;
      const hardware = [
        [/^a4-highgpu-/, "B200", "B200", 180],
        [/^a3-ultragpu-/, "H200", "H200 SXM", 141],
        [/^a3-(?:mega|high)gpu-/, "H100", "H100 SXM", 80],
        [/^a2-ultragpu-/, "A100", "A100 SXM", 80],
        [/^a2-(?:mega|high)gpu-/, "A100", "A100 SXM", 40],
        [
          /^g4-standard-/,
          "RTX PRO 6000",
          "RTX PRO 6000 Blackwell Server Edition",
          96,
        ],
        [/^g2-standard-/, "L4", "L4", 24],
      ] as const;
      const spec = hardware.find(
        ([prefix, gpu]) => prefix.test(id) && gpu === model
      );
      if (!spec) continue;
      const details = clean(cells.eq(2).text());
      const count = /GPUs?:\s*(\d+(?:\/\d+)?)/.exec(details);
      const cpu = /vCPUs?:\s*(\d+)/.exec(details);
      if (!count || !cpu) throw new Error("Google Cloud configuration changed");
      if (count[1].includes("/")) continue;
      for (const [column, billing] of [
        [onDemand, "on-demand"],
        [spot, "spot"],
      ] as const) {
        const text = clean(cells.eq(column).text());
        if (text === "N/A" || (billing === "spot" && text === `${id}-spot`))
          continue;
        offers.push(
          offer(spec[2], {
            id: `${id}:${billing}`,
            count: Number(count[1]),
            vram: spec[3],
            vcpus: Number(cpu[1]),
            rate: usd(text, /^\$(\d+(?:\.\d+)?)\s*\/\s*1 hour$/),
            billing,
            basis: "per_instance_hour",
          })
        );
      }
    }
  }
  if (!offers.length) throw new Error("Empty Google Cloud GPU rate card");
  return { offers, evidence };
}

export function providerRateCardSources(): Source[] {
  return (
    [
      ["thunder", parseThunder],
      ["ovhcloud", parseOvh],
      ["canopy", parseCanopy],
      ["latitude", parseLatitude],
      ["denvr", parseDenvr],
      ["oblivus", parseOblivus],
      ["gcp", parseGoogleCloud],
      ["sixtytwo", parseSixtytwo],
    ] as const
  ).map(([id, parse]) => ({
    id,
    name: addedProviders[id].name,
    configured: true,
    connected: true,
    fetch: at => fetchPricingPage(id, pages[id], at, parse, pageByteLimits[id]),
  }));
}
