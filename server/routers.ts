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
  }),
});

export type AppRouter = typeof appRouter;
