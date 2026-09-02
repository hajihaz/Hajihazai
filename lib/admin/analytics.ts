/**
 * Retrieval analytics (admin).
 *
 * Every assistant reply persists a compact retrieval-provenance record on the
 * message's `metadata` column (kind:"retrieval"). This module reads those records
 * and aggregates them into the metrics the admin dashboard shows: brain usage,
 * failed/zero-result retrievals, clarification frequency, retrieval method mix,
 * top documents, and top queries.
 *
 * The aggregators are PURE functions over an event array so they can be unit
 * tested without a database; getRetrievalAnalytics() is the only DB-touching fn.
 */
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { messages } from "@/lib/db/schema";

export const RETRIEVAL_EVENT_KIND = "retrieval" as const;

/**
 * Redact obvious PII before a query is persisted for analytics. Emails, phone
 * numbers, and long digit runs (cards / SSNs / account numbers) are masked so
 * the admin "top queries" view never surfaces raw sensitive data. Names are not
 * detectable heuristically and are out of scope; the query is also truncated by
 * the caller. Applied at write time so nothing sensitive lands in the DB.
 */
export function sanitizeQueryForLog(q: string, maxLen = 160): string {
  return q
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b(?:\+?\d[\d\s().-]{7,}\d)\b/g, "[phone]")
    .replace(/\b\d{6,}\b/g, "[number]")
    .trim()
    .slice(0, maxLen);
}

export interface RetrievalEvent {
  brainSlug: string | null;
  brainMode: "smart" | "manual";
  multiBrains: string[] | null;
  confidence: number | null;
  knowledgeCount: number;
  memoryCount: number;
  retrievalMethod: "none" | "keyword-fallback" | "semantic" | "hybrid";
  wasClarify: boolean;
  wasZeroResult: boolean;
  sources: string[];
  query: string;
  // Phase 8 additions (all optional/nullable for backward compatibility).
  feedback: "helpful" | "not_helpful" | null;
  latencyMs: number | null;
  errorReason: string | null;
  /** ISO date (yyyy-mm-dd) of the turn, for daily trends. */
  day: string | null;
}

export type DayCount = { date: string; count: number };

export interface RetrievalAnalytics {
  totalTurns: number;
  brainUsage: Array<{ brain: string; count: number }>;
  retrievalMethods: { semantic: number; keywordFallback: number; hybrid: number; none: number };
  clarification: { count: number; rate: number };
  zeroResults: { count: number; rate: number; recentQueries: string[] };
  /** Turns that wanted knowledge but retrieved nothing (== zeroResults.count). */
  failedRetrievals: number;
  topDocuments: Array<{ title: string; count: number }>;
  topQueries: Array<{ query: string; count: number }>;
  // Phase 8 additions.
  feedback: { helpful: number; notHelpful: number; total: number; helpfulRate: number };
  leastHelpfulQueries: string[];
  latency: { avgMs: number; p50Ms: number; count: number };
  errors: number;
  topFailedQueries: Array<{ query: string; count: number }>;
  trends: {
    clarification: DayCount[];
    feedback: Array<{ date: string; helpful: number; notHelpful: number }>;
    latency: Array<{ date: string; avgMs: number }>;
  };
}

/* --------------------------- pure aggregators ---------------------------- */

/** Usage per brain, with multi-brain and unrouted (clarify / none) buckets. */
export function aggregateBrainUsage(events: RetrievalEvent[]): Array<{ brain: string; count: number }> {
  const m = new Map<string, number>();
  for (const e of events) {
    const key =
      e.multiBrains && e.multiBrains.length >= 2 ? "multi"
      : e.brainSlug ? e.brainSlug
      : e.wasClarify ? "clarify"
      : "none";
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([brain, count]) => ({ brain, count }))
    .sort((a, b) => b.count - a.count || a.brain.localeCompare(b.brain));
}

export function aggregateRetrievalMethods(events: RetrievalEvent[]) {
  let semantic = 0, keywordFallback = 0, hybrid = 0, none = 0;
  for (const e of events) {
    if (e.retrievalMethod === "semantic") semantic++;
    else if (e.retrievalMethod === "keyword-fallback") keywordFallback++;
    else if (e.retrievalMethod === "hybrid") hybrid++;
    else none++;
  }
  return { semantic, keywordFallback, hybrid, none };
}

export function aggregateClarification(events: RetrievalEvent[]) {
  const count = events.filter((e) => e.wasClarify).length;
  return { count, rate: events.length ? count / events.length : 0 };
}

export function aggregateZeroResults(events: RetrievalEvent[]) {
  const zr = events.filter((e) => e.wasZeroResult);
  // events arrive newest-first; keep the most recent distinct queries.
  const recentQueries: string[] = [];
  const seen = new Set<string>();
  for (const e of zr) {
    const q = e.query.trim();
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    recentQueries.push(q);
    if (recentQueries.length >= 10) break;
  }
  return { count: zr.length, rate: events.length ? zr.length / events.length : 0, recentQueries };
}

