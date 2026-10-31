import { describe, expect, it } from "vitest";
import { discoverProjects } from "@/lib/projects/project-discovery";

const projects = [
  { id: "3", name: "Atlas", description: "paper trades", instructions: "Research NSE only", updatedAt: "2026-10-30T10:00:00Z" },
  { id: "2", name: "Suplaykart", description: "Storefront", instructions: "mobile performance", updatedAt: "2026-10-31T10:00:00Z" },
  { id: "1", name: "HajiHaz", description: null, instructions: "Daily planning", updatedAt: "invalid date" },
] as const;

describe("project discovery", () => {
  it("sorts recent projects without mutating the source", () => {
    expect(discoverProjects(projects, "", "recent").map((p) => p.id)).toEqual(["2", "3", "1"]);
    expect(projects.map((p) => p.id)).toEqual(["3", "2", "1"]);
  });
  it("searches case-insensitively across name, description, and project instructions", () => {
    expect(discoverProjects(projects, "   NSE  paper ").map((p) => p.id)).toEqual(["3"]);
    expect(discoverProjects(projects, "PERFORMANCE").map((p) => p.id)).toEqual(["2"]);
    expect(discoverProjects(projects, "daily").map((p) => p.id)).toEqual(["1"]);
  });
  it("supports alphabetical sorting and stable empty results", () => {
    expect(discoverProjects(projects, "", "name").map((p) => p.id)).toEqual(["3", "1", "2"]);
    expect(discoverProjects(projects, "", "name-desc").map((p) => p.id)).toEqual(["2", "1", "3"]);
    expect(discoverProjects(projects, "unmatched")).toEqual([]);
  });
});
