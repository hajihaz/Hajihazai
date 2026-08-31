import { describe, expect, it } from "vitest";
import { buildEvidenceLedger, renderEvidenceLedger } from "../lib/ai/evidence";

describe("evidence ledger", () => {
  it("deduplicates evidence and assigns stable source IDs", () => {
    const l = buildEvidenceLedger([
      { id: "WEB-1", kind: "web", title: "A", source: "https://a.test", content: "Evidence A" },
      { id: "WEB-1", kind: "web", title: "A duplicate", source: "https://a.test", content: "Evidence A2" },
      { id: "WEB-2", kind: "web", title: "B", source: "https://b.test", content: "Evidence B" },
    ]);
    expect(l.items).toHaveLength(2);
    expect(renderEvidenceLedger(l)).toContain("[WEB-1] A");
    expect(renderEvidenceLedger(l)).toContain("Use evidence to support factual claims");
  });
});
