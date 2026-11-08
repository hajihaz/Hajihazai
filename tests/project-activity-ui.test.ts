import { describe, expect, it } from "vitest";
import { selectProjectActivity, type ActivityKind } from "@/lib/projects/project-activity-ui";

const activity: { id: number; kind: ActivityKind }[] = [
  { id: 1, kind: "automation_run" },
  { id: 2, kind: "chat" },
  { id: 3, kind: "artifact" },
  { id: 4, kind: "chat" },
  { id: 5, kind: "file" },
  { id: 6, kind: "memory" },
  { id: 7, kind: "automation" },
];

describe("project activity display", () => {
  it("preserves unified chronology without mutating source events", () => {
    const selected = selectProjectActivity(activity, "all", 3);
    expect(selected.entries.map((item) => item.id)).toEqual([1, 2, 3]);
    expect(selected.matchingCount).toBe(7);
    expect(selected.hasMore).toBe(true);
    expect(activity.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("filters by event kind and reports matching counts", () => {
    expect(selectProjectActivity(activity, "chat", 12)).toEqual({
      entries: [activity[1], activity[3]],
      matchingCount: 2,
      hasMore: false,
    });
    expect(selectProjectActivity(activity, "automation_run", 12).entries).toEqual([activity[0]]);
    expect(selectProjectActivity(activity, "file", 0).hasMore).toBe(true);
  });

  it("limits displayed events even if a caller supplies a large or invalid count", () => {
    const data = Array.from({ length: 110 }, (_, i) => ({ id: i, kind: "chat" as const }));
    expect(selectProjectActivity(data, "all", 10_000).entries).toHaveLength(100);
    expect(selectProjectActivity(data, "all", Number.NaN).entries).toHaveLength(0);
    expect(selectProjectActivity(data, "all", -10).entries).toHaveLength(0);
  });

  it("treats absent kinds as a normal empty view, not an error", () => {
    expect(selectProjectActivity(activity, "automation_run", 15).matchingCount).toBe(1);
    expect(selectProjectActivity([], "all", 12)).toEqual({
      entries: [], matchingCount: 0, hasMore: false,
    });
  });
});
