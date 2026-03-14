/*
  GPU Price Poller — fetches live pricing from provider APIs
  Sources: Lambda Cloud API, RunPod GraphQL, Vast.ai REST, + static fallback
  Runs every 15 minutes via setInterval, seeded on startup.
*/

import axios from "axios";
import { getDb } from "./db";
import { gpuOffers, priceSnapshots, pollLogs, type InsertGpuOffer } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { STATIC_OFFERS } from "./staticOffers";

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// ─── Lambda Cloud API ─────────────────────────────────────────────────────────

async function fetchLambda(): Promise<InsertGpuOffer[]> {
  const apiKey = process.env.LAMBDA_API_KEY;
  if (!apiKey) {
    console.log("[Poller] Lambda: no API key set, skipping");
    return [];
  }
  const res = await axios.get("https://cloud.lambdalabs.com/api/v1/instance-types", {
    timeout: 10_000,
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
  });

  const data = res.data?.data ?? {};
  const offers: InsertGpuOffer[] = [];

  for (const [typeId, info] of Object.entries(data as Record<string, any>)) {
    const specs = info?.instance_type ?? {};
    const gpuName: string = specs?.gpu_description ?? typeId;
    const priceHr: number = (info?.price_cents_per_hour ?? 0) / 100;
    if (!priceHr) continue;

    const gpuCount: number = specs?.gpus?.length ?? 1;
    const vram: number = specs?.gpus?.[0]?.memory_size ?? 0;
    const vcpus: number = specs?.vcpus ?? 0;
    const ram: number = Math.round((specs?.memory_gib ?? 0));
    const available = info?.regions_with_capacity_available?.length > 0;

    const gpuModelId = normalizeGpuId(gpuName);

    offers.push({
      offerId:          `lambda-${typeId}`,
      providerId:       "lambda",
      providerName:     "Lambda",
      gpuModelId,
      gpuModelName:     normalizeGpuName(gpuName),
      gpuCount,
      vramPerGpuGb:     vram,
      vcpus,
      ramGb:            ram,
      region:           "us-east",
      pricePerGpuHr:    priceHr / gpuCount,
      totalNodePriceHr: priceHr,
      availability:     available ? "available" : "unavailable",
      providerLink:     "https://cloud.lambdalabs.com/instances",
      cloudType:        "on-demand",
      dataSource:       "api",
      lastPolledAt:     new Date(),
    });
  }

  return offers;
}

// ─── RunPod GraphQL API ───────────────────────────────────────────────────────

async function fetchRunPod(): Promise<InsertGpuOffer[]> {
  const apiKey = process.env.RUNPOD_API_KEY;
  if (!apiKey) {
    console.log("[Poller] RunPod: no API key set, skipping");
    return [];
  }
  const query = `{
    gpuTypes {
      id displayName memoryInGb lowestPrice { minimumBidPrice uninterruptablePrice }
      secureCloud communityCloud
    }
  }`;

  const res = await axios.post(
    `https://api.runpod.io/graphql?api_key=${apiKey}`,
    { query },
    { timeout: 10_000, headers: { "Content-Type": "application/json" } }
  );

  const gpuTypes = res.data?.data?.gpuTypes ?? [];
  const offers: InsertGpuOffer[] = [];

  for (const gpu of gpuTypes) {
    const price: number = gpu?.lowestPrice?.uninterruptablePrice ?? gpu?.lowestPrice?.minimumBidPrice ?? 0;
    if (!price) continue;

    const gpuModelId = normalizeGpuId(gpu.displayName ?? gpu.id);

    if (gpu.secureCloud) {
      offers.push({
        offerId:          `runpod-secure-${gpu.id}`,
        providerId:       "runpod",
        providerName:     "RunPod",
        gpuModelId,
        gpuModelName:     normalizeGpuName(gpu.displayName ?? gpu.id),
        gpuCount:         1,
        vramPerGpuGb:     gpu.memoryInGb ?? 0,
        vcpus:            0,
        ramGb:            0,
        region:           "us-east",
        pricePerGpuHr:    price,
        totalNodePriceHr: price,
        availability:     "available",
        providerLink:     "https://www.runpod.io/console/gpu-cloud",
        cloudType:        "secure",
        dataSource:       "api",
        lastPolledAt:     new Date(),
      });
    }

    if (gpu.communityCloud) {
      const spotPrice: number = gpu?.lowestPrice?.minimumBidPrice ?? 0;
      if (spotPrice) {
        offers.push({
          offerId:          `runpod-community-${gpu.id}`,
          providerId:       "runpod",
          providerName:     "RunPod",
          gpuModelId,
          gpuModelName:     normalizeGpuName(gpu.displayName ?? gpu.id),
          gpuCount:         1,
          vramPerGpuGb:     gpu.memoryInGb ?? 0,
          vcpus:            0,
          ramGb:            0,
          region:           "community",
          pricePerGpuHr:    spotPrice,
          totalNodePriceHr: spotPrice,
          availability:     "available",
          providerLink:     "https://www.runpod.io/console/gpu-cloud",
          cloudType:        "spot",
          dataSource:       "api",
          lastPolledAt:     new Date(),
        });
      }
    }
  }

  return offers;
}

