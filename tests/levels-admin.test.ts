import { describe, it, expect } from "vitest";
import {
  listLevels,
  resolveLevel,
  defaultLevel,
  isLevelEnabled,
} from "@/lib/ai/levels";
import { isAdmin } from "@/lib/auth/admin";

describe("capability levels (Low/Medium active, High/Max coming soon)", () => {
  it("returns all four levels with High/Max marked coming soon", () => {
    const ls = listLevels(() => true);
    expect(ls.map((l) => l.level)).toEqual(["low", "medium", "high", "max"]);
    const high = ls.find((l) => l.level === "high")!;
    const max = ls.find((l) => l.level === "max")!;
    expect(high.comingSoon).toBe(true);
    expect(high.available).toBe(false);
    expect(max.comingSoon).toBe(true);
    expect(isLevelEnabled("high")).toBe(false);
    expect(isLevelEnabled("max")).toBe(false);
  });

  it("Low and Medium are available when a model is healthy", () => {
    const healthy = new Set(["groq:gpt-oss-120b", "groq:qwen3.6-27b", "openrouter:qwen-2.5-7b"]);
    const ls = listLevels((id) => healthy.has(id));
    expect(ls.find((l) => l.level === "low")!.available).toBe(true);
    expect(ls.find((l) => l.level === "medium")!.available).toBe(true);
  });

  it("resolves Low to cheapest, Medium to best; High/Max never resolve", () => {
    const healthy = new Set(["groq:gpt-oss-120b", "groq:qwen3.6-27b", "openrouter:qwen-2.5-7b"]);
    const usable = (id: string) => healthy.has(id);
    expect(resolveLevel("low", usable)).toBe("groq:qwen3.6-27b");
    expect(resolveLevel("medium", usable)).toBe("groq:gpt-oss-120b");
    expect(resolveLevel("high", usable)).toBeNull();
    expect(resolveLevel("max", usable)).toBeNull();
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
