/**
 * Subscription helpers — read/write the subscriptions table.
 * All Stripe-specific logic (checkout, webhooks) lives in routers.ts.
 */

import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { subscriptions, type InsertSubscription } from "../drizzle/schema";

export async function getSubscription(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  return rows[0] ?? null;
}

export async function upsertSubscription(data: InsertSubscription) {
  const db = await getDb();
  if (!db) return;
  await db.insert(subscriptions).values(data).onDuplicateKeyUpdate({
    set: {
      plan:                 data.plan,
      status:               data.status,
      stripeCustomerId:     data.stripeCustomerId,
      stripeSubscriptionId: data.stripeSubscriptionId,
      currentPeriodEnd:     data.currentPeriodEnd,
      updatedAt:            new Date(),
    },
  });
}

/** Returns true if the user has an active Pro subscription */
export async function isPro(userId: number): Promise<boolean> {
  const sub = await getSubscription(userId);
  if (!sub) return false;
  if (sub.plan !== "pro") return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  // Check period hasn't expired (grace: allow 1 day past end)
  if (sub.currentPeriodEnd) {
    const grace = new Date(sub.currentPeriodEnd.getTime() + 24 * 60 * 60 * 1000);
    if (new Date() > grace) return false;
  }
  return true;
}
