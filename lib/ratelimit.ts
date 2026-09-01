import { MemoryRateLimiter } from "./ratelimit/memory";
import { UpstashRateLimiter } from "./ratelimit/upstash";
import { DatabaseRateLimiter } from "./ratelimit/db";
import type { RateLimitResult } from "./ratelimit/types";

export type { RateLimiter, RateLimitResult } from "./ratelimit/types";
export { MemoryRateLimiter } from "./ratelimit/memory";
export { UpstashRateLimiter } from "./ratelimit/upstash";

/**
 * The process-wide limiter. To go multi-instance, swap this for an
 * UpstashRateLimiter (and make callers await — see middleware below).
 */
const memoryLimiter = new MemoryRateLimiter();
const sharedLimiter = new UpstashRateLimiter();
const databaseLimiter = new DatabaseRateLimiter();

/** Backward-compatible sync helper (existing callers). */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now?: number,
): RateLimitResult {
  return memoryLimiter.check(key, limit, windowMs, now);
}

/** Async shared-store helper for routes that need multi-instance limits. */
export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  // Unit tests intentionally run without a real database. Keep their limiter
  // deterministic and in-memory; production/preview use the shared store.
  if (process.env.NODE_ENV === "test") {
    return memoryLimiter.check(key, limit, windowMs);
  }

  if (sharedLimiter.configured) {
    try {
      return await sharedLimiter.check(key, limit, windowMs);
    } catch (error) {
      console.error("[ratelimit] Upstash unavailable; trying database limiter:", error);
    }
  }

  try {
    return await databaseLimiter.check(key, limit, windowMs);
  } catch (error) {
    // Availability fallback only. The primary production path is now shared
    // (Upstash or Postgres), so normal Vercel scaling cannot bypass limits.
    console.error("[ratelimit] shared limiter unavailable; using memory fallback:", error);
    return memoryLimiter.check(key, limit, windowMs);
  }
}

/** Test helper. */
export function resetRateLimits(): void {
  memoryLimiter.reset();
}

/**
 * Shared route middleware: returns a 429 Response when over the limit, or null
 * to continue. Used by all rate-limited API routes for consistent behavior.
 */
export async function rateLimitResponse(
  key: string,
  limit: number,
  windowMs: number,
): Promise<Response | null> {
  const result = await rateLimitAsync(key, limit, windowMs);
  if (result.ok) return null;
  return new Response("Too many requests. Please wait.", {
    status: 429,
    headers: { "Retry-After": String(Math.ceil((result.retryAfterMs ?? 1000) / 1000)) },
  });
}
