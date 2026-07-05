/**
 * Expanded intent classification (Rule #6) + URL extraction + website intent.
 * Pure functions — no network.
 */
import { describe, it, expect } from "vitest";
import { classifyQuery, extractUrl, requiresLiveVerification } from "@/lib/web/classify";

describe("classifyQuery — current-event detection must trigger web (Rule #6)", () => {
  const MUST_BE_WEB = [
    "who is cm of tn",
    "who is chief minister of tamil nadu",
    "who is the chief minister of tamil nadu",
    "current cm of tamil nadu",
    "who is thalapathy",
    "who is the prime minister of india",
    "current pm of india",
    "latest news in tamil nadu",
    "latest india news",
    "today's news",
    "breaking news",
    "latest updates",
    "current weather in chennai",
    "reliance stock price",
    "who won the match today",
    "who is the ceo of google",
    "net worth of elon musk",
    "top 10 richest people",
  ];
  for (const q of MUST_BE_WEB) {
    it(`"${q}" → web`, () => {
      expect(classifyQuery(q)).toBe("web");
      expect(requiresLiveVerification(classifyQuery(q))).toBe(true);
    });
  }
});

describe("classifyQuery — website intent", () => {
  const MUST_BE_WEBSITE = [
    "summarize rknassociates.com",
    "Summarize https://rknassociates.com",
    "what does rknassociates.com do",
    "tell me about acme.io",
    "analyze https://example.org/about",
    "rknassociates.com",
    "review stripe.com",
  ];
  for (const q of MUST_BE_WEBSITE) {
    it(`"${q}" → website`, () => {
      expect(classifyQuery(q)).toBe("website");
      expect(requiresLiveVerification(classifyQuery(q))).toBe(true);
    });
  }
});

describe("classifyQuery — internal stays internal (no over-trigger / regressions)", () => {
  const MUST_BE_INTERNAL = [
    "who are you",
    "who am i",
    "what can you do",
    "help me write a function",
    "explain recursion",
    "Who is Haji?",
    "Who founded AllBee?",
    "What is Suplaykart?",
    "Is Suplaykart currently open?",
    "What is Haji's current goal?",
    "email me at bob@company.com when done",
  ];
  for (const q of MUST_BE_INTERNAL) {
    it(`"${q}" → internal`, () => {
      expect(classifyQuery(q)).toBe("internal");
      expect(requiresLiveVerification(classifyQuery(q))).toBe(false);
    });
  }
});

describe("classifyQuery — hybrid for internal entity + live/external facet", () => {
  it("keeps internal authoritative while adding the world", () => {
    expect(classifyQuery("What is the latest news about Suplaykart?")).toBe("hybrid");
    expect(classifyQuery("Compare AllBee with current web design agencies.")).toBe("hybrid");
  });
});

describe("extractUrl", () => {
  it("pulls explicit URLs and strips trailing punctuation", () => {
    expect(extractUrl("see https://example.com/path.")).toBe("https://example.com/path");
    expect(extractUrl("(https://a.io/x)")).toBe("https://a.io/x");
  });
  it("upgrades bare domains to https", () => {
    expect(extractUrl("summarize rknassociates.com")).toBe("https://rknassociates.com");
    expect(extractUrl("foo.co.in please")).toBe("https://foo.co.in");
  });
  it("ignores emails and non-domains", () => {
    expect(extractUrl("bob@company.com")).toBeNull();
    expect(extractUrl("open main.ts and helper.js")).toBeNull();
    expect(extractUrl("version 2.0.1 released")).toBeNull();
    expect(extractUrl("no url here")).toBeNull();
  });
});
