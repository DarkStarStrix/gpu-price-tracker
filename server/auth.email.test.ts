/**
 * Unit tests for email/password auth procedures.
 * Tests the business logic in isolation using mocked DB and SDK.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as bcrypt from "bcryptjs";

// ── Mock DB ───────────────────────────────────────────────────────────────────
const mockInsert  = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
const mockSelect  = vi.fn();
const mockUpdate  = vi.fn().mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }) });
const mockGetDb   = vi.fn();

vi.mock("./db", () => ({ getDb: mockGetDb }));

// ── Mock SDK ──────────────────────────────────────────────────────────────────
vi.mock("./_core/sdk", () => ({
  sdk: {
    createSessionToken: vi.fn().mockResolvedValue("mock-jwt-token"),
  },
}));

// ── Mock cookies ──────────────────────────────────────────────────────────────
vi.mock("./_core/cookies", () => ({
  getSessionCookieOptions: vi.fn().mockReturnValue({ httpOnly: true, sameSite: "lax" }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx() {
  return {
    req: { headers: {} } as any,
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as any,
    user: null,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("email auth — register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new user and sets a session cookie", async () => {
    const fakeUser = {
      id: 1, openId: "email:test@example.com", name: "Test User",
      email: "test@example.com", passwordHash: "hashed", loginMethod: "email",
      role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    };

    // First select (check existing) returns empty; second select (after insert) returns user
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn()
        .mockResolvedValueOnce([])        // no existing user
        .mockResolvedValueOnce([fakeUser]), // user after insert
    };
    mockSelect.mockReturnValue(selectChain);
    mockGetDb.mockResolvedValue({ select: mockSelect, insert: mockInsert, update: mockUpdate });

    const { emailAuthRouter } = await import("./auth");
    const ctx = makeCtx();

    const result = await emailAuthRouter.register._def.resolver({
      input: { name: "Test User", email: "test@example.com", password: "Password123" },
      ctx,
      path: "auth.register",
      type: "mutation",
      rawInput: {},
      meta: undefined,
      signal: undefined,
    } as any);

    expect(result.ok).toBe(true);
    expect(result.name).toBe("Test User");
    expect(ctx.res.cookie).toHaveBeenCalledWith(
      expect.any(String),
      "mock-jwt-token",
      expect.objectContaining({ httpOnly: true })
    );
  });

  it("throws CONFLICT when email already exists", async () => {
    const existingUser = {
      id: 1, openId: "email:taken@example.com", email: "taken@example.com",
      passwordHash: "hash", name: "Existing",
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([existingUser]),
    };
    mockSelect.mockReturnValue(selectChain);
    mockGetDb.mockResolvedValue({ select: mockSelect });

    const { emailAuthRouter } = await import("./auth");
    const ctx = makeCtx();

    await expect(
      emailAuthRouter.register._def.resolver({
        input: { name: "New", email: "taken@example.com", password: "Password123" },
        ctx, path: "auth.register", type: "mutation", rawInput: {}, meta: undefined, signal: undefined,
      } as any)
    ).rejects.toThrow("already exists");
  });
});

describe("email auth — login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs in with correct credentials and sets session cookie", async () => {
    const hash = await bcrypt.hash("correct-password", 10);
    const fakeUser = {
      id: 2, openId: "email:user@example.com", name: "User",
      email: "user@example.com", passwordHash: hash, loginMethod: "email",
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([fakeUser]),
    };
    mockSelect.mockReturnValue(selectChain);
    mockGetDb.mockResolvedValue({ select: mockSelect, update: mockUpdate });

    const { emailAuthRouter } = await import("./auth");
    const ctx = makeCtx();

    const result = await emailAuthRouter.login._def.resolver({
      input: { email: "user@example.com", password: "correct-password" },
      ctx, path: "auth.login", type: "mutation", rawInput: {}, meta: undefined, signal: undefined,
    } as any);

    expect(result.ok).toBe(true);
    expect(ctx.res.cookie).toHaveBeenCalled();
  });

  it("throws UNAUTHORIZED for wrong password", async () => {
    const hash = await bcrypt.hash("real-password", 10);
    const fakeUser = {
      id: 3, openId: "email:user2@example.com", name: "User2",
      email: "user2@example.com", passwordHash: hash,
    };
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([fakeUser]),
    };
    mockSelect.mockReturnValue(selectChain);
    mockGetDb.mockResolvedValue({ select: mockSelect });

    const { emailAuthRouter } = await import("./auth");
    const ctx = makeCtx();

    await expect(
      emailAuthRouter.login._def.resolver({
        input: { email: "user2@example.com", password: "wrong-password" },
        ctx, path: "auth.login", type: "mutation", rawInput: {}, meta: undefined, signal: undefined,
      } as any)
    ).rejects.toThrow("Invalid email or password");
  });

  it("throws UNAUTHORIZED for unknown email", async () => {
    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([]),
    };
    mockSelect.mockReturnValue(selectChain);
    mockGetDb.mockResolvedValue({ select: mockSelect });

    const { emailAuthRouter } = await import("./auth");
    const ctx = makeCtx();

    await expect(
      emailAuthRouter.login._def.resolver({
        input: { email: "nobody@example.com", password: "anything" },
        ctx, path: "auth.login", type: "mutation", rawInput: {}, meta: undefined, signal: undefined,
      } as any)
    ).rejects.toThrow("Invalid email or password");
  });
});
