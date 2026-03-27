/**
 * Tests for GPU tRPC router procedures.
 * Covers: offers list, marketStats, priceHistory, sparklines.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ── Mock DB helpers ──────────────────────────────────────────────────────────

vi.mock("./subscription", async (importOriginal) => {
  const original = await importOriginal<typeof import("./subscription")>();
  return {
    ...original,
    isPro: vi.fn().mockResolvedValue(true),
  };
});

vi.mock("./db", async (importOriginal) => {
  const original = await importOriginal<typeof import("./db")>();
  return {
    ...original,
    getGpuOffers: vi.fn().mockResolvedValue([
      {
        id: 1,
        offerId: "lambda-h100-sxm-us-east",
        providerId: "lambda",
        providerName: "Lambda",
        gpuModelId: "h100-sxm",
        gpuModelName: "H100 SXM",
        gpuCount: 1,
        vramPerGpuGb: 80,
        vcpus: 26,
        ramGb: 200,
        region: "us-east",
        pricePerGpuHr: 2.49,
        totalNodePriceHr: 2.49,
        availability: "available",
        providerLink: "https://lambdalabs.com/service/gpu-cloud",
        cloudType: "dedicated",
        dataSource: "static",
        lastPolledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 2,
        offerId: "runpod-h100-sxm-us",
        providerId: "runpod",
        providerName: "RunPod",
        gpuModelId: "h100-sxm",
        gpuModelName: "H100 SXM",
        gpuCount: 1,
        vramPerGpuGb: 80,
        vcpus: 16,
        ramGb: 128,
        region: "US",
        pricePerGpuHr: 1.99,
        totalNodePriceHr: 1.99,
        availability: "available",
        providerLink: "https://www.runpod.io/gpu-instance/pricing",
        cloudType: "cloud",
        dataSource: "static",
        lastPolledAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
    getPriceHistory: vi.fn().mockResolvedValue([
      {
        id: 1,
        offerId: "lambda-h100-sxm-us-east",
        providerId: "lambda",
        gpuModelId: "h100-sxm",
        pricePerGpuHr: 2.49,
        availability: "available",
        snapshotAt: new Date("2026-03-10T00:00:00Z"),
      },
    ]),
    getMarketStats: vi.fn().mockResolvedValue({
      totalOffers: 36,
      availableOffers: 30,
      providerCount: 6,
      gpuModelCount: 13,
      h100Floor: 1.99,
    }),
  };
});

// ── Context factory ──────────────────────────────────────────────────────────

function makeCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("gpu.offers", () => {
  it("returns a list of GPU offers", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.gpu.offers();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toHaveProperty("offerId");
    expect(result[0]).toHaveProperty("pricePerGpuHr");
    expect(result[0]).toHaveProperty("gpuModelName");
  });
});

describe("gpu.marketStats", () => {
  it("returns market statistics", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.gpu.marketStats();
    expect(result).toHaveProperty("totalOffers");
    expect(result).toHaveProperty("availableOffers");
    expect(result).toHaveProperty("providerCount");
    expect(result).toHaveProperty("gpuModelCount");
    expect(result).toHaveProperty("h100Floor");
    expect(typeof result.h100Floor).toBe("number");
  });
});

describe("gpu.priceHistory", () => {
  it("returns price history for a GPU model", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.gpu.priceHistory({ gpuModelId: "h100-sxm", days: 7 });
    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty("gpuModelId");
      expect(result[0]).toHaveProperty("pricePerGpuHr");
      expect(result[0]).toHaveProperty("snapshotAt");
    }
  });
});

describe("gpu.sparklines", () => {
  it("returns sparkline data as a record keyed by offerId (requires auth)", async () => {
    // sparklines is a protectedProcedure — must pass an authenticated user
    const authCtx: TrpcContext = {
      user: {
        id: 1,
        openId: "test-user",
        name: "Test User",
        email: "test@example.com",
        loginMethod: "manus",
        role: "user" as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(authCtx);
    const result = await caller.gpu.sparklines({ offerIds: ["lambda-h100-sxm-us-east", "runpod-h100-sxm-us"] });
    expect(typeof result).toBe("object");
    expect(result).not.toBeNull();
  });
});
