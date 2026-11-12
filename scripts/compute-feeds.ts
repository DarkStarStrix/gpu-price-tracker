import { load } from "cheerio";
import { z } from "zod";
import {
  computeFeedSchema,
  type ComputeFeed,
  type ComputeRate,
} from "../shared/compute";
import { fetchPublicText } from "./http";

const spheronCpu =
  "https://app.spheron.ai/api/gpu-offers?computeType=cpu&limit=100&page=1";
const voltage = "https://voltagegpu.com/api/pricing/snapshot";
const googleTpu = "https://cloud.google.com/tpu/pricing";
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

async function json(url: string): Promise<unknown> {
  return JSON.parse(await fetchPublicText(url, "application/json"));
}

const computeSources = [
  {
    providerId: "spheron",
    providerName: "Spheron AI",
    url: spheronCpu,
    collect: async () => parseSpheronCpu(await json(spheronCpu)),
  },
  {
    providerId: "voltagegpu",
    providerName: "VoltageGPU",
    url: voltage,
    collect: async (at: string) => parseVoltageCompute(await json(voltage), at),
  },
  {
    providerId: "gcp",
    providerName: "Google Cloud",
    url: googleTpu,
    collect: async () =>
      parseCloudTpu(
        await fetchPublicText(googleTpu, "text/html", {}, 4_000_000)
      ),
  },
];

export function collectCompute(previous: ComputeFeed[], at: string) {
  return Promise.all(
    computeSources.map(async ({ collect, ...source }): Promise<ComputeFeed> => {
      try {
        return computeFeedSchema.parse({
          ...source,
          status: "ok",
          observedAt: at,
          rates: await collect(at),
        });
      } catch {
        const last = previous.find(
          feed => feed.providerId === source.providerId
        );
        return {
          ...source,
          status: "error",
          observedAt: last?.observedAt ?? null,
          rates: last?.rates ?? [],
        };
      }
    })
  );
}
