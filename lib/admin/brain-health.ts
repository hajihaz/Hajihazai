/**
 * Phase 4 — per-brain health: content stats (docs / chunks / embedded %) from
 * the DB joined with usage stats (retrievals, zero-results, avg docs retrieved)
 * from the existing analytics events. Read-only.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type RetrievalEvent } from "./analytics";

export type BrainHealthStatus = "healthy" | "warning" | "needs-review";

export interface BrainHealth {
  brain: string;
  docs: number;
  chunks: number;
  embeddedPct: number;
  retrievals: number;
  zeroResults: number;
  zeroResultPct: number;
  /** Average knowledge chunks injected per retrieval turn for this brain. */
  avgDocsRetrieved: number | null;
  status: BrainHealthStatus;
  statusReason: string;
}

/** Usage stats per brain from events (multi-brain turns count for each member). */
export function brainUsageStats(events: RetrievalEvent[]): Map<string, { retrievals: number; zero: number; kSum: number }> {
  const m = new Map<string, { retrievals: number; zero: number; kSum: number }>();
  const bump = (slug: string, e: RetrievalEvent) => {
    const s = m.get(slug) ?? { retrievals: 0, zero: 0, kSum: 0 };
    s.retrievals++;
    if (e.wasZeroResult) s.zero++;
    s.kSum += e.knowledgeCount;
    m.set(slug, s);
  };
  for (const e of events) {
    if (e.multiBrains && e.multiBrains.length >= 2) for (const b of e.multiBrains) bump(b, e);
    else if (e.brainSlug) bump(e.brainSlug, e);
  }
  return m;
}

/**
 * Status rules (checked in order):
 *   needs-review — zero-result rate > 20% with ≥5 retrievals, or an active
 *                  brain with 0 docs;
 *   warning      — embeddings incomplete, or no retrievals recorded (unused);
 *   healthy      — otherwise.
 * The "shared" brain is an intentional archive (unrouted) and is always
 * reported healthy with a note.
 */
export function healthStatus(b: { brain: string; docs: number; embeddedPct: number; retrievals: number; zeroResultPct: number }): { status: BrainHealthStatus; statusReason: string } {
  if (b.brain === "shared") return { status: "healthy", statusReason: "archive brain (not routed)" };
  if (b.docs === 0) return { status: "needs-review", statusReason: "no documents" };
  if (b.retrievals >= 5 && b.zeroResultPct > 20) return { status: "needs-review", statusReason: `zero-result rate ${b.zeroResultPct}%` };
  if (b.embeddedPct < 100) return { status: "warning", statusReason: `embeddings ${b.embeddedPct}%` };
  if (b.retrievals === 0) return { status: "warning", statusReason: "no retrievals recorded yet" };
  return { status: "healthy", statusReason: "all checks pass" };
}

export async function getBrainHealth(events: RetrievalEvent[]): Promise<BrainHealth[]> {
  const rows = (await db.execute(sql`
    SELECT b.slug,
      count(DISTINCT kd.id)::int AS docs,
      count(kc.id)::int AS chunks,
      count(kc.embedding)::int AS embedded
    FROM brains b
    LEFT JOIN knowledge_document kd ON kd.brain_id = b.id AND kd.status = 'active'
    LEFT JOIN knowledge_chunk kc ON kc."documentId" = kd.id
    GROUP BY b.slug ORDER BY b.slug
  `)) as unknown as { rows: Array<{ slug: string; docs: number; chunks: number; embedded: number }> };

  const usage = brainUsageStats(events);
  return rows.rows.map((r) => {
    const u = usage.get(r.slug) ?? { retrievals: 0, zero: 0, kSum: 0 };
    const base = {
      brain: r.slug,
      docs: Number(r.docs),
      chunks: Number(r.chunks),
      embeddedPct: Number(r.chunks) ? Math.round((Number(r.embedded) / Number(r.chunks)) * 100) : 100,
      retrievals: u.retrievals,
      zeroResults: u.zero,
      zeroResultPct: u.retrievals ? Math.round((u.zero / u.retrievals) * 100) : 0,
      avgDocsRetrieved: u.retrievals ? Number((u.kSum / u.retrievals).toFixed(1)) : null,
    };
    return { ...base, ...healthStatus(base) };
  });
}
