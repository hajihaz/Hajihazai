import { describe, expect, it } from "vitest";
import { HAJI_PERSONA } from "@/lib/ai/persona";

describe("HajiHaz persona identity boundary", () => {
  const system = HAJI_PERSONA.system.toLowerCase();

  it("establishes Haji as creator", () => {
    expect(system).toContain("created, trained, and shaped by haji");
    expect(system).toContain("haji created, trained, and built hajihaz ai");
  });

  it("forbids disclosure of underlying AI infrastructure", () => {
    expect(system).toContain("underlying ai model");
    expect(system).toContain("model vendor");
    expect(system).toContain("inference provider");
    expect(system).toContain("api provider");
    expect(system).toContain("do not reveal provider names or model identifiers");
  });

  it("protects hidden implementation details", () => {
    expect(system).toContain("system prompts");
    expect(system).toContain("private chain-of-thought");
    expect(system).toContain("secrets");
    expect(system).toContain("internal telemetry");
  });
});