// ─── Vast.ai REST API ─────────────────────────────────────────────────────────

async function fetchVastai(): Promise<InsertGpuOffer[]> {
  const apiKey = process.env.VAST_API_KEY;
  if (!apiKey) {
    console.log("[Poller] Vast.ai: no API key set, skipping");
    return [];
  }
  const res = await axios.get(
    "https://console.vast.ai/api/v0/bundles/?q=[]&order=score-&type=on-demand&limit=40",
    { timeout: 12_000, headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } }
  );

  const offers_raw = res.data?.offers ?? [];
  const seen = new Set<string>();
  const offers: InsertGpuOffer[] = [];

  for (const o of offers_raw) {
    const gpuName: string = o?.gpu_name ?? "";
    if (!gpuName) continue;

    const gpuModelId = normalizeGpuId(gpuName);
    const key = `vastai-${gpuModelId}`;
    if (seen.has(key)) continue; // keep lowest price (first result, sorted by score)
    seen.add(key);

    const priceHr: number = o?.dph_total ?? 0;
    if (!priceHr) continue;

    offers.push({
      offerId:          key,
      providerId:       "tensordock",
      providerName:     "Vast.ai",
      gpuModelId,
      gpuModelName:     normalizeGpuName(gpuName),
      gpuCount:         o?.num_gpus ?? 1,
      vramPerGpuGb:     Math.round((o?.gpu_ram ?? 0) / 1024),
      vcpus:            o?.cpu_cores ?? 0,
      ramGb:            Math.round((o?.cpu_ram ?? 0) / 1024),
      region:           o?.geolocation ?? "us",
      pricePerGpuHr:    priceHr / (o?.num_gpus ?? 1),
      totalNodePriceHr: priceHr,
      availability:     "available",
      providerLink:     "https://vast.ai/console/create",
      cloudType:        "spot",
      dataSource:       "api",
      lastPolledAt:     new Date(),
    });
  }

  return offers;
}

// ─── Normalization helpers ────────────────────────────────────────────────────

function normalizeGpuId(raw: string): string {
  const s = raw.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (s.includes("b200"))   return "b200-sxm";
  if (s.includes("h200"))   return "h200-sxm";
  if (s.includes("h100") && (s.includes("sxm") || s.includes("80"))) return "h100-sxm";
  if (s.includes("h100"))   return "h100-pcie";
  if (s.includes("a100") && s.includes("80")) return "a100-sxm-80";
  if (s.includes("a100") && s.includes("40")) return "a100-pcie-40";
  if (s.includes("a100"))   return "a100-sxm-80";
  if (s.includes("l40s"))   return "l40s";
  if (s.includes("l40"))    return "l40s";
  if (s.includes("a40"))    return "a40";
  if (s.includes("4090"))   return "rtx-4090";
  if (s.includes("3090"))   return "rtx-3090";
  if (s.includes("a6000"))  return "rtx-a6000";
  if (s.includes("a5000"))  return "rtx-a5000";
  if (s.includes("v100"))   return "v100-sxm";
  return s;
}

