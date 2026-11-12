import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  parseCivo,
  parseDigitalOcean,
  parseHotAisle,
  parseJarvislabs,
  parseLambda,
  parseMassedCompute,
} from "./additional-pricing";
import { collect } from "./collect";
import { sources } from "./providers";
import { filterPool } from "../shared/offer-view";

const at = "2026-11-11T23:00:00.000Z";
const fixture = (id: string) =>
  readFileSync(new URL(`./fixtures/${id}.html`, import.meta.url), "utf8");

it("reads Lambda's instance size tabs and skips separate reserved cluster rates", () => {
  const { offers } = parseLambda(fixture("lambda"), at);
  expect(offers.map(offer => offer.gpuCount)).toEqual([8, 4, 2, 1]);
  expect(offers[0]).toMatchObject({
    offerId: "lambda:h100-sxm-8:on-demand",
    pricePerGpuHr: 4.59,
    totalNodePriceHr: 36.72,
    priceBasis: "per_gpu_hour",
    vramPerGpuGb: 80,
    vcpus: 208,
    ramGb: 1800,
    availability: "unknown",
  });
  expect(offers.slice(1).every(offer => offer.gpuModelId === "b200-sxm")).toBe(
    true
  );
});

it("rejects a Lambda page with a missing or mislabeled size table", () => {
  const html = fixture("lambda");
  expect(() =>
    parseLambda(
      html.replace('aria-labelledby="size-0"', 'aria-labelledby="missing"'),
      at
    )
  ).toThrow();
  expect(() => parseLambda(html.replace("VRAM/GPU", "VRAM"), at)).toThrow(
    "Missing Lambda instance size table"
  );
});

it("publishes Lambda rates only once the provider's effective time is reached", () => {
  const notice =
    "<p>These prices take effect November 16, 2026, at 00:00 UTC.</p>";
  const html = fixture("lambda").replaceAll(
    "</table>\n</div>",
    `</table>${notice}\n</div>`
  );
  expect(parseLambda(html, at).offers).toEqual([]);
  expect(parseLambda(html, "2026-11-16T00:00:00.000Z").offers).toHaveLength(4);
  expect(() =>
    parseLambda(html.replaceAll("November 16, 2026", "soon"), at)
  ).toThrow("Unrecognized Lambda price effective date");
});

it("keeps Hot Aisle VM and bare-metal counts and multiplies the per-GPU rate once", () => {
  const html = fixture("hotaisle");
  const { offers } = parseHotAisle(html, at);
  expect(
    offers.map(o => [
      o.cloudType,
      o.gpuCount,
      o.pricePerGpuHr,
      o.totalNodePriceHr,
    ])
  ).toEqual([
    ["vm", 1, 2.99, 2.99],
    ["vm", 2, 2.99, 5.98],
    ["vm", 4, 2.99, 11.96],
    ["bare-metal", 8, 3.39, 27.12],
  ]);
  expect(
    offers.every(o => o.gpuModelId === "mi300x" && o.vramPerGpuGb === 192)
  ).toBe(true);
  expect(() =>
    parseHotAisle(html.replace("2x &amp; 4x", "4x &amp; 8x"), at)
  ).toThrow();
});

it("reads DigitalOcean on-demand and spot hourly tables and skips the contract table", () => {
  const html = fixture("digitalocean");
  const { offers } = parseDigitalOcean(html, at);
  expect(
    offers.map(o => [
      o.billingModel,
      o.gpuCount,
      o.totalNodePriceHr,
      o.pricePerGpuHr,
    ])
  ).toEqual([
    ["on-demand", 1, 2.59, 2.59],
    ["on-demand", 8, 20.72, 2.59],
    ["spot", 1, 3, 3],
    ["spot", 8, 24, 3],
  ]);
  expect(() =>
    parseDigitalOcean(html.replace("$20.72 per hour", "$20.72 per month"), at)
  ).toThrow();
});

