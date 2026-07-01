/** Retrieval analytics — pure aggregation over event records (no DB). */
import { describe, it, expect } from "vitest";
import {
  aggregateBrainUsage,
  aggregateRetrievalMethods,
  aggregateClarification,
  aggregateZeroResults,
  topDocuments,
  topQueries,
  computeRetrievalAnalytics,
  eventFromMetadata,
  sanitizeQueryForLog,
  aggregateFeedback,
  leastHelpfulQueries,
  aggregateLatency,
  topFailedQueries,
  type RetrievalEvent,
} from "@/lib/admin/analytics";

const ev = (o: Partial<RetrievalEvent>): RetrievalEvent => ({
  brainSlug: null, brainMode: "smart", multiBrains: null, confidence: null,
  knowledgeCount: 0, memoryCount: 0, retrievalMethod: "none",
  wasClarify: false, wasZeroResult: false, sources: [], query: "",
  feedback: null, latencyMs: null, errorReason: null, day: null, ...o,
});

describe("retrieval analytics aggregators", () => {
  it("counts brain usage with multi + clarify + none buckets", () => {
    const usage = aggregateBrainUsage([
      ev({ brainSlug: "legal" }), ev({ brainSlug: "legal" }),
      ev({ brainSlug: "allbee" }),
      ev({ multiBrains: ["allbee", "suplaykart"] }),
      ev({ wasClarify: true, brainSlug: null }),
      ev({ brainSlug: null }),
    ]);
    expect(usage[0]).toEqual({ brain: "legal", count: 2 });
    expect(usage.find((u) => u.brain === "multi")?.count).toBe(1);
    expect(usage.find((u) => u.brain === "clarify")?.count).toBe(1);
    expect(usage.find((u) => u.brain === "none")?.count).toBe(1);
  });

  it("splits retrieval methods", () => {
    const m = aggregateRetrievalMethods([
      ev({ retrievalMethod: "semantic" }), ev({ retrievalMethod: "semantic" }),
      ev({ retrievalMethod: "keyword-fallback" }), ev({ retrievalMethod: "none" }),
    ]);
    expect(m).toEqual({ semantic: 2, keywordFallback: 1, none: 1 });
  });

  it("computes clarification count and rate", () => {
    const c = aggregateClarification([ev({ wasClarify: true }), ev({}), ev({}), ev({})]);
    expect(c.count).toBe(1);
    expect(c.rate).toBeCloseTo(0.25);
  });

  it("collects distinct recent zero-result queries (newest-first input)", () => {
    const z = aggregateZeroResults([
      ev({ wasZeroResult: true, query: "obscure thing" }),
      ev({ wasZeroResult: true, query: "Obscure Thing" }), // dup (case-insensitive)
      ev({ wasZeroResult: true, query: "another miss" }),
      ev({ knowledgeCount: 3, query: "a hit" }),
    ]);
    expect(z.count).toBe(3);
    expect(z.recentQueries).toEqual(["obscure thing", "another miss"]);
  });

  it("ranks top documents and queries by frequency", () => {
    const events = [
      ev({ sources: ["Article 21", "Article 14"], query: "what is article 21" }),
      ev({ sources: ["Article 21"], query: "What is Article 21" }),
      ev({ sources: ["AllBee — Founders"], query: "who founded allbee" }),
    ];
    expect(topDocuments(events)[0]).toEqual({ title: "Article 21", count: 2 });
    expect(topQueries(events)[0]).toEqual({ query: "what is article 21", count: 2 });
  });

  it("composes the full analytics object", () => {
    const a = computeRetrievalAnalytics([
      ev({ brainSlug: "legal", retrievalMethod: "semantic", sources: ["Article 21"], query: "article 21", knowledgeCount: 2 }),
      ev({ wasClarify: true, query: "founder" }),
      ev({ wasZeroResult: true, retrievalMethod: "keyword-fallback", query: "xyz" }),
    ]);
    expect(a.totalTurns).toBe(3);
    expect(a.failedRetrievals).toBe(1);
    expect(a.clarification.count).toBe(1);
    expect(a.brainUsage.some((b) => b.brain === "legal")).toBe(true);
  });

  it("parses stored metadata blobs and ignores non-retrieval ones", () => {
    expect(eventFromMetadata({ kind: "retrieval", brainSlug: "legal", knowledgeCount: 2 })?.brainSlug).toBe("legal");
    expect(eventFromMetadata({ kind: "something-else" })).toBeNull();
    expect(eventFromMetadata(null)).toBeNull();
    expect(eventFromMetadata("nope")).toBeNull();
  });

  it("redacts PII from logged queries (email, phone, long digit runs)", () => {
    expect(sanitizeQueryForLog("email me at haji@example.com please")).toContain("[email]");
    expect(sanitizeQueryForLog("email me at haji@example.com please")).not.toContain("@example.com");
    expect(sanitizeQueryForLog("call +1 415 555 1234 now")).toMatch(/\[phone\]/);
    expect(sanitizeQueryForLog("my card 4111111111111111")).toMatch(/\[(number|phone)\]/);
    expect(sanitizeQueryForLog("who is haji")).toBe("who is haji");
  });

  it("topQueries preserves first-seen original casing", () => {
    const q = topQueries([
      ev({ query: "what is Article 21" }),
      ev({ query: "What Is Article 21" }),
    ]);
    expect(q[0]).toEqual({ query: "what is Article 21", count: 2 });
  });

  it("aggregates feedback, least-helpful queries, latency, and failed queries (Phase 8)", () => {
    const events = [
      ev({ feedback: "helpful", latencyMs: 100, query: "who is haji" }),
      ev({ feedback: "helpful", latencyMs: 200, query: "what is allbee" }),
      ev({ feedback: "not_helpful", latencyMs: 300, query: "obscure thing" }),
      ev({ wasZeroResult: true, query: "no such topic" }),
      ev({ wasZeroResult: true, query: "no such topic" }),
    ];
    const fb = aggregateFeedback(events);
    expect(fb).toMatchObject({ helpful: 2, notHelpful: 1, total: 3 });
    expect(fb.helpfulRate).toBeCloseTo(2 / 3);
    expect(leastHelpfulQueries(events)).toEqual(["obscure thing"]);
    expect(aggregateLatency(events)).toEqual({ avgMs: 200, p50Ms: 200, count: 3 });
    expect(topFailedQueries(events)[0]).toEqual({ query: "no such topic", count: 2 });
  });

  it("builds daily trend series from event days", () => {
    const a = computeRetrievalAnalytics([
      ev({ wasClarify: true, day: "2026-07-01", feedback: "helpful", latencyMs: 100 }),
      ev({ wasClarify: true, day: "2026-07-02", feedback: "not_helpful", latencyMs: 300 }),
    ]);
    expect(a.trends.clarification).toEqual([
      { date: "2026-07-01", count: 1 },
      { date: "2026-07-02", count: 1 },
    ]);
    expect(a.trends.feedback[0]).toEqual({ date: "2026-07-01", helpful: 1, notHelpful: 0 });
    expect(a.trends.latency).toEqual([
      { date: "2026-07-01", avgMs: 100 },
      { date: "2026-07-02", avgMs: 300 },
    ]);
  });

  it("eventFromMetadata reads feedback + latency + day from createdAt", () => {
    const e = eventFromMetadata(
      { kind: "retrieval", feedback: "helpful", latencyMs: 250, errorReason: "timeout" },
      new Date("2026-07-01T12:00:00Z"),
    );
    expect(e?.feedback).toBe("helpful");
    expect(e?.latencyMs).toBe(250);
    expect(e?.errorReason).toBe("timeout");
    expect(e?.day).toBe("2026-07-01");
  });

  it("handles an empty event set without throwing", () => {
    const a = computeRetrievalAnalytics([]);
    expect(a.totalTurns).toBe(0);
    expect(a.brainUsage).toEqual([]);
    expect(a.clarification.rate).toBe(0);
    expect(a.feedback.total).toBe(0);
    expect(a.latency.count).toBe(0);
  });
});