export function topDocuments(events: RetrievalEvent[], n = 10): Array<{ title: string; count: number }> {
  const m = new Map<string, number>();
  for (const e of events) for (const t of e.sources) {
    if (!t) continue;
    m.set(t, (m.get(t) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([title, count]) => ({ title, count }))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, n);
}

export function topQueries(events: RetrievalEvent[], n = 10): Array<{ query: string; count: number }> {
  // Dedup case-insensitively but display the first-seen original casing.
  const m = new Map<string, { display: string; count: number }>();
  for (const e of events) {
    const raw = e.query.trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const cur = m.get(key);
    if (cur) cur.count++;
    else m.set(key, { display: raw, count: 1 });
  }
  return [...m.values()]
    .map((v) => ({ query: v.display, count: v.count }))
    .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
    .slice(0, n);
}

/** 👍/👎 feedback summary. */
export function aggregateFeedback(events: RetrievalEvent[]) {
  let helpful = 0, notHelpful = 0;
  for (const e of events) {
    if (e.feedback === "helpful") helpful++;
    else if (e.feedback === "not_helpful") notHelpful++;
  }
  const total = helpful + notHelpful;
  return { helpful, notHelpful, total, helpfulRate: total ? helpful / total : 0 };
}

/** Distinct recent queries the user marked 👎 (newest-first input). */
export function leastHelpfulQueries(events: RetrievalEvent[], n = 10): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of events) {
    if (e.feedback !== "not_helpful") continue;
    const q = e.query.trim();
    if (!q || seen.has(q.toLowerCase())) continue;
    seen.add(q.toLowerCase());
    out.push(q);
    if (out.length >= n) break;
  }
  return out;
}

/** Latency average + median over turns that recorded a latency. */
export function aggregateLatency(events: RetrievalEvent[]) {
  const vals = events.map((e) => e.latencyMs).filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  if (!vals.length) return { avgMs: 0, p50Ms: 0, count: 0 };
  const avgMs = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  const p50Ms = vals[Math.floor(vals.length / 2)];
  return { avgMs, p50Ms, count: vals.length };
}

/** Most frequent zero-result queries (distinct from the recent list). */
export function topFailedQueries(events: RetrievalEvent[], n = 10) {
  return topQueries(events.filter((e) => e.wasZeroResult), n);
}

