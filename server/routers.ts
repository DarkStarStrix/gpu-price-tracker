import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import {
  getAllOffers,
  getOffersByGpu,
  getMarketStats,
  getPriceHistory,
  getSparklineData,
  getLastPollStatus,
  getProviderPollStatus,
} from "./db";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  // ── GPU Offers ──────────────────────────────────────────────────────────────────────

  gpu: router({
    offers: publicProcedure.query(async () => getAllOffers()),

    offersByModel: publicProcedure
      .input(z.object({ gpuModelId: z.string() }))
      .query(async ({ input }) => getOffersByGpu(input.gpuModelId)),

    marketStats: publicProcedure.query(async () => getMarketStats()),

    priceHistory: publicProcedure
      .input(z.object({
        gpuModelId: z.string(),
        days: z.number().min(1).max(30).optional().default(7),
      }))
      .query(async ({ input }) => getPriceHistory(input.gpuModelId, input.days)),

    sparklines: publicProcedure
      .input(z.object({ offerIds: z.array(z.string()).max(100) }))
      .query(async ({ input }) => getSparklineData(input.offerIds)),

    pollStatus: publicProcedure.query(async () => getLastPollStatus()),
    providerPollStatus: publicProcedure.query(async () => getProviderPollStatus()),
  }),

  // ── Settings ─────────────────────────────────────────────────────────────────

  settings: router({
    // Return which provider keys are currently configured (true/false, never expose values)
    apiKeyStatus: publicProcedure.query(() => ({
      lambda:  !!process.env.LAMBDA_API_KEY,
      runpod:  !!process.env.RUNPOD_API_KEY,
      vastai:  !!process.env.VAST_API_KEY,
    })),

    // Save API keys to process.env at runtime (persists for the session; user should
    // also set them in the Secrets UI for persistence across restarts)
    saveApiKeys: publicProcedure
      .input(z.object({
        lambda: z.string().optional(),
        runpod: z.string().optional(),
        vastai: z.string().optional(),
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
          vastai: !!process.env.VAST_API_KEY,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
