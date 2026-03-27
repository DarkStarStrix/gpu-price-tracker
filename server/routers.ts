import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import {
  getAllOffers,
  getOffersByGpu,
  getMarketStats,
  getPriceHistory,
  getSparklineData,
  getLastPollStatus,
  getProviderPollStatus,
} from "./db";

// ─── Input validators ─────────────────────────────────────────────────────────

// API keys: printable ASCII only, 8–256 chars (covers all real provider key formats)
const apiKeySchema = z
  .string()
  .min(8, "Key too short")
  .max(256, "Key too long")
  .regex(/^[\x20-\x7E]+$/, "Key contains invalid characters");

const optionalApiKeySchema = z.union([
  apiKeySchema,
  z.literal(""),   // empty string = clear the key
]).optional();

const gpuModelIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9\-]+$/, "Invalid GPU model ID");

// ─── Safe error helper ────────────────────────────────────────────────────────
// Never leak internal error details (stack traces, DB errors, env values) to the client.

function safeError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;
  console.error("[Router] Internal error:", err);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "An internal error occurred. Please try again.",
  });
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
  }),

  // ── GPU Offers ───────────────────────────────────────────────────────────────

  gpu: router({
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

    // Cap offerIds to 50 items, each max 128 chars to prevent abuse
    sparklines: publicProcedure
      .input(z.object({
        offerIds: z.array(z.string().max(128)).max(50),
      }))
      .query(async ({ input }) => {
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

  // ── Settings (admin-only) ─────────────────────────────────────────────────
  // apiKeyStatus is public (just booleans — no values exposed).
  // saveApiKeys is admin-only — only the authenticated owner can set keys.

  settings: router({
    // Public: returns true/false per provider — never exposes key values
    apiKeyStatus: publicProcedure.query(() => ({
      lambda: !!process.env.LAMBDA_API_KEY,
      runpod: !!process.env.RUNPOD_API_KEY,
      vastai:  !!process.env.VAST_API_KEY,
    })),

    // Admin-only: validate format, then write to process.env
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
        // Return only boolean status — never echo keys back
        return {
          lambda: !!process.env.LAMBDA_API_KEY,
          runpod: !!process.env.RUNPOD_API_KEY,
          vastai:  !!process.env.VAST_API_KEY,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
