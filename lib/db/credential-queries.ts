import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import { userProfiles, users, passwordResetTokens, sessions, type UserProfile } from "./schema";

/** Username/password credentials + password-reset token data layer. */

export function isUniqueViolation(err: unknown): boolean {
  let e = err as { code?: string; message?: string; cause?: unknown } | null;
  for (let i = 0; i < 5 && e; i++) {
    if (e.code === "23505") return true;
    if (/duplicate key|unique constraint/i.test(String(e.message ?? ""))) return true;
    e = e.cause as typeof e;
  }
  return false;
}

/** Find a profile by username OR email (case-insensitive) for login/reset. */
export async function getLoginProfile(
  identifier: string,
): Promise<UserProfile | null> {
  const id = identifier.trim();
  if (!id) return null;
  const [row] = await db
    .select()
    .from(userProfiles)
    .where(
      sql`lower(${userProfiles.email}) = lower(${id}) OR lower(${userProfiles.username}) = lower(${id})`,
    )
    .limit(1);
  return row ?? null;
}

/** Revoke all sessions for a user except the currently presented token.
 * Used after password changes so previously issued sessions cannot remain valid.
 */
export async function revokeOtherSessions(userId: string, currentSessionToken?: string | null): Promise<void> {
  await db
    .delete(sessions)
    .where(
      currentSessionToken
        ? and(eq(sessions.userId, userId), sql`${sessions.sessionToken} <> ${currentSessionToken}`)
        : eq(sessions.userId, userId),
    );
}

export async function setUserPassword(
  userId: string,
  passwordHash: string,
): Promise<UserProfile | null> {
  const [row] = await db
    .update(userProfiles)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId))
    .returning();
  return row ?? null;
}

/** Create a brand-new username/password user (auth user + profile). */
export async function createPasswordUser(input: {
  username: string;
  email: string;
  passwordHash: string;
}): Promise<
  { ok: true; userId: string } | { ok: false; error: "taken" }
> {
  try {
    const [u] = await db
      .insert(users)
      .values({ email: input.email, name: input.username })
      .returning();
    await db.insert(userProfiles).values({
      userId: u.id,
      email: input.email,
      username: input.username,
      passwordHash: input.passwordHash,
    });
    return { ok: true, userId: u.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: "taken" };
    throw err;
  }
}

/** Change a user's username (case-insensitive uniqueness enforced by DB index). */
export async function updateUsername(
  userId: string,
  username: string,
): Promise<{ ok: true } | { ok: false; error: "taken" }> {
  try {
    await db
      .update(userProfiles)
      .set({ username, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
    return { ok: true };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: "taken" };
    throw err;
  }
}

export async function createResetToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<void> {
  await db.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
}

/**
 * Atomically validate + consume a reset token. The UPDATE predicate makes the
 * token single-use even when two reset requests arrive concurrently.
 */
export async function consumeResetToken(tokenHash: string): Promise<string | null> {
  const now = new Date();
  const [row] = await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now),
      ),
    )
    .returning({ userId: passwordResetTokens.userId });
  return row?.userId ?? null;
}
