import { classifyMemoryRetrievalMethod } from "@/lib/memory/context";

describe("memory retrieval telemetry", () => {
  it("reports hybrid when both retrieval tiers contribute", () => {
    expect(classifyMemoryRetrievalMethod(3, 5)).toBe("hybrid");
  });

  it("keeps semantic-only and keyword-fallback semantics precise", () => {
    expect(classifyMemoryRetrievalMethod(2, 0)).toBe("semantic");
    expect(classifyMemoryRetrievalMethod(0, 4)).toBe("keyword-fallback");
  });

  it("does not call an empty retrieval a keyword fallback", () => {
    expect(classifyMemoryRetrievalMethod(0, 0)).toBe("none");
  });
});
