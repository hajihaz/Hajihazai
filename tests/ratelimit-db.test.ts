import { describe, it, expect, vi } from "vitest";

describe("database rate-limit cleanup", () => {
  it("deletes only expired buckets and bounds each cleanup batch", async () => {
    vi.resetModules();
    const execute = vi.fn().mockResolvedValue(undefined);
    const { cleanupExpiredRateLimitBuckets } = await import("@/lib/ratelimit/db");
    await cleanupExpiredRateLimitBuckets({ execute }, new Date("2026-09-04T00:00:00.000Z"));

    expect(execute).toHaveBeenCalledTimes(1);
    const query = execute.mock.calls[0][0] as { queryChunks: Array<{ value?: string[] }> };
    const sqlText = query.queryChunks
      .flatMap((chunk) => chunk.value ?? [])
      .join(" ");
    expect(sqlText).toContain('DELETE FROM "rate_limit_buckets"');
    expect(sqlText).toContain('"expires_at" <=');
    expect(sqlText).toContain("LIMIT");
    expect(sqlText).not.toContain('"expires_at" >');
  });
});