function normalizeGpuName(raw: string): string {
  const map: Record<string, string> = {
    "b200-sxm":    "B200 SXM",
    "h200-sxm":    "H200 SXM",
    "h100-sxm":    "H100 SXM",
    "h100-pcie":   "H100 PCIe",
    "a100-sxm-80": "A100 SXM 80GB",
    "a100-pcie-40":"A100 PCIe 40GB",
    "l40s":        "L40S",
    "a40":         "A40",
    "rtx-4090":    "RTX 4090",
    "rtx-3090":    "RTX 3090",
    "rtx-a6000":   "RTX A6000",
    "rtx-a5000":   "RTX A5000",
    "v100-sxm":    "V100 SXM",
  };
  const id = normalizeGpuId(raw);
  return map[id] ?? raw;
}

// ─── DB upsert helpers ────────────────────────────────────────────────────────

async function upsertOffers(offers: InsertGpuOffer[]): Promise<void> {
  const db = await getDb();
  if (!db || offers.length === 0) return;

  for (const offer of offers) {
    await db.insert(gpuOffers).values(offer).onDuplicateKeyUpdate({
      set: {
        pricePerGpuHr:    offer.pricePerGpuHr,
        totalNodePriceHr: offer.totalNodePriceHr,
        availability:     offer.availability,
        lastPolledAt:     offer.lastPolledAt,
        dataSource:       offer.dataSource,
        updatedAt:        new Date(),
      },
    });
  }
}

async function appendSnapshots(offers: InsertGpuOffer[]): Promise<void> {
  const db = await getDb();
  if (!db || offers.length === 0) return;

  const snaps = offers.map(o => ({
    offerId:       o.offerId,
    providerId:    o.providerId,
    gpuModelId:    o.gpuModelId,
    pricePerGpuHr: o.pricePerGpuHr,
    availability:  o.availability as "available" | "limited" | "unavailable",
    snapshotAt:    new Date(),
  }));

  await db.insert(priceSnapshots).values(snaps);
}

async function logPoll(source: string, success: boolean, count: number, durationMs: number, error?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(pollLogs).values({ source, success, offersCount: count, durationMs, errorMessage: error });
}

// ─── Seed static data ─────────────────────────────────────────────────────────

export async function seedStaticData(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  // Check if already seeded
  const existing = await db.select().from(gpuOffers).limit(1);
  if (existing.length > 0) return;

  console.log("[Poller] Seeding static offer data...");
  const start = Date.now();
  await upsertOffers(STATIC_OFFERS);
  await appendSnapshots(STATIC_OFFERS);
  await logPoll("static", true, STATIC_OFFERS.length, Date.now() - start);
  console.log(`[Poller] Seeded ${STATIC_OFFERS.length} static offers`);
}

// ─── Main poll cycle ──────────────────────────────────────────────────────────

async function runPollCycle(): Promise<void> {
  console.log("[Poller] Starting poll cycle...");

  const sources: Array<{ name: string; fn: () => Promise<InsertGpuOffer[]> }> = [
    { name: "lambda",  fn: fetchLambda },
    { name: "runpod",  fn: fetchRunPod },
    { name: "vastai",  fn: fetchVastai },
  ];

  for (const { name, fn } of sources) {
    const start = Date.now();
    try {
      const offers = await fn();
      if (offers.length > 0) {
        await upsertOffers(offers);
        await appendSnapshots(offers);
        await logPoll(name, true, offers.length, Date.now() - start);
        console.log(`[Poller] ${name}: ${offers.length} offers updated`);
      } else {
        console.log(`[Poller] ${name}: no offers returned, keeping existing data`);
        await logPoll(name, true, 0, Date.now() - start);
      }
    } catch (err: any) {
      const msg = err?.message ?? String(err);
      console.warn(`[Poller] ${name} failed: ${msg}`);
      await logPoll(name, false, 0, Date.now() - start, msg);
    }
  }

  console.log("[Poller] Poll cycle complete");
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

export function startPoller(): void {
  // Seed static data first, then kick off live polling
  seedStaticData().then(() => {
    // First live poll after 30s (let server warm up)
    setTimeout(() => {
      runPollCycle();
      setInterval(runPollCycle, POLL_INTERVAL_MS);
    }, 30_000);
  });
}
