/** Weekly quality dashboard — pure aggregation + CSV (observability sprint). */
import { describe, it, expect } from "vitest";
import { weekStartOf, computeWeeklyQuality, computeQualityDashboard, qualityCsv } from "@/lib/admin/quality";
import type { RetrievalEvent } from "@/lib/admin/analytics";

const ev = (o: Partial<RetrievalEvent>): RetrievalEvent => ({
  brainSlug: null, brainMode: "smart", multiBrains: null, confidence: null,
  knowledgeCount: 0, memoryCount: 0, retrievalMethod: "none",
  wasClarify: false, wasZeroResult: false, sources: [], query: "",
  feedback: null, latencyMs: null, errorReason: null, day: null, ...o,
});

describe("weekStartOf", () => {
  it("maps any day to that week's Monday", () => {
    expect(weekStartOf("2026-07-01")).toBe("2026-06-29"); // Wed → Mon
    expect(weekStartOf("2026-06-29")).toBe("2026-06-29"); // Mon → itself
    expect(weekStartOf("2026-07-05")).toBe("2026-06-29"); // Sun → prior Mon
    expect(weekStartOf("2026-07-06")).toBe("2026-07-06"); // next Mon
  });
});

describe("computeWeeklyQuality", () => {
  it("groups events into ISO weeks and computes per-week metrics", () => {
    const weeks = computeWeeklyQuality([
      // week of 2026-06-29
      ev({ day: "2026-07-01", brainSlug: "legal", feedback: "helpful", latencyMs: 100 }),
      ev({ day: "2026-07-02", wasClarify: true, latencyMs: 300 }),
      // week of 2026-07-06
      ev({ day: "2026-07-07", brainSlug: "allbee", feedback: "not_helpful", wasZeroResult: true }),
    ]);
    expect(weeks.map((w) => w.weekStart)).toEqual(["2026-06-29", "2026-07-06"]);
    const [w1, w2] = weeks;
    expect(w1).toMatchObject({ turns: 2, helpfulPct: 100, ratedCount: 1, clarificationPct: 50, zeroResultPct: 0, avgLatencyMs: 200 });
    expect(w2).toMatchObject({ turns: 1, helpfulPct: 0, ratedCount: 1, clarificationPct: 0, zeroResultPct: 100, avgLatencyMs: null });
  });

  it("skips events with no day and handles empty input", () => {
    expect(computeWeeklyQuality([ev({ day: null })])).toEqual([]);
    expect(computeWeeklyQuality([])).toEqual([]);
  });
});

describe("computeQualityDashboard", () => {
  it("composes overall metrics + top lists", () => {
    const d = computeQualityDashboard([
      ev({ day: "2026-07-01", brainSlug: "legal", feedback: "helpful", latencyMs: 200, query: "article 21" }),
      ev({ day: "2026-07-01", feedback: "not_helpful", query: "confusing thing" }),
      ev({ day: "2026-07-02", wasZeroResult: true, query: "unknown topic" }),
    ], 56);
    expect(d.totalTurns).toBe(3);
    expect(d.overall.helpfulPct).toBe(50);
    expect(d.overall.ratedCount).toBe(2);
    expect(d.overall.zeroResultPct).toBe(33);
    expect(d.overall.avgLatencyMs).toBe(200);
    expect(d.topDislikedQueries).toEqual(["confusing thing"]);
    expect(d.topMissingAreas).toContain("unknown topic");
    expect(d.mostUsedBrains.some((b) => b.brain === "legal")).toBe(true);
  });

  it("returns null-ish metrics on an empty event set (no data yet)", () => {
    const d = computeQualityDashboard([], 56);
    expect(d.overall.helpfulPct).toBeNull();
    expect(d.overall.avgLatencyMs).toBeNull();
    expect(d.weeks).toEqual([]);
  });
});

describe("qualityCsv", () => {
  it("emits weekly rows, an overall row, and the top-list sections", () => {
    const csv = qualityCsv(computeQualityDashboard([
      ev({ day: "2026-07-01", brainSlug: "legal", feedback: "helpful", latencyMs: 150, query: "article 21" }),
      ev({ day: "2026-07-01", feedback: "not_helpful", query: 'query with, comma and "quote"' }),
    ], 56));
    expect(csv).toContain("WEEKLY QUALITY");
    expect(csv).toContain("week_start,turns,helpful_pct,rated_count,clarification_pct,zero_result_pct,avg_latency_ms");
    expect(csv).toContain("2026-06-29,2,50,2,0,0,150");
    expect(csv).toContain("OVERALL (56d),2,50,2,0,0,150");
    expect(csv).toContain("TOP DISLIKED QUERIES");
    // CSV escaping: embedded comma + quotes are wrapped and doubled.
    expect(csv).toContain('"query with, comma and ""quote"""');
    expect(csv).toContain("MOST-USED BRAINS");
    expect(csv).toContain("legal,1");
  });
});
