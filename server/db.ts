import { eq, desc, and, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, gpuOffers, priceSnapshots, pollLogs, type GpuOffer, type PriceSnapshot } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── GPU Offer helpers ──────────────────────────────────────────────────────────────────────────────────────

export async function getAllOffers(): Promise<GpuOffer[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gpuOffers).orderBy(gpuOffers.pricePerGpuHr);
}

export async function getOffersByGpu(gpuModelId: string): Promise<GpuOffer[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gpuOffers)
    .where(eq(gpuOffers.gpuModelId, gpuModelId))
    .orderBy(gpuOffers.pricePerGpuHr);
}

export async function getMarketStats() {
  const db = await getDb();
  if (!db) return null;

  const offers = await db.select().from(gpuOffers);
  const available = offers.filter(o => o.availability === "available");

  const h100Offers = available.filter(o => o.gpuModelId === "h100-sxm");
  const b200Offers = available.filter(o => o.gpuModelId === "b200-sxm");
  const rtx4090Offers = available.filter(o => o.gpuModelId === "rtx-4090");

  const h100Floor = h100Offers.length > 0 ? Math.min(...h100Offers.map(o => o.pricePerGpuHr)) : 1.99;
  const b200Floor = b200Offers.length > 0 ? Math.min(...b200Offers.map(o => o.pricePerGpuHr)) : 5.74;
  const rtx4090Floor = rtx4090Offers.length > 0 ? Math.min(...rtx4090Offers.map(o => o.pricePerGpuHr)) : 0.34;

  const providers = Array.from(new Set(offers.map(o => o.providerId)));
  const gpuModels = Array.from(new Set(offers.map(o => o.gpuModelId)));

  return {
    totalOffers: offers.length,
    availableOffers: available.length,
    providerCount: providers.length,
    gpuModelCount: gpuModels.length,
    h100Floor,
    b200Floor,
    rtx4090Floor,
    lastUpdated: offers.reduce((latest, o) => o.lastPolledAt > latest ? o.lastPolledAt : latest, new Date(0)),
  };
}

// ─── Price history helpers ──────────────────────────────────────────────────────────────────────────────────

export async function getPriceHistory(gpuModelId: string, days: number = 7): Promise<PriceSnapshot[]> {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return db.select().from(priceSnapshots)
    .where(and(
      eq(priceSnapshots.gpuModelId, gpuModelId),
      gte(priceSnapshots.snapshotAt, since),
    ))
    .orderBy(priceSnapshots.snapshotAt)
    .limit(500);
}

export async function getSparklineData(offerIds: string[]): Promise<Record<string, number[]>> {
  const db = await getDb();
  if (!db) return {};
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const result: Record<string, number[]> = {};
  for (const offerId of offerIds) {
    const snaps = await db.select().from(priceSnapshots)
      .where(and(
        eq(priceSnapshots.offerId, offerId),
        gte(priceSnapshots.snapshotAt, since),
      ))
      .orderBy(priceSnapshots.snapshotAt)
      .limit(14);
    result[offerId] = snaps.map(s => s.pricePerGpuHr);
  }
  return result;
}

export async function getLastPollStatus() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(pollLogs)
    .orderBy(desc(pollLogs.polledAt))
    .limit(10);
}

// Returns the most recent successful poll timestamp per provider source
export async function getProviderPollStatus(): Promise<Record<string, Date | null>> {
  const db = await getDb();
  if (!db) return {};

  const logs = await db.select().from(pollLogs)
    .orderBy(desc(pollLogs.polledAt))
    .limit(50);

  const result: Record<string, Date | null> = {};
  for (const log of logs) {
    if (log.success && !result[log.source]) {
      result[log.source] = log.polledAt;
    }
  }
  return result;
}
