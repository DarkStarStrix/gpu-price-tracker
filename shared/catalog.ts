import { z } from "zod/mini";

const timestamp = z.iso.datetime();
const positive = z.number().check(z.positive());
const nonempty = z.string().check(z.minLength(1));
const httpsUrl = z.url().check(z.startsWith("https://"));
const sha256 = z.string().check(z.regex(/^[a-f0-9]{64}$/));
const count = z.int().check(z.nonnegative());
export const offerSchema = z
  .object({
    offerId: nonempty,
    providerId: nonempty,
    providerName: nonempty,
    gpuModelId: nonempty,
    gpuModelName: nonempty,
    gpuCount: z.int().check(z.positive()),
    configurationKnown: z.optional(z.boolean()),
    billingModel: z.optional(z.enum(["on-demand", "spot"])),
    vramPerGpuGb: z.nullable(positive),
    vcpus: z.nullable(positive),
    ramGb: z.nullable(positive),
    region: z.string(),
    pricePerGpuHr: positive,
    totalNodePriceHr: positive,
    availability: z.enum(["available", "limited", "unavailable", "unknown"]),
    providerLink: httpsUrl,
    sourceUrl: httpsUrl,
    cloudType: z.string(),
    dataSource: z.enum(["api", "pricing_page"]),
    sourcePriceHr: z.optional(positive),
    priceBasis: z.optional(z.enum(["per_gpu_hour", "per_instance_hour"])),
    sourceSha256: z.optional(sha256),
    observedAt: timestamp,
  })
  .check(
    z.refine(
      o =>
        Math.abs(o.pricePerGpuHr * o.gpuCount - o.totalNodePriceHr) < 0.00001,
      { message: "Per-GPU and node price must agree" }
    )
  )
  .check(
    z.superRefine((offer, ctx) => {
      if (offer.dataSource === "pricing_page") {
        if (offer.availability !== "unknown")
          ctx.addIssue({
            code: "custom",
            message: "A pricing page cannot establish availability",
          });
        if (!offer.sourcePriceHr || !offer.priceBasis || !offer.sourceSha256)
          ctx.addIssue({
            code: "custom",
            message: "Pricing-page provenance is required",
          });
      }
      if (offer.sourcePriceHr !== undefined && offer.priceBasis) {
        const expected =
          offer.priceBasis === "per_instance_hour"
            ? offer.totalNodePriceHr
            : offer.pricePerGpuHr;
        if (Math.abs(expected - offer.sourcePriceHr) > 0.00001)
          ctx.addIssue({
            code: "custom",
            message: "Raw price basis does not agree with normalized price",
          });
      }
    })
  );
export type GpuOffer = z.infer<typeof offerSchema>;
export const evidenceSchema = z.object({
  sourceUrl: httpsUrl,
  retrievedAt: timestamp,
  contentSha256: sha256,
  parserVersion: nonempty,
});
export const exclusionSchema = z.object({
  row: z.string().check(z.minLength(1), z.maxLength(256)),
  reason: z.enum(["quote_required", "inconsistent_price", "ambiguous_model"]),
});
export type SourceEvidence = z.infer<typeof evidenceSchema>;
export type Exclusion = z.infer<typeof exclusionSchema>;
export interface SourceResult {
  offers: GpuOffer[];
  evidence?: SourceEvidence;
  exclusions?: Exclusion[];
  history?: z.infer<typeof historySchema>[];
}
export const historySchema = z.object({
  offerId: z.string(),
  providerId: z.string(),
  gpuModelId: z.string(),
  cloudType: z.string(),
  pricePerGpuHr: positive,
  billingModel: z.optional(z.enum(["on-demand", "spot"])),
  historyOrigin: z.optional(z.enum(["collector", "provider_hourly_last"])),
  observedAt: timestamp,
  dataSource: z.optional(z.enum(["api", "pricing_page"])),
  sourceUrl: z.optional(httpsUrl),
  sourceSha256: z.optional(sha256),
});
export const poolPointSchema = z
  .object({
    providerId: z.string(),
    observedAt: timestamp,
    baseline: z.boolean(),
    total: count,
    available: count,
    limited: count,
    unavailable: count,
    unknown: count,
    added: count,
    removed: count,
    priceChanges: count,
    availabilityChanges: count,
  })
  .check(
    z.refine(
      p => p.total === p.available + p.limited + p.unavailable + p.unknown,
      { message: "Pool counts must agree" }
    )
  );
export type PoolPoint = z.infer<typeof poolPointSchema>;
export const snapshotSchema = z
  .object({
    version: z.literal(1),
    generatedAt: timestamp,
    sources: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.enum(["ok", "error", "not_configured", "not_connected"]),
        checkedAt: timestamp,
        lastSuccessAt: z.nullable(timestamp),
        message: z.string(),
        evidence: z.optional(evidenceSchema),
        exclusions: z.optional(z.array(exclusionSchema)),
      })
    ),
    offers: z.array(offerSchema),
    history: z.array(historySchema),
    poolHistory: z.optional(z.array(poolPointSchema)),
  })
  .check(
    z.superRefine((s, ctx) => {
      if (new Set(s.offers.map(o => o.offerId)).size !== s.offers.length)
        ctx.addIssue({ code: "custom", message: "Duplicate offer IDs" });
      if (new Set(s.sources.map(o => o.id)).size !== s.sources.length)
        ctx.addIssue({ code: "custom", message: "Duplicate source IDs" });
      if (
        s.history.some(
          h => Date.parse(h.observedAt) > Date.parse(s.generatedAt)
        ) ||
        s.poolHistory?.some(
          p => Date.parse(p.observedAt) > Date.parse(s.generatedAt)
        )
      )
        ctx.addIssue({ code: "custom", message: "History is in the future" });
      for (const offer of s.offers) {
        const source = s.sources.find(source => source.id === offer.providerId);
        if (
          offer.dataSource === "pricing_page" &&
          (!source?.evidence ||
            source.evidence.contentSha256 !== offer.sourceSha256 ||
            source.evidence.sourceUrl !== offer.sourceUrl ||
            source.evidence.retrievedAt !== offer.observedAt)
        )
          ctx.addIssue({
            code: "custom",
            message: "Pricing-page offer does not match source evidence",
          });
        if (!s.sources.some(source => source.id === offer.providerId))
          ctx.addIssue({ code: "custom", message: "Offer has no source" });
        if (Date.parse(offer.observedAt) > Date.parse(s.generatedAt))
          ctx.addIssue({
            code: "custom",
            message: "Observation is in the future",
          });
      }
    })
  );
export type Snapshot = z.infer<typeof snapshotSchema>;
export function isStale(observedAt: string, now = Date.now()) {
  return now - Date.parse(observedAt) > 2 * 60 * 60 * 1000;
}

export function isCurrent(
  snapshot: Snapshot,
  offer: GpuOffer,
  now = Date.now()
) {
  return (
    !isStale(offer.observedAt, now) &&
    snapshot.sources.find(s => s.id === offer.providerId)?.status === "ok"
  );
}
