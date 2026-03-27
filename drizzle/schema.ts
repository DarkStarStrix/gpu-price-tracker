import {
  int, mysqlEnum, mysqlTable, text, timestamp,
  varchar, float, boolean, index,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id:          int("id").autoincrement().primaryKey(),
  openId:      varchar("openId", { length: 64 }).notNull().unique(),
  name:        text("name"),
  email:       varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role:        mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt:   timestamp("createdAt").defaultNow().notNull(),
  updatedAt:   timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Subscriptions ────────────────────────────────────────────────────────────
// Minimal: only Stripe IDs + plan/status needed for gating. Everything else
// (amounts, periods, card details) is fetched from Stripe API on demand.

export const subscriptions = mysqlTable("subscriptions", {
  id:                     int("id").autoincrement().primaryKey(),
  userId:                 int("userId").notNull().unique(), // one active sub per user
  plan:                   mysqlEnum("plan", ["free", "pro"]).notNull().default("free"),
  status:                 varchar("status", { length: 32 }).notNull().default("active"),
  stripeCustomerId:       varchar("stripeCustomerId", { length: 64 }),
  stripeSubscriptionId:   varchar("stripeSubscriptionId", { length: 64 }),
  // Cache period end for quick gating without hitting Stripe API on every request
  currentPeriodEnd:       timestamp("currentPeriodEnd"),
  createdAt:              timestamp("createdAt").defaultNow().notNull(),
  updatedAt:              timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (t) => [
  index("idx_sub_user").on(t.userId),
  index("idx_sub_stripe_customer").on(t.stripeCustomerId),
  index("idx_sub_stripe_sub").on(t.stripeSubscriptionId),
]);

export type Subscription = typeof subscriptions.$inferSelect;
export type InsertSubscription = typeof subscriptions.$inferInsert;

// ─── GPU Offers (live snapshot) ──────────────────────────────────────────────

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
