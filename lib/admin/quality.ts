/**
 * Weekly quality dashboard (observability sprint).
 *
 * Composes the EXISTING analytics primitives (feedback, clarification,
 * zero-result, latency, brain usage, knowledge gaps) into a per-week quality
 * view plus a CSV export. Pure functions over RetrievalEvent[] — no new
 * telemetry, no schema change, nothing outside the analytics layer.
 */
import {
  type RetrievalEvent,
  aggregateFeedback,
  aggregateClarification,
  aggregateZeroResults,
  aggregateLatency,
  aggregateBrainUsage,
  leastHelpfulQueries,
  computeKnowledgeGaps,
  loadRetrievalEvents,
} from "./analytics";

/** Monday (ISO week start) of the week containing `day` (yyyy-mm-dd). */
export function weekStartOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export interface WeeklyQuality {
  /** Monday of the week (yyyy-mm-dd). */
  weekStart: string;
  turns: number;
  /** Helpful % of rated answers (null when nothing was rated that week). */
  helpfulPct: number | null;
  ratedCount: number;
  clarificationPct: number;
  zeroResultPct: number;
  /** Average latency in ms (null when no turn recorded latency). */
  avgLatencyMs: number | null;
}

/** Per-week quality metrics (ascending by week). Events without a day are skipped. */
export function computeWeeklyQuality(events: RetrievalEvent[]): WeeklyQuality[] {
  const byWeek = new Map<string, RetrievalEvent[]>();
  for (const e of events) {
    if (!e.day) continue;
    const wk = weekStartOf(e.day);
    const list = byWeek.get(wk);
    if (list) list.push(e); else byWeek.set(wk, [e]);
  }
  return [...byWeek.entries()]
    .map(([weekStart, evs]) => {
      const fb = aggregateFeedback(evs);
      const clar = aggregateClarification(evs);
      const zero = aggregateZeroResults(evs);
      const lat = aggregateLatency(evs);
      return {
        weekStart,
        turns: evs.length,
        helpfulPct: fb.total ? Math.round(fb.helpfulRate * 100) : null,
        ratedCount: fb.total,
        clarificationPct: Math.round(clar.rate * 100),
        zeroResultPct: Math.round(zero.rate * 100),
        avgLatencyMs: lat.count ? lat.avgMs : null,
      };
    })
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export interface QualityDashboard {
  rangeDays: number;
  totalTurns: number;
  overall: {
    helpfulPct: number | null;
    ratedCount: number;
    clarificationPct: number;
    zeroResultPct: number;
    avgLatencyMs: number | null;
  };
  weeks: WeeklyQuality[];
  topDislikedQueries: string[];
  topMissingAreas: string[];
  mostUsedBrains: Array<{ brain: string; count: number }>;
}

/** Compose the full dashboard from one event list (pure). */
export function computeQualityDashboard(events: RetrievalEvent[], rangeDays: number): QualityDashboard {
  const fb = aggregateFeedback(events);
  const clar = aggregateClarification(events);
  const zero = aggregateZeroResults(events);
  const lat = aggregateLatency(events);
  const gaps = computeKnowledgeGaps(events);
  return {
    rangeDays,
    totalTurns: events.length,
    overall: {
      helpfulPct: fb.total ? Math.round(fb.helpfulRate * 100) : null,
      ratedCount: fb.total,
      clarificationPct: Math.round(clar.rate * 100),
      zeroResultPct: Math.round(zero.rate * 100),
      avgLatencyMs: lat.count ? lat.avgMs : null,
    },
    weeks: computeWeeklyQuality(events),
    topDislikedQueries: leastHelpfulQueries(events),
    topMissingAreas: gaps.missingTopicSuggestions,
    mostUsedBrains: aggregateBrainUsage(events),
  };
}

/* --------------------------------- CSV ----------------------------------- */

function esc(v: unknown): string {
  const s = v == null ? "" : String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/**
 * Multi-section CSV: weekly metrics, then the top lists — readable directly in
 * a spreadsheet. Percentages are plain numbers; empty cells mean "no data".
 */
export function qualityCsv(d: QualityDashboard): string {
  const lines: string[] = [];
  lines.push("WEEKLY QUALITY");
  lines.push("week_start,turns,helpful_pct,rated_count,clarification_pct,zero_result_pct,avg_latency_ms");
  for (const w of d.weeks) {
    lines.push([w.weekStart, w.turns, w.helpfulPct ?? "", w.ratedCount, w.clarificationPct, w.zeroResultPct, w.avgLatencyMs ?? ""].map(esc).join(","));
  }
  lines.push([`OVERALL (${d.rangeDays}d)`, d.totalTurns, d.overall.helpfulPct ?? "", d.overall.ratedCount, d.overall.clarificationPct, d.overall.zeroResultPct, d.overall.avgLatencyMs ?? ""].map(esc).join(","));

  lines.push("", "TOP DISLIKED QUERIES", "query");
  for (const q of d.topDislikedQueries) lines.push(esc(q));

  lines.push("", "TOP MISSING KNOWLEDGE AREAS", "query");
  for (const q of d.topMissingAreas) lines.push(esc(q));

  lines.push("", "MOST-USED BRAINS", "brain,count");
  for (const b of d.mostUsedBrains) lines.push([b.brain, b.count].map(esc).join(","));

  return lines.join("\n");
}

/* ------------------------------- DB loader -------------------------------- */

/** Load the dashboard for the last `weeks` ISO weeks (default 8). */
export async function getQualityDashboard(weeks = 8): Promise<QualityDashboard> {
  const rangeDays = weeks * 7;
  const events = await loadRetrievalEvents(rangeDays, 20_000);
  return computeQualityDashboard(events, rangeDays);
}
