import { describe, it, expect } from "vitest";
import { buildMemoryBlock, MEMORY_GUARD } from "@/lib/memory/context-format";
import { fuseKnowledgeRanks } from "@/lib/knowledge/rank-fusion";

describe("memory block hard char cap (Phase 9.0)", () => {
  it("never exceeds the 1000-char cap", () => {
    const memories = Array.from({ length: 100 }, (_, i) => ({
      content: `Memory item number ${i} with some descriptive content about the user`,
    }));
    const { block, count } = buildMemoryBlock(memories, 100_000, 1000);
    expect(block.length).toBeLessThanOrEqual(1000);
    expect(count).toBeLessThan(100);
  });

  it("still includes the injection guard", () => {
    const { block } = buildMemoryBlock([{ content: "Owns Acme" }], 400, 1000);
    expect(block.startsWith(MEMORY_GUARD)).toBe(true);
  });
});


describe("knowledge retrieval rank fusion", () => {
  const hit = (chunkId: string, title: string, similarity: number) => ({
    chunkId, documentId: `doc-${chunkId}`, title, content: `content ${chunkId}`, similarity,
  });

  it("promotes a strong keyword hit instead of blindly keeping semantic order", () => {
    const semantic = [hit("semantic-1", "Overview", 0.91), hit("exact-1", "AllBee Founders", 0.62)];
    const keyword = [hit("exact-1", "AllBee Founders", 7), hit("semantic-1", "Overview", 1)];
    const fused = fuseKnowledgeRanks(semantic, keyword, "who founded AllBee");
    expect(fused[0].chunkId).toBe("exact-1");
  });

  it("keeps a hit that appears in both tiers ahead of one that appears in only one", () => {
    const semantic = [hit("both", "Company", 0.8), hit("semantic-only", "Other", 0.9)];
    const keyword = [hit("both", "Company", 4)];
    const fused = fuseKnowledgeRanks(semantic, keyword, "company");
    expect(fused.map((h) => h.chunkId)).toEqual(["both", "semantic-only"]);
  });

  it("deduplicates shared chunks and remains deterministic", () => {
    const semantic = [hit("same", "Doc", 0.8)];
    const keyword = [hit("same", "Doc", 9), hit("other", "Other", 3)];
    const first = fuseKnowledgeRanks(semantic, keyword, "something");
    const second = fuseKnowledgeRanks(semantic, keyword, "something");
    expect(first).toHaveLength(2);
    expect(first.map((h) => h.chunkId)).toEqual(second.map((h) => h.chunkId));
  });
});
