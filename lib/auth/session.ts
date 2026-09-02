import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

/**
 * Mints an Auth.js-compatible DATABASE session for username/password login.
 *
 * The app uses the database session strategy (so Google + the Drizzle adapter
 * keep working). Rather than switch to JWT — which would invalidate every
 * existing user's session — credential login inserts a session row and sets
 * the same cookie the adapter validates, so auth() recognises it natively.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sessionCookieName(secure: boolean): string {
  return secure ? "__Secure-authjs.session-token" : "authjs.session-token";
}

export function isSecureRequest(req: Request): boolean {
  if ((process.env.AUTH_URL ?? "").startsWith("https://")) return true;
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function getCurrentSessionToken(): Promise<string | null> {
  const store = await cookies();
  return (
    store.get("__Secure-authjs.session-token")?.value ??
    store.get("authjs.session-token")?.value ??
    null
  );
}

export async function createUserSession(userId: string, secure: boolean): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ sessionToken: token, userId, expires });
  const store = await cookies();
  store.set(sessionCookieName(secure), token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    expires,
  });
}
