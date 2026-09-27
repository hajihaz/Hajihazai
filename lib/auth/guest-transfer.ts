import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/lib/db";
import { conversations, users } from "@/lib/db/schema";

const GUEST_SUFFIX = "@guest.hajihaz.ai";
const TOKEN_TTL_MS = 15 * 60_000;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is required for guest transfer");
  return value;
}

function signature(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createGuestTransferToken(guestUserId: string) {
  const payload = Buffer.from(JSON.stringify({ guestUserId, expires: Date.now() + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyGuestTransferToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [payload, supplied] = token.split(".");
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof parsed.guestUserId !== "string" || typeof parsed.expires !== "number" || parsed.expires < Date.now()) return null;
    return parsed.guestUserId;
  } catch {
    return null;
  }
}

/** Move guest chats to the authenticated account. Idempotent and guest-only. */
export async function transferGuestConversations(guestUserId: string | null | undefined, targetUserId: string) {
  if (!guestUserId || guestUserId === targetUserId) return 0;
  const [guest] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, guestUserId), like(users.email, `%${GUEST_SUFFIX}`))).limit(1);
  if (!guest) return 0;
  const moved = await db.update(conversations).set({ userId: targetUserId, updatedAt: new Date() }).where(eq(conversations.userId, guestUserId)).returning({ id: conversations.id });
  return moved.length;
}
