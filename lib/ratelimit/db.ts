import { eq, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import type { RateLimiter, RateLimitResult } from "./types";

/**
 * Shared fixed-window limiter backed by the same Postgres/Neon database as the
 * application. The upsert is atomic, so concurrent Vercel instances cannot each
 * admit the same request count independently.
 */
const CLEANUP_SAMPLE_RATE = 0.02;
const CLEANUP_BATCH_SIZE = 100;

/** Delete only expired buckets, in small batches, so inactive keys cannot grow the table forever. */
export async function cleanupExpiredRateLimitBuckets(db: { execute: (query: string | SQLWrapper) => unknown }, now = new Date()) {
  await db.execute(sql`
    DELETE FROM "rate_limit_buckets"
    WHERE "bucket_key" IN (
      SELECT "bucket_key"
      FROM "rate_limit_buckets"
      WHERE "expires_at" <= ${now}
      ORDER BY "expires_at" ASC
      LIMIT ${CLEANUP_BATCH_SIZE}
    )
  `);
}

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

    if (Math.random() < CLEANUP_SAMPLE_RATE) {
      void cleanupExpiredRateLimitBuckets(db, new Date(now)).catch(() => undefined);
    }

    const count = row?.count ?? limit + 1;
    return count > limit
      ? { ok: false, remaining: 0, retryAfterMs: Math.max(1, expiresAt.getTime() - Date.now()) }
      : { ok: true, remaining: Math.max(0, limit - count) };
  }

  reset(): void {
    // Shared state is time-bucketed and must not be cleared globally by tests.
  }
}
