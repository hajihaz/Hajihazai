/**
 * Hard verification gate (Rule #4). The invariant test at the bottom is the
 * whole point of the fix: enumerate every input combination and assert there is
 * NO case where a verification-required query with failed verification is allowed
 * to answer.
 */
import { describe, it, expect } from "vitest";
import { decideGate, isRefusal, type GateInput, type WebIntent } from "@/lib/web/verify";

const base: GateInput = {
  intent: "internal",
  searchEnabled: true,
  searchAttempted: false,
  searchResultCount: 0,
  trustedResultCount: 0,
  fetchAttempted: false,
  fetchOk: false,
  internalKnowledgeCount: 0,
};

describe("decideGate — explicit cases", () => {
  it("internal always answers (unchanged path)", () => {
    expect(decideGate({ ...base, intent: "internal" })).toEqual({ action: "answer_internal" });
  });

  it("web with verified results answers", () => {
    expect(decideGate({ ...base, intent: "web", searchAttempted: true, searchResultCount: 3, trustedResultCount: 1 })).toEqual({
      action: "answer_web",
    });
  });

  it("web with NO results refuses", () => {
    const d = decideGate({ ...base, intent: "web", searchAttempted: true, searchResultCount: 0 });
    expect(d.action).toBe("refuse_unverified");
  });

  it("web with results from untrusted sources refuses", () => {
    const d = decideGate({ ...base, intent: "web", searchAttempted: true, searchResultCount: 3, trustedResultCount: 0 });
    expect(d.action).toBe("refuse_unverified");
    expect(d.reason).toContain("trusted");
  });

  it("web with search disabled refuses", () => {
    const d = decideGate({ ...base, intent: "web", searchEnabled: false });
    expect(d.action).toBe("refuse_unverified");
  });

  it("website with a good fetch answers", () => {
    expect(decideGate({ ...base, intent: "website", fetchAttempted: true, fetchOk: true })).toEqual({
      action: "answer_website",
    });
  });

  it("website with a failed fetch refuses (never summarizes from memory)", () => {
    const d = decideGate({ ...base, intent: "website", fetchAttempted: true, fetchOk: false });
    expect(d.action).toBe("refuse_fetch");
  });

  it("website with no fetch attempted refuses", () => {
    const d = decideGate({ ...base, intent: "website" });
    expect(d.action).toBe("refuse_fetch");
  });

  it("hybrid verified → answers with live", () => {
    expect(decideGate({ ...base, intent: "hybrid", searchAttempted: true, searchResultCount: 2, trustedResultCount: 1 })).toEqual({
      action: "answer_hybrid",
      liveVerified: true,
    });
  });

  it("hybrid with failed live but internal facts → answers internal, live unverified", () => {
    expect(decideGate({ ...base, intent: "hybrid", searchAttempted: true, searchResultCount: 0, trustedResultCount: 0, internalKnowledgeCount: 4 })).toEqual({
      action: "answer_hybrid",
      liveVerified: false,
    });
  });

  it("hybrid with failed live AND no internal facts → refuses", () => {
    const d = decideGate({ ...base, intent: "hybrid", searchAttempted: true, searchResultCount: 0, trustedResultCount: 0, internalKnowledgeCount: 0 });
    expect(d.action).toBe("refuse_unverified");
  });
});

describe("INVARIANT: no verification-required + failed path ever answers", () => {
  const intents: WebIntent[] = ["internal", "web", "hybrid", "website"];
  const bools = [false, true];

  it("exhaustive enumeration", () => {
    let checked = 0;
    for (const intent of intents)
      for (const searchEnabled of bools)
        for (const searchAttempted of bools)
          for (const searchResultCount of [0, 5])
            for (const trustedResultCount of [0, 1])
            for (const fetchAttempted of bools)
              for (const fetchOk of bools)
                for (const internalKnowledgeCount of [0, 3]) {
                  const input: GateInput = {
                    intent, searchEnabled, searchAttempted, searchResultCount,
                    fetchAttempted, fetchOk, internalKnowledgeCount,
                  };
                  const d = decideGate(input);
                  checked++;

                  // A pure-web query may only "answer_web" when a search actually returned results.
                  if (d.action === "answer_web") {
                    expect(input.intent).toBe("web");
                    expect(input.searchAttempted && input.searchResultCount > 0).toBe(true);
                  }
                  // A website query may only "answer_website" when a fetch actually succeeded.
                  if (d.action === "answer_website") {
                    expect(input.intent).toBe("website");
                    expect(input.fetchAttempted && input.fetchOk).toBe(true);
                  }
                  // Hybrid may only answer when it has EITHER verified live results OR internal facts.
                  if (d.action === "answer_hybrid") {
                    expect(input.intent).toBe("hybrid");
                    const grounded =
                      (input.searchAttempted && input.searchResultCount > 0 && input.trustedResultCount > 0) || input.internalKnowledgeCount > 0;
                    expect(grounded).toBe(true);
                  }
                  // website/web that did NOT verify must be a refusal.
                  if (input.intent === "website" && !(input.fetchAttempted && input.fetchOk)) {
                    expect(isRefusal(d)).toBe(true);
                  }
                  if (input.intent === "web" && !(input.searchEnabled && input.searchAttempted && input.searchResultCount > 0)) {
                    expect(isRefusal(d)).toBe(true);
                  }
                }
    expect(checked).toBe(intents.length * 2 * 2 * 2 * 2 * 2 * 2 * 2);
  });
});
