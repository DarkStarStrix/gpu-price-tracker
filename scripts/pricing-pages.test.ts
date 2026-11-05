import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "cheerio";
import {
  parseCoreweave,
  parsePaperspace,
  COREWEAVE_URL,
  publicPricingSources,
} from "./pricing-pages";
import { collect } from "./collect";
import { offerSchema, snapshotSchema } from "../shared/catalog";
import { gpuId } from "./gpu";
const at = "2026-11-05T16:38:00.000Z";
const later = "2026-11-05T17:38:00.000Z";
const core = readFileSync(
  new URL("./fixtures/coreweave.html", import.meta.url),
  "utf8"
);
const paper = readFileSync(
  new URL("./fixtures/paperspace.html", import.meta.url),
  "utf8"
);

describe("recorded first-party CoreWeave tables", () => {
  it("extracts 18 on-demand configurations once, preserving regions and node units", () => {
    const result = parseCoreweave(core, at);
    expect(result.offers).toHaveLength(18);
    expect(new Set(result.offers.map(o => o.offerId)).size).toBe(18);
    expect(result.exclusions).toHaveLength(6);
    const h100 = result.offers.find(
      o => o.gpuModelName === "NVIDIA HGX H100" && o.region === "NORTH AMERICA"
    )!;
    // Independent expected arithmetic from the recorded table: $49.24 for an eight-GPU node.
    expect(h100.gpuCount).toBe(8);
    expect(h100.sourcePriceHr).toBe(49.24);
    expect(h100.pricePerGpuHr).toBeCloseTo(6.155, 8);
    expect(h100.totalNodePriceHr).toBe(49.24);
    expect(h100.gpuModelId).toBe("h100-sxm");
    expect(h100.vramPerGpuGb).toBe(80);
    expect(h100.ramGb).toBe(2048);
    expect(h100.vcpus).toBe(128);
    expect(
      result.offers.every(
        o => o.availability === "unknown" && o.dataSource === "pricing_page"
      )
    ).toBe(true);
  });
  it("never confuses GB200/GB300 or GH200 with B200 or H200", () => {
    const result = parseCoreweave(core, at);
    expect(
      result.offers.find(o => o.gpuModelName === "NVIDIA GB200 NVL72")
        ?.gpuModelId
    ).toBe("gb200-nvl72");
    expect(
      result.offers.find(o => o.gpuModelName === "NVIDIA GH200")?.gpuModelId
    ).toBe("gh200");
    expect(gpuId("GB300 NVL72", 279)).not.toBe("b300");
  });
  it("does not publish spot, inference-only, CPU, contact-sales, or mobile duplicate prices", () => {
    const result = parseCoreweave(core, at);
    expect(result.offers.every(o => o.cloudType === "on-demand")).toBe(true);
    expect(
      result.offers.some(o => /B300|Standard Memory|GB300/.test(o.gpuModelName))
    ).toBe(false);
    expect(result.offers.some(o => o.totalNodePriceHr === 34.11)).toBe(false);
    expect(
      result.offers.some(o => o.totalNodePriceHr === 8.6 && o.gpuCount === 8)
    ).toBe(false);
  });
  it("rejects changed headers, removed regions, and unknown numeric formats", () => {
    expect(() =>
      parseCoreweave(
        core.replaceAll("On-Demand Price (Per Hour)", "Monthly price"),
        at
      )
    ).toThrow();
    const $ = load(core);
    $(".table-v2.gpu-pricing").eq(1).remove();
    expect(() => parseCoreweave($.html(), at)).toThrow();
    expect(() =>
      parseCoreweave(core.replace("$49.24", "€49.24"), at)
    ).toThrow();
  });
  it("rejects an empty/challenge page instead of clearing the previous catalog", () => {
    expect(() =>
      parseCoreweave("<html>Verify you are human</html>", at)
    ).toThrow();
    expect(() =>
      parseCoreweave(
        core + "<p>These prices take effect November 16, 2026.</p>",
        at
      )
    ).toThrow();
  });
});

describe("recorded first-party Paperspace tables", () => {
  it("extracts 15 usable single/multi-GPU rates with unknown specs and availability", () => {
    const result = parsePaperspace(paper, at);
    expect(result.offers).toHaveLength(15);
    const h100 = result.offers.filter(o => o.gpuModelName === "H100");
    expect(h100.map(o => o.gpuCount).sort((a, b) => a - b)).toEqual([1, 8]);
    expect(h100.every(o => o.pricePerGpuHr === 5.95)).toBe(true);
    expect(h100.find(o => o.gpuCount === 8)?.totalNodePriceHr).toBe(47.6);
    expect(
      h100.every(o => o.vramPerGpuGb === null && o.availability === "unknown")
    ).toBe(true);
    expect(result.offers.some(o => /^C\d|Free/.test(o.gpuModelName))).toBe(
      false
    );
  });
  it("excludes the ambiguous V100 row and the two contradictory multi-GPU rates", () => {
    const result = parsePaperspace(paper, at);
    expect(result.exclusions).toEqual([
      { row: "V100 / V100-32G", reason: "ambiguous_model" },
      { row: "V100-32G ×8", reason: "inconsistent_price" },
      { row: "A6000 ×8", reason: "inconsistent_price" },
    ]);
    expect(
      result.offers.some(o => o.gpuCount === 8 && o.gpuModelName === "A6000")
    ).toBe(false);
  });
  it("rejects missing tables, changed units, changed multiplication rule, and future-effective notices", () => {
    expect(() =>
      parsePaperspace(paper.replace("Multi-GPU Machine", "GPU Machine"), at)
    ).toThrow();
    expect(() =>
      parsePaperspace(paper.replace("$5.95/hr", "$5.95/month"), at)
    ).toThrow();
    expect(() =>
      parsePaperspace(
        paper.replace("multiplying the base rate", "discounting the rate"),
        at
      )
    ).toThrow();
    expect(() =>
      parsePaperspace(
        paper + "<p>These prices take effect November 16, 2026.</p>",
        at
      )
    ).toThrow();
  });
});

