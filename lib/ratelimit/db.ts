import { eq, sql } from "drizzle-orm";
import type { RateLimiter, RateLimitResult } from "./types";

/**
 * Shared fixed-window limiter backed by the same Postgres/Neon database as the
 * application. The upsert is atomic, so concurrent Vercel instances cannot each
 * admit the same request count independently.
 */
export class DatabaseRateLimiter implements RateLimiter {
  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    // Lazy-load DB modules so unit tests can use the in-memory limiter without
    // constructing a Neon client against a dummy test DATABASE_URL.
    const [{ db }, { rateLimitBuckets }] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/db/schema"),
    ]);

    const now = Date.now();
    const bucket = Math.floor(now / windowMs);
    const bucketKey = `${key}:${bucket}`;
    const expiresAt = new Date((bucket + 1) * windowMs);

    // Remove the immediately previous bucket for this key. This keeps the table
    // bounded for active keys without requiring a second global cleanup job.
    if (bucket > 0) {
      await db
        .delete(rateLimitBuckets)
        .where(eq(rateLimitBuckets.bucketKey, `${key}:${bucket - 1}`));
    }

    const [row] = await db
      .insert(rateLimitBuckets)
      .values({ bucketKey, count: 1, expiresAt })
      .onConflictDoUpdate({
        target: rateLimitBuckets.bucketKey,
        set: { count: sql`${rateLimitBuckets.count} + 1` },
      })
      .returning({ count: rateLimitBuckets.count });

    const count = row?.count ?? limit + 1;
    return count > limit
      ? { ok: false, remaining: 0, retryAfterMs: Math.max(1, expiresAt.getTime() - Date.now()) }
      : { ok: true, remaining: Math.max(0, limit - count) };
  }

  reset(): void {
    // Shared state is time-bucketed and must not be cleared globally by tests.
  }
}
