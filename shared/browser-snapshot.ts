import { z } from "zod/mini";
import { historySchema, poolPointSchema, type Snapshot } from "./catalog";

const listingSchema = z.pick(historySchema, {
  offerId: true,
  providerId: true,
  gpuModelId: true,
  cloudType: true,
  billingModel: true,
});

const historyFileSchema = z.object({
  generatedAt: historySchema.shape.observedAt,
  listings: z.array(listingSchema),
  points: z.array(
    z.tuple([
      z.int().check(z.nonnegative()),
      historySchema.shape.observedAt,
      historySchema.shape.pricePerGpuHr,
      historySchema.shape.historyOrigin,
    ])
  ),
  poolHistory: z.optional(z.array(poolPointSchema)),
});

export function overviewSnapshot(snapshot: Snapshot): Snapshot {
  const { version, generatedAt, sources, offers, history } = snapshot;
  const ids = new Set(
    offers
      .filter(offer => offer.gpuModelId === "h100-sxm")
      .map(offer => offer.offerId)
  );
  return {
    version,
    generatedAt,
    sources,
    offers,
    history: history.filter(point => ids.has(point.offerId)),
  };
}

// Publish the chart fields separately. The full source evidence stays in latest.json.
type HistoryFile = z.infer<typeof historyFileSchema>;

export function encodeHistory(snapshot: Snapshot): HistoryFile {
  const listings: z.infer<typeof listingSchema>[] = [];
  const indices = new Map<string, number>();
  const points: HistoryFile["points"] = snapshot.history.map(point => {
    const { offerId, providerId, gpuModelId, cloudType, billingModel } = point;
    const listing = {
      offerId,
      providerId,
      gpuModelId,
      cloudType,
      billingModel,
    };
    const key = JSON.stringify(listing);
    let index = indices.get(key);
    if (index === undefined) {
      index = listings.push(listing) - 1;
      indices.set(key, index);
    }
    return [
      index,
      point.observedAt,
      point.pricePerGpuHr,
      point.historyOrigin ?? "collector",
    ];
  });
  return {
    generatedAt: snapshot.generatedAt,
    listings,
    points,
    poolHistory: snapshot.poolHistory,
  };
}

export function mergeHistory(current: Snapshot, data: unknown): Snapshot {
  const file = historyFileSchema.parse(data);
  if (file.generatedAt !== current.generatedAt)
    throw new Error("Price history belongs to another snapshot");
  const publishedAt = Date.parse(file.generatedAt);
  const history = file.points.map(
    ([index, observedAt, pricePerGpuHr, historyOrigin]) => {
      const listing = file.listings[index];
      if (!listing || Date.parse(observedAt) > publishedAt)
        throw new Error("Invalid published price history point");
      return { ...listing, observedAt, pricePerGpuHr, historyOrigin };
    }
  );
  if (
    file.poolHistory?.some(point => Date.parse(point.observedAt) > publishedAt)
  )
    throw new Error("Pool history is in the future");
  return { ...current, history, poolHistory: file.poolHistory };
}
