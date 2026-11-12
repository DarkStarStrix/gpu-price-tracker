import { load } from "cheerio";
import { z } from "zod";
import {
  computeFeedSchema,
  type ComputeFeed,
  type ComputeRate,
} from "../shared/compute";
import { fetchPublicText } from "./http";
import { linode, readLinodePlans } from "./provider-feeds";

const spheronCpu =
  "https://app.spheron.ai/api/gpu-offers?computeType=cpu&limit=100&page=1";
const voltage = "https://voltagegpu.com/api/pricing/snapshot";
const googleTpu = "https://cloud.google.com/tpu/pricing";
const droplets = "https://www.digitalocean.com/pricing/droplets";
const e2b = "https://e2b.dev/pricing";
const daytona = "https://www.daytona.io/pricing";
const modal = "https://modal.com/pricing";
const positive = z.number().positive();
const integer = z.number().int().positive();
const text = z.string().min(1);

const cpuCatalog = z.object({
  page: z.literal(1),
  totalPages: z.literal(1),
  total: z.literal(1),
  data: z.tuple([
    z.object({
      offers: z.array(
        z.object({
          provider: text,
          offerId: text,
          name: text,
          gpuCount: z.literal(0),
          vcpus: integer,
          memory: positive,
          storage: positive,
          price: positive,
          available: z.boolean(),
          maintenance: z.boolean(),
          instanceType: z.enum(["SPOT", "DEDICATED"]),
          clusters: z.array(text),
        })
      ),
    }),
  ]),
});

export function parseSpheronCpu(data: unknown): ComputeRate[] {
  return cpuCatalog.parse(data).data[0].offers.map(row => ({
    id: `${row.provider}:${row.offerId}`,
    model: row.name.replace(/^0x\s+/i, ""),
    kind: "cpu",
    region: row.clusters.join(" · ") || undefined,
    billing: row.instanceType === "SPOT" ? "spot" : "on-demand",
    price: row.price,
    vcpus: row.vcpus,
    memoryGb: row.memory,
    storageGb: row.storage,
    availability:
      row.available && !row.maintenance ? "available" : "unavailable",
  }));
}

const voltageSize = z.object({
  resourceName: text,
  vcpu: integer,
  memoryGb: positive,
  pricePerHour: positive,
  available: z.number().int().nonnegative(),
});
const voltageCpu = z.object({
  meta: z.object({
    updatedAt: z.iso.datetime({ offset: true }),
    stale: z.literal(false),
    scope: z.literal("rentable"),
  }),
  confidentialCpu: z.array(voltageSize.extend({ displayName: text })),
  sandboxes: z.object({
    templates: z.array(voltageSize.extend({ name: text, diskGb: positive })),
  }),
});

