import { describe, it, expect } from "vitest";
import { exportToolSpecs } from "@/lib/tools/specs";

describe("tool specs export", () => {
  it("exports every registered tool with schemas", () => {
    const specs = exportToolSpecs();
    const names = specs.map((s) => s.name).sort();
    expect(names).toEqual([
      "calculator",
      "current_time",
      "hajihaz_commander",
      "knowledge_search",
      "memory_search",
    ]);
  });

  it("every spec has an object schema with properties", () => {
    for (const s of exportToolSpecs()) {
      expect(s.schema.type).toBe("object");
      expect(typeof s.schema.properties).toBe("object");
      expect(typeof s.description).toBe("string");
    }
  });

  it("calculator requires expression", () => {
    const c = exportToolSpecs().find((s) => s.name === "calculator")!;
    expect(c.schema.required).toEqual(["expression"]);
    expect(c.schema.properties).toHaveProperty("expression");
  });

  it("memory_search and knowledge_search require query", () => {
    const m = exportToolSpecs().find((s) => s.name === "memory_search")!;
    const k = exportToolSpecs().find((s) => s.name === "knowledge_search")!;
    expect(m.schema.required).toEqual(["query"]);
    expect(k.schema.required).toEqual(["query"]);
  });

  it("current_time requires nothing", () => {
    const t = exportToolSpecs().find((s) => s.name === "current_time")!;
    expect(t.schema.required ?? []).toEqual([]);
  });
});
