import { inArray, sql } from "drizzle-orm";
import type { ModelHealth } from "./health";

/**
 * Distributed model-health persistence. The local Map remains the hot path;
 * this store makes failures/successes visible across Vercel instances.
 */

const SHARED_HEALTH_TTL_MS = 5 * 60_000;

function enabled(): boolean {
  return process.env.NODE_ENV !== "test" && Boolean(process.env.DATABASE_URL);
}

export async function persistSharedHealth(health: ModelHealth): Promise<void> {
  if (!enabled()) return;

  const [{ db }, { aiModelHealth }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema"),
  ]);

  await db
    .insert(aiModelHealth)
    .values({
      modelId: health.modelId,
      healthy: health.healthy,
      checkedAt: new Date(health.checkedAt),
      latencyMs: health.latencyMs ?? null,
      error: health.error?.slice(0, 2000) ?? null,
      retryAfterMs: health.retryAfterMs ?? null,
      unhealthyUntil: health.unhealthyUntil ? new Date(health.unhealthyUntil) : null,
    })
    .onConflictDoUpdate({
      target: aiModelHealth.modelId,
      set: {
        healthy: sql`excluded.healthy`,
        checkedAt: sql`excluded.checked_at`,
        latencyMs: sql`excluded.latency_ms`,
        error: sql`excluded.error`,
        retryAfterMs: sql`excluded.retry_after_ms`,
        unhealthyUntil: sql`excluded.unhealthy_until`,
      },
      // Never let an older async write overwrite newer provider state.
      setWhere: sql`${aiModelHealth.checkedAt} <= excluded.checked_at`,
    });
}

export async function loadSharedHealth(
  modelIds: string[],
  apply: (health: ModelHealth) => void,
): Promise<void> {
  if (!enabled() || modelIds.length === 0) return;

  const [{ db }, { aiModelHealth }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/db/schema"),
  ]);

  const rows = await db
    .select()
    .from(aiModelHealth)
    .where(inArray(aiModelHealth.modelId, modelIds));

  const now = Date.now();
  for (const row of rows) {
    const checkedAt = row.checkedAt.getTime();
    const expiresAt = row.unhealthyUntil?.getTime() ?? checkedAt + SHARED_HEALTH_TTL_MS;
    if (expiresAt < now) continue;
    apply({
      modelId: row.modelId,
      healthy: row.healthy,
      checkedAt,
      latencyMs: row.latencyMs ?? undefined,
      error: row.error ?? undefined,
      retryAfterMs: row.retryAfterMs ?? undefined,
      unhealthyUntil: row.unhealthyUntil?.getTime(),
    });
  }
}
