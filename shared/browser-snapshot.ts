import { z } from "zod/mini";
import {
  historySchema,
  poolPointSchema,
  snapshotSchema,
  type Snapshot,
} from "./catalog";
import { displayQuote } from "./market";

const listingSchema = z.pick(historySchema, {
  offerId: true,
  providerId: true,
  gpuModelId: true,
  cloudType: true,
  billingModel: true,
  dataSource: true,
  sourceUrl: true,
});
const indexSchema = z.int().check(z.nonnegative());

const historyFileSchema = z.object({
  generatedAt: historySchema.shape.observedAt,
  listings: z.array(listingSchema),
  times: z.optional(z.array(historySchema.shape.observedAt)),
  hashes: z.optional(z.array(historySchema.shape.sourceSha256)),
  points: z.array(
    z.tuple([
      indexSchema,
      z.union([indexSchema, historySchema.shape.observedAt]),
      historySchema.shape.pricePerGpuHr,
      z.nullable(historySchema.shape.historyOrigin),
      z.optional(indexSchema),
    ])
  ),
  poolHistory: z.optional(z.array(poolPointSchema)),
});

export function overviewSnapshot(snapshot: Snapshot): Snapshot {
  const { version, generatedAt, sources, offers, history } = snapshot;
  const ids = new Set(
    ["on-demand", "spot"].map(
      billing =>
        displayQuote(snapshot, "h100-sxm", billing, Date.parse(generatedAt))
          ?.offer.offerId
    )
  );
  const since = Date.parse(generatedAt) - 24 * 3600_000;
  return {
    version,
    generatedAt,
    sources,
    offers,
    history: history.filter(
      point => ids.has(point.offerId) && Date.parse(point.observedAt) >= since
    ),
  };
}

// Publish the chart fields separately. The full source evidence stays in latest.json.
type HistoryFile = z.infer<typeof historyFileSchema>;

export function encodeHistory(
  snapshot: Snapshot,
  preserveEvidence = false
): HistoryFile {
  const listings: z.infer<typeof listingSchema>[] = [];
  const times: string[] = [];
  const hashes: string[] = [];
  const indices = new Map<string, number>();
  const timeIndices = new Map<string, number>();
  const hashIndices = new Map<string, number>();
  function indexOf(
    values: string[],
    index: Map<string, number>,
    value: string
  ) {
    const existing = index.get(value);
    if (existing !== undefined) return existing;
    const next = values.push(value) - 1;
    index.set(value, next);
    return next;
  }
  const points: HistoryFile["points"] = snapshot.history.map(point => {
    const { offerId, providerId, gpuModelId, cloudType, billingModel } = point;
    const listing = {
      offerId,
      providerId,
      gpuModelId,
      cloudType,
      billingModel,
      ...(preserveEvidence && {
        dataSource: point.dataSource,
        sourceUrl: point.sourceUrl,
      }),
    };
    const key = JSON.stringify(listing);
    let index = indices.get(key);
    if (index === undefined) {
      index = listings.push(listing) - 1;
      indices.set(key, index);
    }
    const sample: HistoryFile["points"][number] = [
      index,
      preserveEvidence
        ? indexOf(times, timeIndices, point.observedAt)
        : point.observedAt,
      point.pricePerGpuHr,
    ];
    if (!preserveEvidence) sample.push(point.historyOrigin ?? "collector");
    else if (point.historyOrigin || point.sourceSha256)
      sample.push(point.historyOrigin ?? null);
    if (preserveEvidence && point.sourceSha256)
      sample.push(indexOf(hashes, hashIndices, point.sourceSha256));
    return sample;
  });
  return {
    generatedAt: snapshot.generatedAt,
    listings,
    times: times.length ? times : undefined,
    hashes: hashes.length ? hashes : undefined,
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
    ([index, time, pricePerGpuHr, historyOrigin, hashIndex]) => {
      const listing = file.listings[index];
      const observedAt = typeof time === "number" ? file.times?.[time] : time;
      const sourceSha256 =
        hashIndex === undefined ? undefined : file.hashes?.[hashIndex];
      if (
        !listing ||
        !observedAt ||
        Date.parse(observedAt) > publishedAt ||
        (hashIndex !== undefined && !sourceSha256)
      )
        throw new Error("Invalid published price history point");
      return {
        ...listing,
        observedAt,
        pricePerGpuHr,
        historyOrigin: historyOrigin ?? undefined,
        sourceSha256,
      };
    }
  );
  if (
    file.poolHistory?.some(point => Date.parse(point.observedAt) > publishedAt)
  )
    throw new Error("Pool history is in the future");
  return { ...current, history, poolHistory: file.poolHistory };
}

// The durable file keeps the full precision and provenance of every observation.
// Old checkouts may still have the original expanded snapshot.
export function readSnapshot(data: unknown): Snapshot {
  if (typeof data !== "object" || data === null || !("packedHistory" in data))
    return snapshotSchema.parse(data);
  const { packedHistory, ...header } = data;
  if ("history" in header || "poolHistory" in header)
    throw new Error("Ambiguous snapshot history representation");
  return mergeHistory(
    snapshotSchema.parse({ ...header, history: [] }),
    packedHistory
  );
}

export function writeSnapshot(snapshot: Snapshot): string {
  const { history, poolHistory, ...current } = snapshot;
  return (
    JSON.stringify({
      ...current,
      packedHistory: encodeHistory(snapshot, true),
    }) + "\n"
  );
}