it("takes Civo's on-demand hourly cell and skips commitment-only plans", () => {
  const html = fixture("civo");
  const { offers } = parseCivo(html, at);
  expect(offers).toHaveLength(2);
  expect(offers[1]).toMatchObject({
    gpuModelId: "h100-sxm",
    gpuCount: 8,
    pricePerGpuHr: 2.99,
    totalNodePriceHr: 23.92,
    priceBasis: "per_instance_hour",
  });
  expect(() =>
    parseCivo(html.replace(">On-demand<", ">Commitment<"), at)
  ).toThrow();
});

it("keeps Jarvislabs spot rates separate and requires the USD single-GPU view", () => {
  const html = fixture("jarvislabs");
  const { offers } = parseJarvislabs(html, at);
  expect(
    offers.map(o => [o.billingModel, o.gpuModelId, o.pricePerGpuHr])
  ).toEqual([
    ["on-demand", "h100-sxm", 3.49],
    ["spot", "h100-sxm", 1.54],
  ]);
  expect(() =>
    parseJarvislabs(
      html.replace('aria-checked="true"', 'aria-checked="false"'),
      at
    )
  ).toThrow();
  expect(() =>
    parseJarvislabs(html.replace("1<!-- -->×", "2<!-- -->×"), at)
  ).toThrow();
});

it("keeps Massed Compute model variants and divides published full-node rates", () => {
  const html = fixture("massedcompute");
  const { offers } = parseMassedCompute(html, at);
  expect(offers).toHaveLength(6);
  expect(
    offers.find(o => o.gpuModelId === "h100-sxm" && o.gpuCount === 8)
  ).toMatchObject({
    pricePerGpuHr: 3.14,
    totalNodePriceHr: 25.12,
  });
  expect(offers.some(o => o.gpuModelId === "h100-unspecified")).toBe(true);
  expect(
    offers.some(o => o.gpuModelId === "h100-unspecified" && o.gpuCount === 8)
  ).toBe(false);
  expect(() =>
    parseMassedCompute(
      html.replace("<td>$52.80<small>/hr", "<td>$52.80<small>/mo"),
      at
    )
  ).toThrow();
});

it("collects provenance and history for all five sources and retains observations on parser failure", async () => {
  const parsers = {
    hotaisle: parseHotAisle,
    digitalocean: parseDigitalOcean,
    civo: parseCivo,
    jarvislabs: parseJarvislabs,
    massedcompute: parseMassedCompute,
  };
  const adapters = sources().flatMap(source => {
    const id = source.id as keyof typeof parsers;
    return Object.hasOwn(parsers, id)
      ? [
          {
            ...source,
            fetch: async (time: string) => parsers[id](fixture(id), time),
          },
        ]
      : [];
  });
  const snapshot = await collect(null, adapters, at);
  expect(snapshot.sources).toHaveLength(5);
  expect(
    snapshot.sources.every(
      s => s.status === "ok" && s.evidence?.retrievedAt === at
    )
  ).toBe(true);
  expect(snapshot.history).toHaveLength(snapshot.offers.length);
  expect(snapshot.offers.every(o => o.availability === "unknown")).toBe(true);
  expect(
    filterPool(snapshot, "hotaisle", {
      gpu: "",
      billing: "",
      cloud: "bare-metal",
      availability: "",
      region: "",
    })
  ).toHaveLength(1);

  const later = "2026-11-11T23:15:00.000Z";
  const failed = await collect(
    snapshot,
    adapters.map(source =>
      source.id === "hotaisle"
        ? {
            ...source,
            fetch: async () => parseHotAisle("<main></main>", later),
          }
        : source
    ),
    later
  );
  expect(failed.sources.find(s => s.id === "hotaisle")).toMatchObject({
    status: "error",
    lastSuccessAt: at,
  });
  expect(failed.offers.filter(o => o.providerId === "hotaisle")).toEqual(
    snapshot.offers.filter(o => o.providerId === "hotaisle")
  );
  expect(failed.history.filter(o => o.providerId === "hotaisle")).toHaveLength(
    4
  );
});