describe("evidence and recovery boundaries", () => {
  it("requires pricing-page provenance, unit consistency, and unknown availability", () => {
    const offer = parseCoreweave(core, at).offers[0];
    expect(() =>
      offerSchema.parse({ ...offer, sourceSha256: undefined })
    ).toThrow();
    expect(() =>
      offerSchema.parse({ ...offer, sourcePriceHr: offer.sourcePriceHr! * 2 })
    ).toThrow();
    expect(() =>
      offerSchema.parse({ ...offer, availability: "available" })
    ).toThrow();
  });
  it("preserves old version-one API snapshots without new metadata", () => {
    const offer = parseCoreweave(core, at).offers[0];
    const old = {
      ...offer,
      dataSource: "api",
      sourceSha256: undefined,
      sourcePriceHr: undefined,
      priceBasis: undefined,
    };
    expect(offerSchema.parse(old).dataSource).toBe("api");
  });
  it("carries accepted evidence and exclusions into the catalog and actual history", async () => {
    const parsed = parseCoreweave(core, at);
    const snapshot = await collect(
      null,
      [
        {
          id: "coreweave",
          name: "CoreWeave",
          configured: true,
          connected: true,
          fetch: async () => parsed,
        },
      ],
      at
    );
    expect(snapshot.sources[0].evidence?.contentSha256).toBe(
      parsed.evidence?.contentSha256
    );
    expect(snapshot.sources[0].exclusions).toHaveLength(6);
    expect(snapshot.history[0].sourceSha256).toBe(
      parsed.evidence?.contentSha256
    );
    expect(snapshot.history[0].dataSource).toBe("pricing_page");
    expect(() =>
      snapshotSchema.parse({
        ...snapshot,
        sources: [{ ...snapshot.sources[0], evidence: undefined }],
      })
    ).toThrow();
  });
  it("retains last verified prices and their original evidence after HTML drift", async () => {
    const first = await collect(
      null,
      [
        {
          id: "coreweave",
          name: "CoreWeave",
          configured: true,
          connected: true,
          fetch: async () => parseCoreweave(core, at),
        },
      ],
      at
    );
    const next = await collect(
      first,
      [
        {
          id: "coreweave",
          name: "CoreWeave",
          configured: true,
          connected: true,
          fetch: async () => parseCoreweave("challenge", later),
        },
      ],
      later
    );
    expect(next.sources[0].status).toBe("error");
    expect(next.sources[0].evidence).toEqual(first.sources[0].evidence);
    expect(next.offers).toEqual(first.offers);
    expect(next.history).toEqual(first.history);
  });
  it("rejects mismatched evidence before replacing the provider catalog", async () => {
    const parsed = parseCoreweave(core, at);
    const next = await collect(
      null,
      [
        {
          id: "coreweave",
          name: "CoreWeave",
          configured: true,
          connected: true,
          fetch: async () => ({
            ...parsed,
            evidence: {
              ...parsed.evidence!,
              sourceUrl: COREWEAVE_URL,
              contentSha256: "0".repeat(64),
            },
          }),
        },
      ],
      at
    );
    expect(next.sources[0].status).toBe("error");
    expect(next.offers).toEqual([]);
  });
});

describe("public HTTP boundary", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("rejects HTTP errors before parsing or archiving a catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("denied", { status: 403 }))
    );
    await expect(publicPricingSources()[0].fetch(at)).rejects.toThrow(
      "HTTP failure"
    );
  });
  it("rejects a successful response with a non-HTML content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          headers: { "Content-Type": "application/json" },
        })
      )
    );
    await expect(publicPricingSources()[0].fetch(at)).rejects.toThrow(
      "HTTP failure"
    );
  });
  it("bounds streamed response size even without a content-length header", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("x".repeat(2_000_001), {
          headers: { "Content-Type": "text/html" },
        })
      )
    );
    await expect(publicPricingSources()[0].fetch(at)).rejects.toThrow(
      "exceeds limit"
    );
  });
  it("rejects declared oversized bodies before reading them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("x", {
          headers: {
            "Content-Type": "text/html",
            "Content-Length": "2000001",
          },
        })
      )
    );
    await expect(publicPricingSources()[0].fetch(at)).rejects.toThrow(
      "exceeds limit"
    );
  });
});
