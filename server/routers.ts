import Stripe from "stripe";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import { emailAuthRouter } from "./auth";
import {
  getAllOffers,
  getOffersByGpu,
  getMarketStats,
  getPriceHistory,
  getSparklineData,
  getLastPollStatus,
  getProviderPollStatus,
} from "./db";
import { getSubscription, upsertSubscription, isPro } from "./subscription";
import { PLANS } from "./products";

// ─── Stripe client (lazy — null when key absent so server starts without it) ───────

const _stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = _stripeKey
  ? new Stripe(_stripeKey, { apiVersion: "2026-03-25.dahlia" })
  : null;

// ─── Input validators ─────────────────────────────────────────────────────────

const apiKeySchema = z.string().min(8).max(256).regex(/^[\x20-\x7E]+$/, "Invalid key format");
const optionalApiKeySchema = z.union([apiKeySchema, z.literal("")]).optional();
const gpuModelIdSchema = z.string().min(1).max(64).regex(/^[a-z0-9\-]+$/);

// ─── Safe error helper ────────────────────────────────────────────────────────

function safeError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;
  console.error("[Router] Internal error:", err);
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "An internal error occurred." });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    // Email/password auth — works on Railway without Manus OAuth
    register: emailAuthRouter.register,
    login:    emailAuthRouter.login,
  }),

  // ── GPU Offers ───────────────────────────────────────────────────────────────
  // Free: offers (first 10), marketStats, priceHistory
  // Pro: full offers, comparison, sparklines, CSV (gated on frontend via plan flag)

  gpu: router({
    // Returns all offers — frontend slices to 10 for free users
    offers: publicProcedure.query(async () => {
      try { return await getAllOffers(); }
      catch (e) { throw safeError(e); }
    }),

    offersByModel: publicProcedure
      .input(z.object({ gpuModelId: gpuModelIdSchema }))
      .query(async ({ input }) => {
        try { return await getOffersByGpu(input.gpuModelId); }
        catch (e) { throw safeError(e); }
      }),

    marketStats: publicProcedure.query(async () => {
      try { return await getMarketStats(); }
      catch (e) { throw safeError(e); }
    }),

    priceHistory: publicProcedure
      .input(z.object({
        gpuModelId: gpuModelIdSchema,
        days: z.number().int().min(1).max(30).optional().default(7),
      }))
      .query(async ({ input }) => {
        try { return await getPriceHistory(input.gpuModelId, input.days); }
        catch (e) { throw safeError(e); }
      }),

    // Pro-only: sparklines
    sparklines: protectedProcedure
      .input(z.object({ offerIds: z.array(z.string().max(128)).max(50) }))
      .query(async ({ input, ctx }) => {
        if (!(await isPro(ctx.user.id))) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Pro plan required." });
        }
        try { return await getSparklineData(input.offerIds); }
        catch (e) { throw safeError(e); }
      }),

    pollStatus: publicProcedure.query(async () => {
      try { return await getLastPollStatus(); }
      catch (e) { throw safeError(e); }
    }),

    providerPollStatus: publicProcedure.query(async () => {
      try { return await getProviderPollStatus(); }
      catch (e) { throw safeError(e); }
    }),
  }),

  // ── Subscription ─────────────────────────────────────────────────────────────

  subscription: router({
    // Current user's plan — public returns "free" for unauthenticated
    myPlan: publicProcedure.query(async ({ ctx }) => {
      if (!ctx.user) return { plan: "free" as const, status: "active", isPro: false };
      const sub = await getSubscription(ctx.user.id);
      const proActive = await isPro(ctx.user.id);
      return {
        plan: sub?.plan ?? "free",
        status: sub?.status ?? "active",
        isPro: proActive,
        currentPeriodEnd: sub?.currentPeriodEnd ?? null,
      };
    }),

    // Create Stripe checkout session for Pro upgrade
    createCheckout: protectedProcedure.mutation(async ({ ctx }) => {
      const origin = ctx.req.headers.origin as string ?? "http://localhost:3000";
      const priceId = PLANS.pro.stripePriceId;

      if (!priceId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Pro plan not configured yet." });
      }

      if (!stripe) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment not configured." });
      try {
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
          line_items: [{ price: priceId, quantity: 1 }],
          allow_promotion_codes: true,
          customer_email: ctx.user.email ?? undefined,
          client_reference_id: ctx.user.id.toString(),
          metadata: {
            user_id: ctx.user.id.toString(),
            customer_email: ctx.user.email ?? "",
            customer_name: ctx.user.name ?? "",
          },
          success_url: `${origin}/?upgraded=1`,
          cancel_url: `${origin}/pricing?cancelled=1`,
        });

        return { url: session.url };
      } catch (e) { throw safeError(e); }
    }),

    // Create Stripe billing portal session for managing/cancelling subscription
    createPortal: protectedProcedure.mutation(async ({ ctx }) => {
      const origin = ctx.req.headers.origin as string ?? "http://localhost:3000";
      const sub = await getSubscription(ctx.user.id);

      if (!sub?.stripeCustomerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No active subscription found." });
      }

      if (!stripe) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Payment not configured." });
      try {
        const session = await stripe.billingPortal.sessions.create({
          customer: sub.stripeCustomerId,
          return_url: `${origin}/account`,
        });
        return { url: session.url };
      } catch (e) { throw safeError(e); }
    }),
  }),

  // ── Settings (admin-only) ─────────────────────────────────────────────────

  settings: router({
    apiKeyStatus: publicProcedure.query(() => ({
      lambda: !!process.env.LAMBDA_API_KEY,
      runpod: !!process.env.RUNPOD_API_KEY,
      vastai:  !!process.env.VAST_API_KEY,
    })),

    saveApiKeys: adminProcedure
      .input(z.object({
        lambda: optionalApiKeySchema,
        runpod: optionalApiKeySchema,
        vastai:  optionalApiKeySchema,
      }))
      .mutation(({ input }) => {
        if (input.lambda !== undefined) {
          if (input.lambda) process.env.LAMBDA_API_KEY = input.lambda;
          else delete process.env.LAMBDA_API_KEY;
        }
        if (input.runpod !== undefined) {
          if (input.runpod) process.env.RUNPOD_API_KEY = input.runpod;
          else delete process.env.RUNPOD_API_KEY;
        }
        if (input.vastai !== undefined) {
          if (input.vastai) process.env.VAST_API_KEY = input.vastai;
          else delete process.env.VAST_API_KEY;
        }
        return {
          lambda: !!process.env.LAMBDA_API_KEY,
          runpod: !!process.env.RUNPOD_API_KEY,
          vastai:  !!process.env.VAST_API_KEY,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