export function parseVoltageCompute(data: unknown, at: string): ComputeRate[] {
  const { meta, confidentialCpu, sandboxes } = voltageCpu.parse(data);
  const age = Date.parse(at) - Date.parse(meta.updatedAt);
  if (age > 1_200_000 || age < -120_000)
    throw new Error("Stale VoltageGPU compute data");
  return [
    ...confidentialCpu.map(row => ({
      ...row,
      model: row.displayName,
      kind: "cpu" as const,
      storageGb: undefined,
    })),
    ...sandboxes.templates.map(row => ({
      ...row,
      model: `${row.name} sandbox`,
      kind: "sandbox" as const,
      storageGb: row.diskGb,
    })),
  ].map(row => ({
    id: row.resourceName,
    kind: row.kind,
    model: row.model,
    billing: "on-demand",
    price: row.pricePerHour,
    vcpus: row.vcpu,
    memoryGb: row.memoryGb,
    storageGb: row.storageGb,
    availability: row.available ? "available" : "unavailable",
    providerLink:
      row.kind === "sandbox"
        ? "https://voltagegpu.com/sandboxes"
        : "https://voltagegpu.com/confidential-compute",
  }));
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();

export function parseCloudTpu(html: string): ComputeRate[] {
  const $ = load(html);
  const table = $("table").filter((_, element) => {
    const cells = $(element).find("tr").first().children();
    return (
      /^Cloud TPU Version\s*\(per chip-hour\)$/i.test(
        clean(cells.first().text())
      ) && /^On Demand \(USD\)/i.test(clean(cells.eq(3).text()))
    );
  });
  if (
    table.length !== 1 ||
    !table.parent().parent().find('[aria-label="Hourly"][aria-checked="true"]')
      .length
  )
    throw new Error("Google Cloud TPU hourly pricing table changed");
  const rates: ComputeRate[] = [];
  let model = "";
  table
    .find("tr")
    .slice(1)
    .each((_, row) => {
      const fields = $(row)
        .children()
        .map((_, cell) => clean($(cell).text()))
        .get();
      if (fields.length === 8) model = fields.shift()!;
      if (
        fields.length !== 7 ||
        !model ||
        !/^[a-z]+(?:-[a-z]+)+\d+$/.test(fields[0])
      )
        throw new Error("Google Cloud TPU regional row changed");
      const [region, location, priceText] = fields;
      const price = /^\$(\d+(?:\.\d+)?)$/.exec(priceText);
      if (!price) throw new Error("Invalid Google Cloud TPU rate");
      rates.push({
        id: `${model}:${region}`,
        kind: "tpu",
        model,
        region: `${location} · ${region}`,
        billing: "on-demand",
        price: Number(price[1]),
        availability: "unknown",
      });
    });
  if (!rates.length) throw new Error("Empty Google Cloud TPU catalog");
  return rates;
}

export function parseLinodeCpu(data: unknown): ComputeRate[] {
  return readLinodePlans(data)
    .filter(plan => plan.gpus === 0 && plan.accelerated_devices === 0)
    .map(plan => ({
      id: plan.id,
      kind: "cpu",
      model: plan.label,
      billing: "on-demand",
      price: plan.price.hourly,
      vcpus: plan.vcpus,
      memoryGb: plan.memory / 1024,
      storageGb: plan.disk === undefined ? undefined : plan.disk / 1024,
      availability: "unknown",
      terms: "Base USD plan rate. Regional prices may differ.",
    }));
}

function sizeInGiB(value: string) {
  const match = /^(\d[\d,.]*) (MiB|GiB|TiB)$/.exec(value);
  if (!match) throw new Error("Unrecognized instance size");
  return (
    Number(match[1].replaceAll(",", "")) *
    (match[2] === "MiB" ? 1 / 1024 : match[2] === "TiB" ? 1024 : 1)
  );
}

export function parseDroplets(html: string): ComputeRate[] {
  const $ = load(html);
  $("style, script").remove();
  const rates: ComputeRate[] = [];
  $("table").each((_, table) => {
    const rows = $(table).find("tr");
    const cells = (row: (typeof rows)[number]) =>
      $(row)
        .children()
        .map((_, cell) => clean($(cell).text()))
        .get();
    const headers = cells(rows[0]);
    if (
      headers[0] !== "Memory" ||
      headers[1] !== "vCPU" ||
      !headers.includes("SSD") ||
      !headers.includes("$/hr")
    )
      return;
    const section = $(table).parent().parent().parent();
    const family = clean(section.find("h2,h3,h4").first().text());
    const variant = clean(section.find("button").first().text());
    if (!family.endsWith(" Droplets") || variant !== "Regular")
      throw new Error("DigitalOcean Droplet family changed");
    rows.slice(1).each((_, row) => {
      const fields = cells(row);
      if (fields.length !== headers.length)
        throw new Error("Incomplete Droplet rate");
      const memoryGb = sizeInGiB(fields[0]);
      const vcpu = /^(\d+) vCPUs?$/.exec(fields[1]);
      const storageGb = sizeInGiB(fields[headers.indexOf("SSD")]);
      const variant = fields[headers.indexOf("SSD Variant")] ?? "";
      if (variant && !/^\d+x$/.test(variant))
        throw new Error("Unrecognized SSD variant");
      const rate = /^\$(\d+\.\d+)$/.exec(fields[headers.indexOf("$/hr")]);
      if (!vcpu || !rate) throw new Error("DigitalOcean hourly rate changed");
      rates.push({
        id: `${family}:${fields[1]}:${fields[0]}:${variant}:${storageGb}`,
        kind: "cpu",
        model: `${family} · ${fields[0]} / ${fields[1]} / ${storageGb} GiB SSD`,
        billing: "on-demand",
        price: Number(rate[1]),
        vcpus: Number(vcpu[1]),
        memoryGb,
        storageGb,
        availability: "unknown",
      });
    });
  });
  if (!rates.length) throw new Error("Empty DigitalOcean CPU catalog");
  return rates;
}

function sandboxRates(
  cpu: number,
  memory: number,
  terms: string,
  sizes: readonly (readonly [vcpus: number, memoryGb: number])[]
): ComputeRate[] {
  return sizes.map(([vcpus, memoryGb]) => ({
    id: `${vcpus}vcpu:${memoryGb}gib`,
    kind: "sandbox",
    model: `${vcpus} vCPU / ${memoryGb} GiB sandbox`,
    billing: "on-demand",
    price: Number((vcpus * cpu + memoryGb * memory).toFixed(8)),
    vcpus,
    memoryGb,
    availability: "unknown",
    terms,
  }));
}

export function parseE2b(html: string): ComputeRate[] {
  const $ = load(html);
  function rate(label: string) {
    const row = $("table")
      .filter((_, table) => {
        const headers = $(table).find("tr").first().children();
        return (
          clean(headers.first().text()) === label &&
          clean(headers.last().text()) === "Costs"
        );
      })
      .find("tr")
      .eq(1)
      .children();
    const price = /^\$(0\.\d+)\/s$/.exec(clean(row.last().text()));
    if (
      row.length !== 3 ||
      clean(row.first().text()) !== "1" ||
      clean(row.eq(1).text()) !== "Hobby / Pro" ||
      !price
    )
      throw new Error("E2B sandbox unit rate changed");
    return Number(price[1]) * 3600;
  }
  return sandboxRates(
    rate("vCPUs"),
    rate("Memory (GiB)"),
    "Default CPU and RAM. Billed per second. Usage only; paid plans add a subscription.",
    [[2, 4]]
  );
}

function pageText(html: string) {
  const $ = load(html);
  $("script,style").remove();
  return clean($("body").text());
}

export function parseDaytona(html: string): ComputeRate[] {
  const rates = /ComputevCPU\$(0\.\d+)\/hMemoryGiB\$(0\.\d+)\/h/.exec(
    pageText(html)
  );
  if (!rates) throw new Error("Daytona sandbox unit rates changed");
  return sandboxRates(
    Number(rates[1]),
    Number(rates[2]),
    "Linux CPU and memory estimate. Billed per second. Extra storage is billed separately.",
    [
      [1, 1],
      [2, 4],
      [4, 8],
    ]
  );
}

export function parseModal(html: string): ComputeRate[] {
  const body = pageText(html);
  const start = body.indexOf("Modal Sandbox pricing");
  const end = body.indexOf("Why serverless?", start);
  if (start < 0 || end < 0)
    throw new Error("Modal sandbox rates section changed");
  const section = body.slice(start, end);
  const cpu =
    /Physical core \(2 vCPU equivalent\) \$0\.\d+ (0\.\d+) \/ core \/ sec/.exec(
      section
    );
  const memory =
    /Memory \(non-preemptible\) \$0\.\d+ (0\.\d+) \/ GiB \/ sec/.exec(section);
  if (!cpu || !memory) throw new Error("Modal sandbox unit rates changed");
  return sandboxRates(
    Number(cpu[1]) * 1800,
    Number(memory[1]) * 3600,
    "Non-preemptible CPU and memory, billed per second at the higher of requested or actual usage. 2 vCPUs represent 1 physical core.",
    [
      [1, 1],
      [2, 4],
      [4, 8],
    ]
  );
}

const html = (url: string) => fetchPublicText(url, "text/html", {}, 4_000_000);

async function json(url: string): Promise<unknown> {
  return JSON.parse(await fetchPublicText(url, "application/json"));
}

const computeSources = [
  {
    providerId: "spheron",
    providerName: "Spheron AI",
    url: spheronCpu,
    providerLink: "https://app.spheron.ai/",
    dataSource: "api",
    kinds: ["cpu"],
    collect: async () => parseSpheronCpu(await json(spheronCpu)),
  },
  {
    providerId: "voltagegpu",
    providerName: "VoltageGPU",
    url: voltage,
    providerLink: "https://voltagegpu.com/pricing",
    dataSource: "api",
    kinds: ["cpu", "sandbox"],
    collect: async (at: string) => parseVoltageCompute(await json(voltage), at),
  },
  {
    providerId: "gcp",
    providerName: "Google Cloud",
    url: googleTpu,
    dataSource: "pricing_page",
    kinds: ["tpu"],
    collect: async () =>
      parseCloudTpu(
        await fetchPublicText(googleTpu, "text/html", {}, 4_000_000)
      ),
  },
  {
    providerId: "linode",
    providerName: "Akamai Cloud",
    url: linode,
    providerLink: "https://www.akamai.com/cloud/pricing",
    dataSource: "api",
    kinds: ["cpu"],
    collect: async () => parseLinodeCpu(await json(linode)),
  },
  ...[
    {
      providerId: "digitalocean",
      providerName: "DigitalOcean",
      url: droplets,
      kind: "cpu",
      parse: parseDroplets,
    },
    {
      providerId: "e2b",
      providerName: "E2B",
      url: e2b,
      kind: "sandbox",
      parse: parseE2b,
    },
    {
      providerId: "daytona",
      providerName: "Daytona",
      url: daytona,
      kind: "sandbox",
      parse: parseDaytona,
    },
    {
      providerId: "modal",
      providerName: "Modal",
      url: modal,
      kind: "sandbox",
      parse: parseModal,
    },
  ].map(({ parse, kind, ...source }) => ({
    ...source,
    dataSource: "pricing_page",
    kinds: [kind],
    collect: async () => parse(await html(source.url)),
  })),
];

export function collectCompute(previous: ComputeFeed[], at: string) {
  return Promise.all(
    computeSources.map(async ({ collect, ...source }): Promise<ComputeFeed> => {
      try {
        const rates = await collect(at);
        if (!rates.length) throw new Error("Empty compute catalog");
        return computeFeedSchema.parse({
          ...source,
          status: "ok",
          observedAt: at,
          rates,
        });
      } catch {
        const last = previous.find(
          feed => feed.providerId === source.providerId
        );
        return computeFeedSchema.parse({
          ...source,
          status: "error",
          observedAt: last?.observedAt ?? null,
          rates: last?.rates ?? [],
        });
      }
    })
  );
}
