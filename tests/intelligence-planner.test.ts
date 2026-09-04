import { describe, expect, it } from "vitest";
import { planIntelligence, shouldRequestBrainClarification } from "../lib/ai/intelligence-planner";
import { levelForIntelligenceDepth } from "../lib/ai/levels";

describe("intelligence planner", () => {
  it("keeps small talk on the quick path", () => {
    const p = planIntelligence("hi");
    expect(p.depth).toBe("quick");
    expect(p.retrieveMemory).toBe(false);
    expect(p.retrieveKnowledge).toBe(false);
    expect(p.searchWeb).toBe(false);
  });

  it("plans current-event questions as fast smart + live web", () => {
    const p = planIntelligence("Who is the current Chief Minister of Tamil Nadu?");
    expect(p.depth).toBe("smart");
    expect(p.webIntent).toBe("web");
    expect(p.requiresLiveVerification).toBe(true);
    expect(p.searchWeb).toBe(true);
    expect(p.researchQueries).toEqual([p.retrievalQuery]);
  });

  it.each([
    "Who is the current industrial minister of Tamil Nadu?",
    "Who is the current finance minister of Tamil Nadu?",
    "Who is the current industry minister of Tamil Nadu?",
    "Who is PM of India?",
    "Who is president of USA?",
    "Who is CM of TN?",
  ])("routes current office-holder query to live web: %s", (query) => {
    const p = planIntelligence(query);
    expect(p.webIntent).toBe("web");
    expect(p.requiresLiveVerification).toBe(true);
    expect(p.searchWeb).toBe(true);
    expect(p.retrieveKnowledge).toBe(false);
    expect(p.brainSlug).toBeNull();
  });

  it("plans internal business questions for knowledge retrieval", () => {
    const p = planIntelligence("What are Suplaykart's current revenue plans?");
    expect(p.retrieveMemory).toBe(true);
    expect(p.retrieveKnowledge).toBe(true);
    expect(p.brainSlug).toBe("suplaykart");
    expect(p.webIntent).toBe("internal");
  });

  it("plans cross-business questions as multi-brain", () => {
    const p = planIntelligence("Compare AllBee and Suplaykart");
    expect(p.multiBrains).toEqual(expect.arrayContaining(["allbee", "suplaykart"]));
    expect(p.multiBrains.length).toBeGreaterThanOrEqual(2);
    expect(p.retrieveKnowledge).toBe(true);
  });

  it("marks explicit website research as website fetch", () => {
    const p = planIntelligence("Summarize https://example.com");
    expect(p.depth).toBe("research");
    expect(p.webIntent).toBe("website");
    expect(p.fetchWebsite).toBe(true);
    expect(p.searchWeb).toBe(false);
  });
});


describe("intelligence depth → model level", () => {
  it("keeps quick turns on the low tier", () => {
    expect(levelForIntelligenceDepth("quick")).toBe("low");
  });

  it("uses the stronger tier for smart and research turns", () => {
    expect(levelForIntelligenceDepth("smart")).toBe("medium");
    expect(levelForIntelligenceDepth("research")).toBe("medium");
  });
});

describe("clarification policy", () => {
  it("does not treat pure live-web queries as brain clarification candidates", () => {
    const p = planIntelligence("Who is the current Chief Minister of Tamil Nadu?");
    expect(p.webIntent).toBe("web");
    expect(p.brainSlug).toBeNull();
    expect(p.searchWeb).toBe(true);
  });

  it("still leaves genuinely unrouted internal questions eligible for clarification", () => {
    const p = planIntelligence("What should I focus on next?");
    expect(p.webIntent).toBe("internal");
    expect(p.brainSlug).toBeNull();
    expect(p.retrieveKnowledge).toBe(false);
  });
});

describe("brain clarification targeting", () => {
  it("only requests clarification for genuinely domain-specific unrouted questions", () => {
    expect(shouldRequestBrainClarification("What should I focus on next?", {
      webIntent: "internal", retrieveMemory: true, brainMode: "smart", multiBrains: [],
    })).toBe(false);
    expect(shouldRequestBrainClarification("Who is the founder?", {
      webIntent: "internal", retrieveMemory: true, brainMode: "smart", multiBrains: [],
    })).toBe(true);
  });

  it("never requests brain clarification for live-web, manual, or multi-brain turns", () => {
    const base = { retrieveMemory: true };
    expect(shouldRequestBrainClarification("Who is the founder?", { ...base, webIntent: "web", brainMode: "smart", multiBrains: [] })).toBe(false);
    expect(shouldRequestBrainClarification("Who is the founder?", { ...base, webIntent: "internal", brainMode: "manual", multiBrains: [] })).toBe(false);
    expect(shouldRequestBrainClarification("Who is the founder?", { ...base, webIntent: "internal", brainMode: "smart", multiBrains: ["allbee", "suplaykart"] })).toBe(false);
  });
});
