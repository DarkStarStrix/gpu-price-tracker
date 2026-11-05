import { z } from "zod";

const timestamp = z.string().datetime();
const positive = z.number().finite().positive();
export const offerSchema = z
  .object({
    offerId: z.string().min(1),
    providerId: z.string().min(1),
    providerName: z.string().min(1),
    gpuModelId: z.string().min(1),
    gpuModelName: z.string().min(1),
    gpuCount: positive.int(),
    configurationKnown: z.boolean().optional(),
    billingModel: z.enum(["on-demand", "spot"]).optional(),
    vramPerGpuGb: positive.nullable(),
    vcpus: positive.nullable(),
    ramGb: positive.nullable(),
    region: z.string(),
    pricePerGpuHr: positive,
    totalNodePriceHr: positive,
    availability: z.enum(["available", "limited", "unavailable", "unknown"]),
    providerLink: z.string().url().startsWith("https://"),
    sourceUrl: z.string().url().startsWith("https://"),
    cloudType: z.string(),
    dataSource: z.enum(["api", "pricing_page"]),
    sourcePriceHr: positive.optional(),
    priceBasis: z.enum(["per_gpu_hour", "per_instance_hour"]).optional(),
    sourceSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    observedAt: timestamp,
  })
  .refine(
    o => Math.abs(o.pricePerGpuHr * o.gpuCount - o.totalNodePriceHr) < 0.00001,
    "Per-GPU and node price must agree"
  )
  .superRefine((offer, ctx) => {
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
  });
export type GpuOffer = z.infer<typeof offerSchema>;
export const evidenceSchema = z.object({
  sourceUrl: z.string().url().startsWith("https://"),
  retrievedAt: timestamp,
  contentSha256: z.string().regex(/^[a-f0-9]{64}$/),
  parserVersion: z.string().min(1),
});
export const exclusionSchema = z.object({
  row: z.string().min(1).max(256),
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
  billingModel: z.enum(["on-demand", "spot"]).optional(),
  historyOrigin: z.enum(["collector", "provider_hourly_last"]).optional(),
  observedAt: timestamp,
  dataSource: z.enum(["api", "pricing_page"]).optional(),
  sourceUrl: z.string().url().startsWith("https://").optional(),
  sourceSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
export const poolPointSchema = z
  .object({
    providerId: z.string(),
    observedAt: timestamp,
    baseline: z.boolean(),
    total: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
    limited: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    priceChanges: z.number().int().nonnegative(),
    availabilityChanges: z.number().int().nonnegative(),
  })
  .refine(
    p => p.total === p.available + p.limited + p.unavailable + p.unknown,
    "Pool counts must agree"
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
        lastSuccessAt: timestamp.nullable(),
        message: z.string(),
        evidence: evidenceSchema.optional(),
        exclusions: z.array(exclusionSchema).optional(),
      })
    ),
    offers: z.array(offerSchema),
    history: z.array(historySchema),
    poolHistory: z.array(poolPointSchema).optional(),
  })
  .superRefine((s, ctx) => {
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
  });
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
