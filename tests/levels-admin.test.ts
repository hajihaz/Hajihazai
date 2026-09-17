import { describe, it, expect } from "vitest";
import {
  listLevels,
  resolveLevel,
  defaultLevel,
  isLevelEnabled,
} from "@/lib/ai/levels";
import { isAdmin } from "@/lib/auth/admin";

describe("capability levels", () => {
  it("returns all four levels with High/Max available", () => {
    const ls = listLevels(() => true);
    expect(ls.map((l) => l.level)).toEqual(["low", "medium", "high", "max"]);
    const high = ls.find((l) => l.level === "high")!;
    const max = ls.find((l) => l.level === "max")!;
    expect(high.comingSoon).toBe(false);
    expect(high.available).toBe(true);
    expect(max.comingSoon).toBe(false);
    expect(max.available).toBe(true);
    expect(isLevelEnabled("high")).toBe(true);
    expect(isLevelEnabled("max")).toBe(true);
  });

  it("Low and Medium are available when a model is healthy", () => {
    const healthy = new Set(["groq:compound-mini", "groq:gpt-oss-120b", "groq:qwen3.6-27b", "openrouter:qwen-2.5-7b", "gemini:2.0-flash"]);
    const ls = listLevels((id) => healthy.has(id) || id === "gemini:2.0-flash");
    expect(ls.find((l) => l.level === "low")!.available).toBe(true);
    expect(ls.find((l) => l.level === "medium")!.available).toBe(true);
  });

  it("resolves each tier to its configured first usable model", () => {
    const healthy = new Set(["groq:compound-mini", "groq:gpt-oss-120b", "groq:qwen3.6-27b", "openrouter:qwen-2.5-7b", "gemini:2.0-flash"]);
    const usable = (id: string) => healthy.has(id);
    expect(resolveLevel("low", usable)).toBe("groq:qwen3.6-27b");
    expect(resolveLevel("medium", usable)).toBe("groq:compound-mini");
    expect(resolveLevel("high", usable)).toBe("groq:gpt-oss-120b");
    expect(resolveLevel("max", usable)).toBe("gemini:2.0-flash");
  });

  it("default level prefers Medium (it remaps down to any healthy model), null if none", () => {
    expect(defaultLevel(() => true)).toBe("medium");
    // Even if only the cheapest model is healthy, Medium remaps to it.
    expect(defaultLevel((id) => id === "openrouter:qwen-2.5-7b")).toBe("medium");
    expect(defaultLevel(() => false)).toBeNull();
  });
});

describe("admin debug gate (env-based, separate from the DB admin portal)", () => {
  it("matches ADMIN_EMAILS case-insensitively", () => {
    const prev = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "Owner@Example.com";
    try {
      expect(isAdmin("owner@example.com")).toBe(true);
      expect(isAdmin("nope@x.com")).toBe(false);
      expect(isAdmin(null)).toBe(false);
    } finally {
      if (prev !== undefined) process.env.ADMIN_EMAILS = prev;
      else delete process.env.ADMIN_EMAILS;
    }
  });
});
