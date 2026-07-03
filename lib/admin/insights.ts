/**
 * Quality-optimization insights (observe-and-improve sprint).
 *
 * Pure derivations over the EXISTING analytics events — no new telemetry:
 *   - Phase 2: auto knowledge backlog (recurring zero-result queries → items).
 *   - Phase 5: content improvement recommendations (recommend only, never create).
 *   - Phase 6: thumbs-down categorization via logged provenance heuristics.
 * Reuses the existing brain router and web classifier read-only for suggestions.
 */
import { type RetrievalEvent } from "./analytics";
import { routeToBrain } from "@/lib/ai/brain-router";
import { classifyQuery } from "@/lib/web/classify";

/* ---------------------- Phase 2 — auto knowledge backlog ------------------ */

export interface BacklogItem {
  query: string;
  frequency: number;
  suggestedBrain: string;
  suggestedTitle: string;
  priority: "high" | "medium";
}

/** "what is negligence" → "Negligence — Overview" (best-effort title). */
export function suggestTitle(query: string): string {
  const core = query
    .toLowerCase()
    .replace(/[?.!]/g, "")
    .replace(/^(what|who|when|where|why|how)\s+(is|are|was|were|does|do|did|will|would|can|could)\s+(the\s+|a\s+|an\s+)?/i, "")
    .replace(/^(tell me about|explain|describe|define)\s+/i, "")
    .trim();
  const titled = core.replace(/\b\w/g, (c) => c.toUpperCase());
  return titled ? `${titled} — Overview` : "New Document";
}

/**
 * Backlog rule: a query that recurs 3+ times AND retrieves zero results becomes
 * a backlog item. Suggested brain comes from the live router (or "unrouted").
 * Priority: 5+ occurrences → high, else medium. Ranked by frequency.
 */
export function computeKnowledgeBacklog(events: RetrievalEvent[], minFrequency = 3): BacklogItem[] {
  const freq = new Map<string, { count: number; display: string }>();
  for (const e of events) {
    if (!e.wasZeroResult) continue;
    const q = e.query.trim();
    if (!q) continue;
    const k = q.toLowerCase();
    const cur = freq.get(k);
    if (cur) cur.count++;
    else freq.set(k, { count: 1, display: q });
  }
  return [...freq.values()]
    .filter((v) => v.count >= minFrequency)
    .map((v) => ({
      query: v.display,
      frequency: v.count,
      suggestedBrain: routeToBrain(v.display).brain ?? "unrouted",
      suggestedTitle: suggestTitle(v.display),
      priority: (v.count >= 5 ? "high" : "medium") as "high" | "medium",
    }))
    .sort((a, b) => b.frequency - a.frequency || a.query.localeCompare(b.query));
}

/* --------------- Phase 5 — content improvement recommendations ------------ */

export interface ContentRecommendation {
  topic: string;
  suggestedBrain: string;
  suggestedTitle: string;
  reason: string;
}

/**
 * Top missing topics → document recommendations (recommend ONLY — nothing is
 * auto-created). Sources: recurring zero-result queries first (strongest
 * signal), then remaining distinct zero-result/clarify topics, capped at `n`.
 */
export function recommendContent(events: RetrievalEvent[], n = 10): ContentRecommendation[] {
  const out: ContentRecommendation[] = [];
  const seen = new Set<string>();
  const push = (topic: string, reason: string) => {
    const k = topic.toLowerCase();
    if (!topic || seen.has(k) || out.length >= n) return;
    seen.add(k);
    out.push({ topic, suggestedBrain: routeToBrain(topic).brain ?? "unrouted", suggestedTitle: suggestTitle(topic), reason });
  };
  for (const b of computeKnowledgeBacklog(events)) push(b.query, `asked ${b.frequency}× with zero results`);
  for (const e of events) if (e.wasZeroResult) push(e.query.trim(), "returned zero results");
  for (const e of events) if (e.wasClarify) push(e.query.trim(), "needed clarification");
  return out;
}

/* ------------------- Phase 6 — thumbs-down categorization ----------------- */

export type FeedbackCategory =
  | "Ambiguous question"
  | "Current-event issue"
  | "Missing knowledge"
  | "Wrong retrieval"
  | "Poor wording";

export interface FeedbackAnalysis {
  ranked: Array<{ category: FeedbackCategory; count: number; examples: string[] }>;
  totalDisliked: number;
}

/**
 * Categorize a 👎 answer from its logged provenance (deterministic heuristics,
 * checked in order):
 *   1. Clarify turn                    → Ambiguous question
 *   2. Web/hybrid-classified query     → Current-event issue (stale live info)
 *   3. Zero docs retrieved             → Missing knowledge
 *   4. Docs retrieved, low confidence  → Wrong retrieval (likely wrong docs)
 *   5. Docs retrieved, confident       → Poor wording (content ok, answer not)
 */
export function categorizeDislike(e: RetrievalEvent): FeedbackCategory {
  if (e.wasClarify) return "Ambiguous question";
  if (classifyQuery(e.query) !== "internal") return "Current-event issue";
  if (e.wasZeroResult || e.knowledgeCount === 0) return "Missing knowledge";
  if (e.confidence != null && e.confidence < 70) return "Wrong retrieval";
  return "Poor wording";
}

export function analyzeFeedback(events: RetrievalEvent[]): FeedbackAnalysis {
  const agg = new Map<FeedbackCategory, { count: number; examples: string[] }>();
  let total = 0;
  for (const e of events) {
    if (e.feedback !== "not_helpful") continue;
    total++;
    const cat = categorizeDislike(e);
    const b = agg.get(cat) ?? { count: 0, examples: [] };
    b.count++;
    if (e.query.trim() && b.examples.length < 5) b.examples.push(e.query.trim());
    agg.set(cat, b);
  }
  return {
    totalDisliked: total,
    ranked: [...agg.entries()]
      .map(([category, v]) => ({ category, count: v.count, examples: v.examples }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
  };
}
