import { describe, expect, it } from "vitest";
import { fuseMemoryRanks } from "@/lib/memory/rank-fusion";

const semantic = (id: string, similarity: number) => ({
  id,
  type: "fact",
  content: id,
  similarity,
});

const keyword = (id: string, score: number) => ({
  id,
  type: "fact" as const,
  content: id,
  updatedAt: new Date("2026-01-01"),
  score,
});

describe("memory retrieval rank fusion", () => {
  it("rescues an exact keyword hit buried in semantic results", () => {
    const fused = fuseMemoryRanks(
      [semantic("semantic-best", 0.92), semantic("other", 0.8), semantic("exact", 0.63)],
      [keyword("exact", 10), keyword("semantic-best", 1)],
    );
    expect(fused[0].id).toBe("exact");
  });

  it("prefers a memory present in both retrieval tiers", () => {
    const fused = fuseMemoryRanks(
      [semantic("both", 0.7), semantic("semantic-only", 0.9)],
      [keyword("both", 2)],
    );
    expect(fused.map((h) => h.id)).toEqual(["both", "semantic-only"]);
  });

  it("deduplicates shared memories and is deterministic", () => {
    const semanticHits = [semantic("same", 0.8)];
    const keywordHits = [keyword("same", 9), keyword("other", 3)];
    const first = fuseMemoryRanks(semanticHits, keywordHits);
    const second = fuseMemoryRanks(semanticHits, keywordHits);
    expect(first).toHaveLength(2);
    expect(first.map((h) => h.id)).toEqual(second.map((h) => h.id));
  });
});
