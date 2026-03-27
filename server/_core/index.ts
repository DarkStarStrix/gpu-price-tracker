import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import rateLimit from "express-rate-limit";
import Stripe from "stripe";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startPoller } from "../poller";
import { upsertSubscription } from "../subscription";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => { server.close(() => resolve(true)); });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

// ─── Rate limiters ────────────────────────────────────────────────────────────

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

const settingsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many settings requests. Please wait." },
});

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.set("trust proxy", 1);

  // ── Stripe webhook — MUST be registered before express.json() ────────────────
  // Stripe requires the raw body for signature verification.
  // Lazy init: only create the Stripe client if the key is present so the
  // server starts cleanly on Railway even before the secret is configured.
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const stripe = stripeKey
    ? new Stripe(stripeKey, { apiVersion: "2026-03-25.dahlia" })
    : null;

  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
     async (req, res) => {
      if (!stripe) {
        return res.status(503).json({ error: "Stripe not configured" });
      }
      const sig = req.headers["stripe-signature"] as string;
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
      } catch (err: any) {
        console.error("[Webhook] Signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      console.log(`[Webhook] Event: ${event.type} (${event.id})`);

      // Test event passthrough — required for Stripe webhook verification
      if (event.id.startsWith("evt_test_")) {
        console.log("[Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      try {
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = parseInt(session.metadata?.user_id ?? "0");
            if (!userId) break;

            // Fetch full subscription from Stripe to get period end
            let periodEnd: Date | null = null;
            if (session.subscription && stripe) {
              const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);
              // billing_cycle_anchor is the next renewal date in Stripe v21
              periodEnd = new Date((stripeSub.billing_cycle_anchor + 30 * 24 * 60 * 60) * 1000);
            }

            await upsertSubscription({
              userId,
              plan: "pro",
              status: "active",
              stripeCustomerId: session.customer as string,
              stripeSubscriptionId: session.subscription as string,
              currentPeriodEnd: periodEnd ?? undefined,
            });

            console.log(`[Webhook] User ${userId} upgraded to Pro`);
            break;
          }
          case "customer.subscription.updated": {
            const stripeSub = event.data.object as Stripe.Subscription;
            const customerId = stripeSub.customer as string;
            const status = stripeSub.status;
            const periodEnd = new Date((stripeSub.billing_cycle_anchor + 30 * 24 * 60 * 60) * 1000);

            // Find user by stripeCustomerId — we need the DB
            const { getDb } = await import("../db");
            const { subscriptions } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            const db = await getDb();
            if (db) {
              await db.update(subscriptions)
                .set({
                  status,
                  plan: (status === "active" || status === "trialing") ? "pro" : "free",
                  currentPeriodEnd: periodEnd,
                  updatedAt: new Date(),
                })
                .where(eq(subscriptions.stripeCustomerId, customerId));
            }
            console.log(`[Webhook] Subscription updated for customer ${customerId}: ${status}`);
            break;
          }

          case "customer.subscription.deleted": {
            const stripeSub = event.data.object as Stripe.Subscription;
            const customerId = stripeSub.customer as string;

            const { getDb } = await import("../db");
            const { subscriptions } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            const db = await getDb();
            if (db) {
              await db.update(subscriptions)
                .set({ plan: "free", status: "cancelled", updatedAt: new Date() })
                .where(eq(subscriptions.stripeCustomerId, customerId));
            }
            console.log(`[Webhook] Subscription cancelled for customer ${customerId}`);
            break;
          }

          default:
            console.log(`[Webhook] Unhandled event type: ${event.type}`);
        }
      } catch (err) {
        console.error("[Webhook] Handler error:", err);
        return res.status(500).send("Webhook handler error");
      }

      res.json({ received: true });
    }
  );

  // ── Regular middleware (after webhook) ───────────────────────────────────────

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // Security headers
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // ── Health check (Railway uses this to verify the service is up) ──────────────
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.use("/api/trpc", apiLimiter);
  app.use("/api/trpc/settings.saveApiKeys", settingsLimiter);

  registerOAuthRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[tRPC] Internal error on ${path}:`, error);
        }
      },
    })
  );

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);

  // Bind to 0.0.0.0 so Railway's proxy can reach the service
  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${port}/`);
    startPoller();
  });
}

startServer().catch(console.error);
