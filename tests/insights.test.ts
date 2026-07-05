/** Quality-optimization insights — backlog, feedback categories, brain health, score. */
import { describe, it, expect } from "vitest";
import { computeKnowledgeBacklog, suggestTitle, recommendContent, categorizeDislike, analyzeFeedback } from "@/lib/admin/insights";
import { qualityScore } from "@/lib/admin/quality";
import { healthStatus, brainUsageStats } from "@/lib/admin/brain-health";
import type { RetrievalEvent } from "@/lib/admin/analytics";

const ev = (o: Partial<RetrievalEvent>): RetrievalEvent => ({
  brainSlug: null, brainMode: "smart", multiBrains: null, confidence: null,
  knowledgeCount: 0, memoryCount: 0, retrievalMethod: "none",
  wasClarify: false, wasZeroResult: false, sources: [], query: "",
  feedback: null, latencyMs: null, errorReason: null, day: null, ...o,
});

describe("knowledge backlog (Phase 2)", () => {
  it("creates an item only for queries with 3+ zero-results", () => {
    const zr = (q: string) => ev({ wasZeroResult: true, query: q });
    const items = computeKnowledgeBacklog([
      zr("what is the limitation act"), zr("What is the Limitation Act"), zr("what is the limitation act"),
      zr("rare one-off"),
      ev({ query: "what is the limitation act" }), // non-zero-result, ignored
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ frequency: 3, priority: "medium" });
    expect(items[0].suggestedBrain).toBe("legal"); // "act" routes legal via the existing router
    // A query the router can't place is honestly labeled "unrouted".
    const unrouted = computeKnowledgeBacklog(Array.from({ length: 3 }, () => zr("random obscure thing")));
    expect(unrouted[0].suggestedBrain).toBe("unrouted");
  });

  it("marks 5+ occurrences high priority and ranks by frequency", () => {
    const evs = [
      ...Array.from({ length: 5 }, () => ev({ wasZeroResult: true, query: "hot topic" })),
      ...Array.from({ length: 3 }, () => ev({ wasZeroResult: true, query: "warm topic" })),
    ];
    const items = computeKnowledgeBacklog(evs);
    expect(items.map((i) => i.priority)).toEqual(["high", "medium"]);
    expect(items[0].query).toBe("hot topic");
  });

  it("suggestTitle strips question scaffolding", () => {
    expect(suggestTitle("what is negligence?")).toBe("Negligence — Overview");
    expect(suggestTitle("explain tort law")).toBe("Tort Law — Overview");
  });
});

describe("content recommendations (Phase 5)", () => {
  it("caps at 10, dedupes, prefers recurring zero-results", () => {
    const evs = [
      ...Array.from({ length: 3 }, () => ev({ wasZeroResult: true, query: "recurring gap" })),
      ...Array.from({ length: 12 }, (_, i) => ev({ wasZeroResult: true, query: `one-off ${i}` })),
    ];
    const recs = recommendContent(evs);
    expect(recs).toHaveLength(10);
    expect(recs[0].topic).toBe("recurring gap");
    expect(recs[0].reason).toMatch(/3×/);
    expect(new Set(recs.map((r) => r.topic.toLowerCase())).size).toBe(10);
  });
});

describe("👎 categorization (Phase 6)", () => {
  it("maps provenance to categories in priority order", () => {
    expect(categorizeDislike(ev({ wasClarify: true }))).toBe("Ambiguous question");
    expect(categorizeDislike(ev({ query: "latest stock price of reliance" }))).toBe("Current-event issue");
    // Identity/current-event queries ("who is X") now classify as web → Current-event
    // issue (verified above). Use a plainly-internal query to exercise Missing knowledge.
    expect(categorizeDislike(ev({ query: "what does my handbook say about leave", knowledgeCount: 0 }))).toBe("Missing knowledge");
    expect(categorizeDislike(ev({ query: "who is haji", knowledgeCount: 3, confidence: 60 }))).toBe("Wrong retrieval");
    expect(categorizeDislike(ev({ query: "who is haji", knowledgeCount: 3, confidence: 100 }))).toBe("Poor wording");
  });

  it("ranks categories by count with capped examples", () => {
    const dis = (o: Partial<RetrievalEvent>) => ev({ feedback: "not_helpful", ...o });
    const a = analyzeFeedback([
      dis({ query: "q1", knowledgeCount: 0 }),
      dis({ query: "q2", knowledgeCount: 0 }),
      dis({ query: "who is haji", knowledgeCount: 2, confidence: 100 }),
      ev({ feedback: "helpful", query: "ignored" }),
    ]);
    expect(a.totalDisliked).toBe(3);
    expect(a.ranked[0]).toMatchObject({ category: "Missing knowledge", count: 2 });
    expect(a.ranked[1]).toMatchObject({ category: "Poor wording", count: 1 });
  });
});

describe("quality score (Phase 3)", () => {
  it("computes the 40/25/20/15 weighted blend", () => {
    // helpful 100%, zero 0%, clarify 0%, latency 1500ms → all components = 1 → 100
    expect(qualityScore({ helpfulPct: 100, zeroResultPct: 0, clarificationPct: 0, avgLatencyMs: 1500 })).toBe(100);
    // helpful 50 (.4*.5=.2) + retrieval .8 (.25*.8=.2) + clarify .9 (.2*.9=.18) + latency 6000→0 → .58
    expect(qualityScore({ helpfulPct: 50, zeroResultPct: 20, clarificationPct: 10, avgLatencyMs: 6000 })).toBe(58);
  });
  it("renormalizes when a component has no data", () => {
    // no feedback + no latency → only retrieval(1.0)*.25 + clarify(1.0)*.20 over .45 → 100
    expect(qualityScore({ helpfulPct: null, zeroResultPct: 0, clarificationPct: 0, avgLatencyMs: null })).toBe(100);
  });
});

describe("brain health (Phase 4)", () => {
  it("applies status rules in order", () => {
    expect(healthStatus({ brain: "legal", docs: 0, embeddedPct: 100, retrievals: 10, zeroResultPct: 0 }).status).toBe("needs-review");
    expect(healthStatus({ brain: "legal", docs: 5, embeddedPct: 100, retrievals: 10, zeroResultPct: 30 }).status).toBe("needs-review");
    expect(healthStatus({ brain: "legal", docs: 5, embeddedPct: 80, retrievals: 10, zeroResultPct: 0 }).status).toBe("warning");
    expect(healthStatus({ brain: "legal", docs: 5, embeddedPct: 100, retrievals: 0, zeroResultPct: 0 }).status).toBe("warning");
    expect(healthStatus({ brain: "legal", docs: 5, embeddedPct: 100, retrievals: 10, zeroResultPct: 5 }).status).toBe("healthy");
    expect(healthStatus({ brain: "shared", docs: 9, embeddedPct: 100, retrievals: 0, zeroResultPct: 0 }).status).toBe("healthy");
  });

  it("aggregates usage per brain incl. multi-brain turns", () => {
    const m = brainUsageStats([
      ev({ brainSlug: "legal", knowledgeCount: 4 }),
      ev({ brainSlug: "legal", wasZeroResult: true, knowledgeCount: 0 }),
      ev({ multiBrains: ["allbee", "suplaykart"], knowledgeCount: 6 }),
    ]);
    expect(m.get("legal")).toEqual({ retrievals: 2, zero: 1, kSum: 4 });
    expect(m.get("allbee")).toEqual({ retrievals: 1, zero: 0, kSum: 6 });
    expect(m.get("suplaykart")).toEqual({ retrievals: 1, zero: 0, kSum: 6 });
  });
});