/** Group into per-day series (ascending date). `pick` maps an event to a number. */
function dailySeries(events: RetrievalEvent[], keep: (e: RetrievalEvent) => boolean): DayCount[] {
  const m = new Map<string, number>();
  for (const e of events) {
    if (!e.day || !keep(e)) continue;
    m.set(e.day, (m.get(e.day) ?? 0) + 1);
  }
  return [...m.entries()].map(([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Compose every metric from a raw event list (newest-first). */
export function computeRetrievalAnalytics(events: RetrievalEvent[]): RetrievalAnalytics {
  const zeroResults = aggregateZeroResults(events);

  // Feedback per day.
  const fbByDay = new Map<string, { helpful: number; notHelpful: number }>();
  const latByDay = new Map<string, { sum: number; n: number }>();
  for (const e of events) {
    if (!e.day) continue;
    if (e.feedback) {
      const d = fbByDay.get(e.day) ?? { helpful: 0, notHelpful: 0 };
      if (e.feedback === "helpful") d.helpful++; else d.notHelpful++;
      fbByDay.set(e.day, d);
    }
    if (typeof e.latencyMs === "number") {
      const d = latByDay.get(e.day) ?? { sum: 0, n: 0 };
      d.sum += e.latencyMs; d.n++;
      latByDay.set(e.day, d);
    }
  }

  return {
    totalTurns: events.length,
    brainUsage: aggregateBrainUsage(events),
    retrievalMethods: aggregateRetrievalMethods(events),
    clarification: aggregateClarification(events),
    zeroResults,
    failedRetrievals: zeroResults.count,
    topDocuments: topDocuments(events),
    topQueries: topQueries(events),
    feedback: aggregateFeedback(events),
    leastHelpfulQueries: leastHelpfulQueries(events),
    latency: aggregateLatency(events),
    errors: events.filter((e) => !!e.errorReason).length,
    topFailedQueries: topFailedQueries(events),
    trends: {
      clarification: dailySeries(events, (e) => e.wasClarify),
      feedback: [...fbByDay.entries()].map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date)),
      latency: [...latByDay.entries()].map(([date, v]) => ({ date, avgMs: Math.round(v.sum / v.n) })).sort((a, b) => a.date.localeCompare(b.date)),
    },
  };
}

/** Coerce a stored message.metadata blob into a typed event (or null if not one). */
export function eventFromMetadata(md: unknown, createdAt?: Date | string | null): RetrievalEvent | null {
  if (!md || typeof md !== "object") return null;
  const r = md as Record<string, unknown>;
  if (r.kind !== RETRIEVAL_EVENT_KIND) return null;
  const fb = r.feedback === "helpful" || r.feedback === "not_helpful" ? r.feedback : null;
  const day = createdAt ? new Date(createdAt).toISOString().slice(0, 10) : null;
  return {
    brainSlug: (r.brainSlug as string) ?? null,
    brainMode: (r.brainMode as "smart" | "manual") ?? "smart",
    multiBrains: Array.isArray(r.multiBrains) ? (r.multiBrains as string[]) : null,
    confidence: typeof r.confidence === "number" ? r.confidence : null,
    knowledgeCount: typeof r.knowledgeCount === "number" ? r.knowledgeCount : 0,
    memoryCount: typeof r.memoryCount === "number" ? r.memoryCount : 0,
    retrievalMethod: (r.retrievalMethod as RetrievalEvent["retrievalMethod"]) ?? "none",
    wasClarify: !!r.wasClarify,
    wasZeroResult: !!r.wasZeroResult,
    sources: Array.isArray(r.sources) ? (r.sources as string[]) : [],
    query: typeof r.query === "string" ? r.query : "",
    feedback: fb as "helpful" | "not_helpful" | null,
    latencyMs: typeof r.latencyMs === "number" ? r.latencyMs : null,
    errorReason: typeof r.errorReason === "string" ? r.errorReason : null,
    day,
  };
}

/* ------------------------------- Knowledge gaps -------------------------- */

export interface KnowledgeGaps {
  zeroResultQueries: Array<{ query: string; count: number }>;
  clarificationQueries: Array<{ query: string; count: number }>;
  lowConfidenceQueries: Array<{ query: string; count: number; confidence: number }>;
  /** Distinct topics implied by unmet queries — candidates for a new document. */
  missingTopicSuggestions: string[];
}

/** Frequency-ranked distinct queries matching a predicate. */
function rankedQueries(events: RetrievalEvent[], keep: (e: RetrievalEvent) => boolean, n = 25) {
  const m = new Map<string, number>();
  for (const e of events) {
    if (!keep(e)) continue;
    const q = e.query.trim();
    if (!q) continue;
    m.set(q.toLowerCase(), (m.get(q.toLowerCase()) ?? 0) + 1);
  }
  // preserve a display form (first-seen original casing)
  const display = new Map<string, string>();
  for (const e of events) {
    const q = e.query.trim();
    if (q && !display.has(q.toLowerCase())) display.set(q.toLowerCase(), q);
  }
  return [...m.entries()]
    .map(([k, count]) => ({ query: display.get(k) ?? k, count }))
    .sort((a, b) => b.count - a.count || a.query.localeCompare(b.query))
    .slice(0, n);
}

export function computeKnowledgeGaps(events: RetrievalEvent[], lowConfidenceThreshold = 55): KnowledgeGaps {
  const zeroResultQueries = rankedQueries(events, (e) => e.wasZeroResult);
  const clarificationQueries = rankedQueries(events, (e) => e.wasClarify);

  // low-confidence: routed to a brain but with a weak margin.
  const lowByKey = new Map<string, { count: number; confidence: number; display: string }>();
  for (const e of events) {
    if (e.brainSlug && typeof e.confidence === "number" && e.confidence < lowConfidenceThreshold) {
      const q = e.query.trim(); if (!q) continue;
      const k = q.toLowerCase();
      const cur = lowByKey.get(k);
      if (cur) cur.count++;
      else lowByKey.set(k, { count: 1, confidence: e.confidence, display: q });
    }
  }
  const lowConfidenceQueries = [...lowByKey.values()]
    .map((v) => ({ query: v.display, count: v.count, confidence: v.confidence }))
    .sort((a, b) => b.count - a.count).slice(0, 25);

  // Missing-topic suggestions: distinct unmet queries (zero-result first, then clarify).
  const seen = new Set<string>();
  const missingTopicSuggestions: string[] = [];
  for (const list of [zeroResultQueries, clarificationQueries]) {
    for (const { query } of list) {
      const k = query.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      missingTopicSuggestions.push(query);
      if (missingTopicSuggestions.length >= 15) break;
    }
  }
  return { zeroResultQueries, clarificationQueries, lowConfidenceQueries, missingTopicSuggestions };
}

/* ------------------------------- DB reader ------------------------------- */

export async function loadRetrievalEvents(days: number, limit = 5000): Promise<RetrievalEvent[]> {
  return loadEvents(days, limit);
}

async function loadEvents(days: number, limit: number): Promise<RetrievalEvent[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ metadata: messages.metadata, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.role, "assistant"), gte(messages.createdAt, since), isNotNull(messages.metadata)))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  const events: RetrievalEvent[] = [];
  for (const row of rows) {
    const ev = eventFromMetadata(row.metadata, row.createdAt);
    if (ev) events.push(ev);
  }
  return events;
}

export async function getKnowledgeGaps(days = 30, limit = 5000): Promise<KnowledgeGaps> {
  return computeKnowledgeGaps(await loadEvents(days, limit));
}

export async function getRetrievalAnalytics(days = 30, limit = 5000): Promise<RetrievalAnalytics> {
  return computeRetrievalAnalytics(await loadEvents(days, limit));
}
