import { createHash } from "node:crypto";
import { buildPushPayload } from "@block65/webcrypto-web-push";
import { snapshotSchema } from "../shared/catalog";
import {
  subscriptionSchema,
  type Evaluation,
  type WatchDevice,
  type WatchEvent,
} from "../shared/watchlist";
import { evaluateWatches } from "./evaluate";

const SITE = "https://darkstarstrix.github.io/gpu-price-tracker/";
const worker = process.env.WATCH_API_URL;
const token = process.env.WATCH_DISPATCH_TOKEN;
const vapid = {
  subject: SITE,
  publicKey: process.env.WATCH_VAPID_PUBLIC ?? "",
  privateKey: process.env.WATCH_VAPID_PRIVATE ?? "",
};

async function request(
  path: string,
  update?: { revision: string; evaluation: Evaluation | null }
) {
  const response = await fetch(new URL(path, worker), {
    method: update ? "PUT" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: update ? JSON.stringify(update) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 409 && update) return null;
  if (!response.ok)
    throw new Error(`Watchlist service returned ${response.status}`);
  return response.json();
}

async function send(device: WatchDevice, event: WatchEvent) {
  const subscription = subscriptionSchema.parse(device.subscription);
  const url = new URL(SITE);
  url.search = new URLSearchParams({
    view: "trends",
    offer: event.offerId,
    gpuModel: event.gpu,
    billing: event.billing,
  }).toString();
  const tag = createHash("sha256")
    .update(event.offerId)
    .digest("base64url")
    .slice(0, 24);
  const payload = await buildPushPayload(
    {
      data: JSON.stringify({
        title: event.title,
        body: event.body,
        url: url.href,
        tag,
      }),
      options: { ttl: 7_200, topic: tag },
    },
    { ...subscription, expirationTime: null },
    vapid
  );
  return fetch(subscription.endpoint, {
    ...payload,
    redirect: "error",
    signal: AbortSignal.timeout(12_000),
  });
}

async function main() {
  if (!worker || !token || !vapid.publicKey || !vapid.privateKey)
    throw new Error("Watchlist delivery configuration is incomplete");
  const response = await fetch(
    new URL(`data/current.json?checked=${Date.now()}`, SITE),
    {
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!response.ok) throw new Error("Published price snapshot is unavailable");
  const snapshot = snapshotSchema.parse(await response.json());
  let after = "";
  let delivered = 0;
  let retry = 0;
  for (;;) {
    const page = (await request(
      `/dispatch/devices?after=${after}`
    )) as WatchDevice[];
    if (!page.length) break;
    after = page.at(-1)!.id;
    // Keep delivery latency bounded while isolating errors for each browser.
    for (let start = 0; start < page.length; start += 8) {
      await Promise.all(
        page.slice(start, start + 8).map(async device => {
          const path = `/dispatch/devices/${device.id}`;
          try {
            const evaluation = evaluateWatches(
              device.watches,
              device.evaluation,
              snapshot
            );
            let revision = device.revision;
            if (
              JSON.stringify(evaluation) !== JSON.stringify(device.evaluation)
            ) {
              const saved = (await request(path, { revision, evaluation })) as {
                revision: string;
              } | null;
              if (!saved) return;
              revision = saved.revision;
            }
            if (!evaluation.pending.length) return;
            const pending: WatchEvent[] = [];
            for (const event of evaluation.pending) {
              try {
                const result = await send(device, event);
                if (result.status === 404 || result.status === 410) {
                  await request(path, { revision, evaluation: null });
                  return;
                }
                if (!result.ok) throw new Error("Push rejected");
                delivered++;
              } catch {
                pending.push(event);
                retry++;
              }
            }
            if (pending.length < evaluation.pending.length)
              await request(path, {
                revision,
                evaluation: { ...evaluation, pending },
              });
          } catch {
            retry++;
          }
        })
      );
    }
  }
  console.log(
    `Watchlist delivery: ${delivered} accepted by push services, ${retry} deferred.`
  );
  if (retry) process.exitCode = 1;
}

main().catch(() => {
  console.error(
    "Watchlist delivery could not complete. Check the service configuration and published catalog."
  );
  process.exitCode = 1;
});
