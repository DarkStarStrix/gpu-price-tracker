import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  snapshotSchema,
  offerSchema,
  type Snapshot,
  evidenceSchema,
  exclusionSchema,
} from "../shared/catalog";
import { sources, type Source } from "./providers";

export async function collect(
  previous: Snapshot | null,
  adapters: Source[],
  at = new Date().toISOString()
): Promise<Snapshot> {
  if (previous) snapshotSchema.parse(previous);
  const now = Date.parse(at);
  const next: Snapshot = {
    version: 1,
    generatedAt: at,
    sources: [],
    offers: [],
    history: [],
  };
  const history =
    previous?.history.filter(
      h => Date.parse(h.observedAt) >= now - 7 * 86400_000
    ) ?? [];
  for (const source of adapters) {
    const old = previous?.sources.find(s => s.id === source.id);
    const status: Snapshot["sources"][number] = {
      id: source.id,
      name: source.name,
      checkedAt: at,
      lastSuccessAt: old?.lastSuccessAt ?? null,
      status: source.connected ? "not_configured" : "not_connected",
      evidence: old?.evidence,
      exclusions: old?.exclusions,
      message: source.connected
        ? "Collector credentials not configured"
        : "No verified collector connected",
    };
    let offers = previous?.offers.filter(o => o.providerId === source.id) ?? [];
    if (source.connected && source.configured) {
      try {
        const received = await source.fetch(at);
        const checked = received.offers.map(o => offerSchema.parse(o));
        const evidence = received.evidence
          ? evidenceSchema.parse(received.evidence)
          : undefined;
        if (evidence && evidence.retrievedAt !== at)
          throw new Error("Source retrieval time mismatch");
        const exclusions = (received.exclusions ?? []).map(row =>
          exclusionSchema.parse(row)
        );
        if (
          checked.some(
            o =>
              o.dataSource === "pricing_page" &&
              (!evidence ||
                evidence.contentSha256 !== o.sourceSha256 ||
                evidence.sourceUrl !== o.sourceUrl)
          )
        )
          throw new Error("Source evidence mismatch");
        if (
          checked.some(
            o => o.providerId !== source.id || o.observedAt !== at
          ) ||
          new Set(checked.map(o => o.offerId)).size !== checked.length
        )
          throw new Error("Source identity mismatch");
        // Replace the whole provider catalog on success, including an authoritative empty response.
        offers = checked;
        status.status = "ok";
        status.lastSuccessAt = at;
        status.evidence = evidence;
        status.exclusions = exclusions;
        status.message = `${offers.length} offers observed${exclusions.length ? `; ${exclusions.length} rows excluded (see evidence)` : ""}`;
        history.push(
          ...offers.map(o => ({
            offerId: o.offerId,
            providerId: o.providerId,
            gpuModelId: o.gpuModelId,
            cloudType: o.cloudType,
            pricePerGpuHr: o.pricePerGpuHr,
            observedAt: o.observedAt,
            dataSource: o.dataSource,
            sourceUrl: o.sourceUrl,
            sourceSha256: o.sourceSha256,
          }))
        );
      } catch {
        // Never publish provider exception strings: URLs and response bodies may contain credentials.
        status.status = "error";
        status.message = "Refresh failed; retaining last verified observations";
      }
    }
    next.sources.push(status);
    next.offers.push(...offers);
  }
  next.history = [
    ...new Map(history.map(h => [`${h.offerId}:${h.observedAt}`, h])).values(),
  ];
  return snapshotSchema.parse(next);
}
export async function main() {
  const file = resolve("client/public/data/latest.json");
  let previous: Snapshot | null = null;
  try {
    previous = snapshotSchema.parse(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const snapshot = await collect(previous, sources());
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(snapshot, null, 2) + "\n");
  await rename(temporary, file);
  for (const source of snapshot.sources)
    console.log(`${source.name}: ${source.status} — ${source.message}`);
  if (!snapshot.sources.some(s => s.status === "ok"))
    console.warn(
      "No source refreshed successfully; snapshot reports degraded collection."
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch(() => {
    console.error("Collection could not safely read or publish the snapshot.");
    process.exitCode = 1;
  });
}
