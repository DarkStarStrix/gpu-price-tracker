import { z } from "zod/mini";

const id = z.string().check(z.minLength(1), z.maxLength(300));
const target = z.number().check(z.positive(), z.maximum(100_000));
export const watchSchema = z
  .object({
    offerId: id,
    label: z.string().check(z.minLength(1), z.maxLength(180)),
    price: z.nullable(target),
    restock: z.boolean(),
  })
  .check(z.refine(watch => watch.price !== null || watch.restock));

export const watchesSchema = z.array(watchSchema).check(
  z.maxLength(20),
  z.refine(
    watches =>
      new Set(watches.map(watch => watch.offerId)).size === watches.length
  )
);
export type Watch = z.infer<typeof watchSchema>;

const webPushHosts = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);
export function isPushEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname;
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.hash &&
      (webPushHosts.has(hostname) ||
        hostname.endsWith(".push.apple.com") ||
        hostname.endsWith(".notify.windows.com") ||
        hostname.endsWith(".wns.windows.com"))
    );
  } catch {
    return false;
  }
}

export const subscriptionSchema = z.object({
  endpoint: z.string().check(z.maxLength(2048), z.refine(isPushEndpoint)),
  keys: z.object({
    p256dh: z.string().check(z.regex(/^B[A-Za-z0-9_-]{86}=?$/)),
    auth: z.string().check(z.regex(/^[A-Za-z0-9_-]{22}(?:==)?$/)),
  }),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

const timestamp = z.iso.datetime();
const stateSchema = z.object({
  offerId: id,
  at: timestamp,
  below: z.boolean(),
  stock: z.nullable(z.enum(["available", "limited", "unavailable"])),
});
const eventSchema = z.object({
  offerId: id,
  at: timestamp,
  title: z.string().check(z.maxLength(100)),
  body: z.string().check(z.maxLength(240)),
  gpu: id,
  billing: z.enum(["spot", "on-demand"]),
});
export const evaluationSchema = z.object({
  observed: z.array(stateSchema).check(z.maxLength(20)),
  pending: z.array(eventSchema).check(z.maxLength(20)),
});
export type Evaluation = z.infer<typeof evaluationSchema>;
export type WatchEvent = Evaluation["pending"][number];

export const revisionSchema = z.nullable(z.uuid());
export const updateWatchesSchema = z.object({
  revision: revisionSchema,
  subscription: z.optional(subscriptionSchema),
  watches: watchesSchema,
});
export const dispatchUpdateSchema = z.object({
  revision: z.uuid(),
  evaluation: z.nullable(evaluationSchema),
});

export interface WatchDevice {
  id: string;
  revision: string;
  subscription: Subscription;
  watches: Watch[];
  evaluation: Evaluation;
}
