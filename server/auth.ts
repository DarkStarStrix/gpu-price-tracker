/**
 * Email/password auth procedures.
 * Works standalone on Railway — no Manus OAuth required.
 * Session cookie is the same JWT used by the Manus OAuth path,
 * so useAuth() / trpc.auth.me works identically on both.
 */

import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import { router, publicProcedure } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

const SALT_ROUNDS = 12;

// ── helpers ──────────────────────────────────────────────────────────────────

async function findUserByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

async function createEmailUser(name: string, email: string, passwordHash: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  // openId for email users is "email:<email>" — unique and stable
  const openId = `email:${email}`;
  await db.insert(users).values({
    openId,
    name,
    email,
    passwordHash,
    loginMethod: "email",
    lastSignedIn: new Date(),
  });
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0]!;
}

async function issueSessionCookie(
  res: import("express").Response,
  req: import("express").Request,
  user: { openId: string; name: string | null }
) {
  const token = await sdk.createSessionToken(user.openId, {
    name: user.name ?? "",
    expiresInMs: ONE_YEAR_MS,
  });
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

// ── router ────────────────────────────────────────────────────────────────────

export const emailAuthRouter = router({

  /** Register a new account with email + password */
  register: publicProcedure
    .input(z.object({
      name:     z.string().min(1).max(100).trim(),
      email:    z.string().email().toLowerCase().trim(),
      password: z.string().min(8).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      const existing = await findUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "An account with this email already exists." });
      }
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      const user = await createEmailUser(input.name, input.email, passwordHash);
      await issueSessionCookie(ctx.res, ctx.req, user);
      return { ok: true, name: user.name };
    }),

  /** Sign in with email + password */
  login: publicProcedure
    .input(z.object({
      email:    z.string().email().toLowerCase().trim(),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await findUserByEmail(input.email);
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      }
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password." });
      }
      // Update lastSignedIn
      const db = await getDb();
      if (db) await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
      await issueSessionCookie(ctx.res, ctx.req, user);
      return { ok: true, name: user.name };
    }),
});
