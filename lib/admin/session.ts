import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import { adminSessions } from "@/lib/db/schema";

/**
 * Admin portal sessions — fully isolated from user auth. The admin portal is
 * reachable by anyone, but only valid admin credentials mint an admin session
 * (separate cookie + table). No user session ever grants admin access.
 */

const ADMIN_COOKIE = "hh_admin_session";
const ADMIN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

export async function createAdminSession(
  adminId: string,
  secure: boolean,
): Promise<void> {
  // Admin logins are infrequent; reclaim expired sessions using the indexed
  // expiry column without touching any still-valid admin session.
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ADMIN_TTL_MS);
  await db.insert(adminSessions).values({ token, adminId, expiresAt });
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    secure,
    expires: expiresAt,
  });
}

export async function getAdminSession(): Promise<{ adminId: string } | null> {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select()
    .from(adminSessions)
    .where(eq(adminSessions.token, token));
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(adminSessions).where(eq(adminSessions.token, token));
    return null;
  }
  return { adminId: row.adminId };
}

/** Returns the admin session or null — use to guard every admin route. */
export async function requireAdmin(): Promise<{ adminId: string } | null> {
  return getAdminSession();
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (token) {
    await db.delete(adminSessions).where(eq(adminSessions.token, token));
  }
  store.delete(ADMIN_COOKIE);
}
