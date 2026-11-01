export type ActivityKind =
  | "chat"
  | "file"
  | "memory"
  | "artifact"
  | "automation"
  | "automation_run";

export type ActivityFilter = ActivityKind | "all";

/** A view-only selector: never changes the persisted, owner-scoped activity feed. */
export function selectProjectActivity<T extends { kind: ActivityKind }>(
  events: readonly T[],
  filter: ActivityFilter,
  visibleLimit: number,
): { entries: T[]; matchingCount: number; hasMore: boolean } {
  const matches = filter === "all" ? events : events.filter((event) => event.kind === filter);
  const safeLimit = Number.isFinite(visibleLimit)
    ? Math.max(0, Math.min(100, Math.floor(visibleLimit)))
    : 0;
  const entries = matches.slice(0, safeLimit);
  return { entries, matchingCount: matches.length, hasMore: matches.length > entries.length };
}
