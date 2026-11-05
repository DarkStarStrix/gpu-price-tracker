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
    dataSource: z.literal("api"),
    observedAt: timestamp,
  })
  .refine(
    o => Math.abs(o.pricePerGpuHr * o.gpuCount - o.totalNodePriceHr) < 0.00001,
    "Per-GPU and node price must agree"
  );
export type GpuOffer = z.infer<typeof offerSchema>;
export const historySchema = z.object({
  offerId: z.string(),
  providerId: z.string(),
  gpuModelId: z.string(),
  cloudType: z.string(),
  pricePerGpuHr: positive,
  observedAt: timestamp,
});
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
      })
    ),
    offers: z.array(offerSchema),
    history: z.array(historySchema),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.offers.map(o => o.offerId)).size !== s.offers.length)
      ctx.addIssue({ code: "custom", message: "Duplicate offer IDs" });
    if (new Set(s.sources.map(o => o.id)).size !== s.sources.length)
      ctx.addIssue({ code: "custom", message: "Duplicate source IDs" });
    for (const offer of s.offers) {
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
