import {
  int, mysqlEnum, mysqlTable, text, timestamp,
  varchar, float, boolean, index,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── GPU Offers (live snapshot) ─────────────────────────────────────────────

/**
 * Current normalized offers — one row per provider+gpu combination.
 * Upserted on every polling cycle (every 15 minutes).
 */
export const gpuOffers = mysqlTable("gpu_offers", {
  id:               int("id").autoincrement().primaryKey(),
  offerId:          varchar("offerId", { length: 128 }).notNull().unique(),
  providerId:       varchar("providerId", { length: 64 }).notNull(),
  providerName:     varchar("providerName", { length: 128 }).notNull(),
  gpuModelId:       varchar("gpuModelId", { length: 64 }).notNull(),
  gpuModelName:     varchar("gpuModelName", { length: 128 }).notNull(),
  gpuCount:         int("gpuCount").notNull().default(1),
  vramPerGpuGb:     int("vramPerGpuGb").notNull(),
  vcpus:            int("vcpus").notNull().default(0),
  ramGb:            int("ramGb").notNull().default(0),
  region:           varchar("region", { length: 128 }).notNull().default("us-east"),
  pricePerGpuHr:    float("pricePerGpuHr").notNull(),
  totalNodePriceHr: float("totalNodePriceHr").notNull(),
  availability:     mysqlEnum("availability", ["available", "limited", "unavailable"]).notNull().default("available"),
  providerLink:     text("providerLink").notNull(),
  cloudType:        varchar("cloudType", { length: 32 }),
  dataSource:       varchar("dataSource", { length: 32 }).notNull().default("static"),
  lastPolledAt:     timestamp("lastPolledAt").defaultNow().notNull(),
  createdAt:        timestamp("createdAt").defaultNow().notNull(),
  updatedAt:        timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_provider").on(t.providerId),
  index("idx_gpu_model").on(t.gpuModelId),
  index("idx_availability").on(t.availability),
]);

export type GpuOffer = typeof gpuOffers.$inferSelect;
export type InsertGpuOffer = typeof gpuOffers.$inferInsert;

// ─── Price Snapshots (history) ───────────────────────────────────────────────

/**
 * Append-only price history — one row per offer per polling cycle.
 */
export const priceSnapshots = mysqlTable("price_snapshots", {
  id:            int("id").autoincrement().primaryKey(),
  offerId:       varchar("offerId", { length: 128 }).notNull(),
  providerId:    varchar("providerId", { length: 64 }).notNull(),
  gpuModelId:    varchar("gpuModelId", { length: 64 }).notNull(),
  pricePerGpuHr: float("pricePerGpuHr").notNull(),
  availability:  mysqlEnum("availability", ["available", "limited", "unavailable"]).notNull(),
  snapshotAt:    timestamp("snapshotAt").defaultNow().notNull(),
}, (t) => [
  index("idx_snap_offer").on(t.offerId),
  index("idx_snap_gpu").on(t.gpuModelId),
  index("idx_snap_time").on(t.snapshotAt),
]);

export type PriceSnapshot = typeof priceSnapshots.$inferSelect;
export type InsertPriceSnapshot = typeof priceSnapshots.$inferInsert;

// ─── Poll Log ─────────────────────────────────────────────────────────────────

export const pollLogs = mysqlTable("poll_logs", {
  id:           int("id").autoincrement().primaryKey(),
  source:       varchar("source", { length: 64 }).notNull(),
  success:      boolean("success").notNull().default(true),
  offersCount:  int("offersCount").notNull().default(0),
  errorMessage: text("errorMessage"),
  durationMs:   int("durationMs").notNull().default(0),
  polledAt:     timestamp("polledAt").defaultNow().notNull(),
});

export type PollLog = typeof pollLogs.$inferSelect;