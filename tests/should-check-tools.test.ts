import { describe, it, expect } from "vitest";
import { shouldCheckTools } from "@/lib/tools/should-check-tools";

describe("shouldCheckTools (fast path)", () => {
  it("skips obvious small talk", () => {
    for (const m of [
      "hello",
      "how are you",
      "good morning",
      "thank you",
      "tell me a joke",
      "who are you",
    ]) {
      expect(shouldCheckTools(m)).toBe(false);
    }
  });

  it("runs detection for arithmetic", () => {
    expect(shouldCheckTools("what is 22 * 475000")).toBe(true);
    expect(shouldCheckTools("calculate 50000 + 70000")).toBe(true);
    expect(shouldCheckTools("what's 18% of 120000")).toBe(true);
  });

  it("runs detection for time", () => {
    expect(shouldCheckTools("what time is it?")).toBe(true);
    expect(shouldCheckTools("what's today's date")).toBe(true);
  });

  it("runs detection for memory / knowledge / search", () => {
    expect(shouldCheckTools("do you remember my company name")).toBe(true);
    expect(shouldCheckTools("what does my handbook say about vacation")).toBe(true);
    expect(shouldCheckTools("search my notes for the policy")).toBe(true);
  });

  it("detects customer-computer intent in natural language without saying HHC", () => {
    for (const q of ["show my Mac system info", "check my computer status",
      "read a file on my computer", "run git status on my laptop",
      "list files on my Mac", "inspect my terminal"]) {
      expect(shouldCheckTools(q), q).toBe(true);
    }
  });

  it("returns false for empty / non-string input", () => {
    expect(shouldCheckTools("")).toBe(false);
    expect(shouldCheckTools("   ")).toBe(false);
    // @ts-expect-error testing runtime guard
    expect(shouldCheckTools(null)).toBe(false);
  });

  it("defaults to false for plain conversation with no tool signal", () => {
    expect(shouldCheckTools("I had a great weekend at the beach")).toBe(false);
  });
});
