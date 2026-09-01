import { describe, expect, it } from "vitest";
import { planResearchQueries } from "../lib/ai/research-planner";

describe("research query planner", () => {
  it("keeps smart queries to one search", () => {
    expect(planResearchQueries("What is AllBee?", "smart").queries).toEqual([
      "What is AllBee?",
    ]);
  });

  it("fans out current-event research", () => {
    const p = planResearchQueries(
      "Who is the current Chief Minister of Tamil Nadu?",
      "research",
    );
    expect(p.queries.length).toBe(3);
    expect(p.queries[0]).toContain("current Chief Minister");
    expect(p.queries.some((q) => /authoritative sources/i.test(q))).toBe(true);
  });

  it("asks for primary sources on legal/government research", () => {
    const p = planResearchQueries(
      "Research the current election regulation",
      "research",
    );
    expect(p.queries.some((q) => /official source/i.test(q))).toBe(true);
  });

  it("deduplicates repeated formulations", () => {
    const p = planResearchQueries("Deep dive", "research");
    expect(new Set(p.queries).size).toBe(p.queries.length);
    expect(p.maxParallel).toBeLessThanOrEqual(3);
  });
});
