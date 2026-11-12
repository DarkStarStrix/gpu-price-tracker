import type {
  D1Database,
  Request as WorkerRequest,
} from "@cloudflare/workers-types";
import {
  dispatchUpdateSchema,
  subscriptionSchema,
  updateWatchesSchema,
  type Evaluation,
  type Subscription,
  type Watch,
} from "../shared/watchlist";

interface Env {
  DB: D1Database;
  SITE_ORIGIN: string;
  VAPID_PUBLIC_KEY: string;
  DISPATCH_TOKEN: string;
}

interface DeviceRow {
  id: string;
  revision: string;
  subscription: string;
  watches: string;
  evaluation: string;
}

const empty: Evaluation = { observed: [], pending: [] };
const hexToken = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();

async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value))
    ),
    byte => byte.toString(16).padStart(2, "0")
  ).join("");
}

function equalToken(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function readJson(request: WorkerRequest) {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    return;
  const reader = request.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let input = "";
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32_768) {
        await reader.cancel();
        return;
      }
      input += decoder.decode(value, { stream: true });
    }
    return JSON.parse(input + decoder.decode()) as unknown;
  } catch {
    return;
  } finally {
    reader.releaseLock();
  }
}

export default {
  async fetch(request: WorkerRequest, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const headers = new Headers({
      "Cache-Control": "no-store",
      Vary: "Origin",
    });
    if (origin === env.SITE_ORIGIN) {
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
      headers.set(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type"
      );
    }
    const json = (data: unknown, status = 200) =>
      Response.json(data, { status, headers });
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const internal = url.pathname.startsWith("/dispatch/");
    if (internal) {
      if (
        !token ||
        !hexToken.test(env.DISPATCH_TOKEN ?? "") ||
        !equalToken(token, env.DISPATCH_TOKEN)
      )
        return json({ error: "Unauthorized" }, 401);
    } else if (origin !== env.SITE_ORIGIN) {
      return json({ error: "Origin not allowed" }, 403);
    }
    if (!internal && request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (url.pathname === "/config" && request.method === "GET") {
      return env.VAPID_PUBLIC_KEY
        ? json({ publicKey: env.VAPID_PUBLIC_KEY })
        : json({ error: "Notifications unavailable" }, 503);
    }
    if (!token) return json({ error: "Unauthorized" }, 401);

    try {
      if (url.pathname === "/dispatch/devices" && request.method === "GET") {
        const after = url.searchParams.get("after") ?? "";
        if (after && !hexToken.test(after))
          return json({ error: "Invalid cursor" }, 400);
        const { results } = await env.DB.prepare(
          "SELECT * FROM watchlists WHERE id > ? ORDER BY id LIMIT 25"
        )
          .bind(after)
          .all<DeviceRow>();
        return json(
          results.map(row => ({
            ...row,
            subscription: JSON.parse(row.subscription) as Subscription,
            watches: JSON.parse(row.watches) as Watch[],
            evaluation: JSON.parse(row.evaluation) as Evaluation,
          }))
        );
      }
      if (internal && request.method === "PUT") {
        const id = url.pathname.match(
          /^\/dispatch\/devices\/([a-f0-9]{64})$/
        )?.[1];
        const update = dispatchUpdateSchema.safeParse(await readJson(request));
        if (!id || !update.success)
          return json({ error: "Invalid dispatch update" }, 400);
        const { revision, evaluation } = update.data;
        const next = crypto.randomUUID();
        const result =
          evaluation === null
            ? await env.DB.prepare(
                "DELETE FROM watchlists WHERE id = ? AND revision = ?"
              )
                .bind(id, revision)
                .run()
            : await env.DB.prepare(
                "UPDATE watchlists SET revision = ?, evaluation = ? WHERE id = ? AND revision = ?"
              )
                .bind(next, JSON.stringify(evaluation), id, revision)
                .run();
        return result.meta.changes
          ? json({ revision: next })
          : json({ error: "Watchlist changed" }, 409);
      }
      if (url.pathname !== "/watchlist")
        return json({ error: "Not found" }, 404);
      const id = await digest(token);
      const row = await env.DB.prepare("SELECT * FROM watchlists WHERE id = ?")
        .bind(id)
        .first<DeviceRow>();
      if (request.method === "GET") {
        return json({
          revision: row?.revision ?? null,
          watches: row ? JSON.parse(row.watches) : [],
        });
      }
      if (request.method !== "PUT")
        return json({ error: "Method not allowed" }, 405);
      const parsed = updateWatchesSchema.safeParse(await readJson(request));
      if (!parsed.success) return json({ error: "Invalid watchlist" }, 400);
      const { revision, watches } = parsed.data;
      if (revision !== (row?.revision ?? null))
        return json({ error: "Watchlist changed; reload and try again" }, 409);
      if (!watches.length) {
        if (row) {
          const removed = await env.DB.prepare(
            "DELETE FROM watchlists WHERE id = ? AND revision = ?"
          )
            .bind(id, revision)
            .run();
          if (!removed.meta.changes)
            return json(
              { error: "Watchlist changed; reload and try again" },
              409
            );
        }
        return json({ revision: null, watches: [] });
      }
      const next = crypto.randomUUID();
      const subscription =
        parsed.data.subscription ??
        (row
          ? subscriptionSchema.parse(JSON.parse(row.subscription))
          : undefined);
      if (!subscription)
        return json({ error: "Missing push subscription" }, 400);
      const encoded = JSON.stringify(subscription);
      if (!row) {
        const result = await env.DB.prepare(
          "INSERT OR IGNORE INTO watchlists (id, revision, endpoint, subscription, watches, evaluation) SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM watchlists) < 500"
        )
          .bind(
            id,
            next,
            subscription.endpoint,
            encoded,
            JSON.stringify(watches),
            JSON.stringify(empty)
          )
          .run();
        if (!result.meta.changes)
          return json(
            {
              error:
                "Notification device already registered or service is full",
            },
            409
          );
      } else {
        const old = JSON.parse(row.watches) as Watch[];
        const same = new Set(
          watches
            .filter(watch =>
              old.some(
                previous =>
                  previous.offerId === watch.offerId &&
                  previous.price === watch.price &&
                  previous.restock === watch.restock
              )
            )
            .map(watch => watch.offerId)
        );
        const previous = JSON.parse(row.evaluation) as Evaluation;
        const evaluation =
          row.subscription === encoded
            ? {
                observed: previous.observed.filter(item =>
                  same.has(item.offerId)
                ),
                pending: previous.pending.filter(item =>
                  same.has(item.offerId)
                ),
              }
            : empty;
        const result = await env.DB.prepare(
          "UPDATE OR IGNORE watchlists SET revision = ?, endpoint = ?, subscription = ?, watches = ?, evaluation = ? WHERE id = ? AND revision = ?"
        )
          .bind(
            next,
            subscription.endpoint,
            encoded,
            JSON.stringify(watches),
            JSON.stringify(evaluation),
            id,
            revision
          )
          .run();
        if (!result.meta.changes)
          return json(
            { error: "Watchlist changed; reload and try again" },
            409
          );
      }
      return json({ revision: next, watches });
    } catch {
      return json({ error: "Watchlists temporarily unavailable" }, 503);
    }
  },
};
