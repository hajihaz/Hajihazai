import { describe, it, expect, beforeEach } from "vitest";
import {
  rateLimit,
  resetRateLimits,
  rateLimitResponse,
  rateLimitAsync,
  MemoryRateLimiter,
} from "@/lib/ratelimit";

describe("rate limiter (memory)", () => {
  beforeEach(() => resetRateLimits());

  it("allows up to the limit then blocks", () => {
    const now = 1000;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit("k", 5, 60_000, now).ok).toBe(true);
    }
    const blocked = rateLimit("k", 5, 60_000, now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("resets after the window passes", () => {
    const now = 1000;
    for (let i = 0; i < 5; i++) rateLimit("k2", 5, 60_000, now);
    expect(rateLimit("k2", 5, 60_000, now).ok).toBe(false);
    expect(rateLimit("k2", 5, 60_000, now + 60_001).ok).toBe(true);
  });

  it("keeps keys independent", () => {
    const now = 1000;
    for (let i = 0; i < 5; i++) rateLimit("a", 5, 60_000, now);
    expect(rateLimit("b", 5, 60_000, now).ok).toBe(true);
  });
});

describe("rateLimitAsync fallback", () => {
  it("uses memory when Upstash is not configured", async () => {
    expect((await rateLimitAsync("async", 1, 60_000)).ok).toBe(true);
    expect((await rateLimitAsync("async", 1, 60_000)).ok).toBe(false);
  });
});

describe("MemoryRateLimiter (abstraction)", () => {
  it("implements the RateLimiter interface", () => {
    const rl = new MemoryRateLimiter();
    const now = 1000;
    expect(rl.check("x", 1, 1000, now).ok).toBe(true);
    expect(rl.check("x", 1, 1000, now).ok).toBe(false);
    rl.reset();
    expect(rl.check("x", 1, 1000, now).ok).toBe(true);
  });
});

describe("rateLimitResponse middleware", () => {
  beforeEach(() => resetRateLimits());

  it("returns null while under the limit", async () => {
    expect(await rateLimitResponse("m", 2, 60_000)).toBeNull();
  });

  it("returns a 429 with Retry-After when over the limit", async () => {
    await rateLimitResponse("m2", 1, 60_000); // consume
    const res = await rateLimitResponse("m2", 1, 60_000);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect(res!.headers.get("Retry-After")).toBeTruthy();
  });
});
