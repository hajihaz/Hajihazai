import type { RateLimiter, RateLimitResult } from "./types";

/** Shared fixed-window limiter backed by Upstash Redis REST.
 * Falls back to the local limiter only when the shared service is not configured
 * or temporarily unavailable; this keeps the app fail-open for availability.
 */
export class UpstashRateLimiter implements RateLimiter {
  private readonly url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  private readonly token = process.env.UPSTASH_REDIS_REST_TOKEN;

  get configured(): boolean {
    return Boolean(this.url && this.token);
  }

  async check(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    if (!this.url || !this.token) throw new Error("Upstash is not configured");
    const bucket = Math.floor(Date.now() / windowMs);
    const redisKey = `hh:rl:${key}:${bucket}`;
    const response = await fetch(`${this.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", redisKey],
        ["EXPIRE", redisKey, Math.max(1, Math.ceil(windowMs / 1000))],
      ]),
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) throw new Error(`Upstash HTTP ${response.status}`);
    const data = (await response.json()) as Array<{ result?: number }>;
    const count = Number(data?.[0]?.result ?? 0);
    return count > limit
      ? { ok: false, remaining: 0, retryAfterMs: windowMs - (Date.now() % windowMs) }
      : { ok: true, remaining: Math.max(0, limit - count) };
  }

  reset(): void { /* Redis state expires naturally; tests should use a dedicated keyspace. */ }
}
