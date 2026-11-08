export type ProjectDiscoveryItem = {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  updatedAt?: string | null;
};

export type ProjectSort = "recent" | "name" | "name-desc";

function recentTime(project: ProjectDiscoveryItem): number {
  const value = project.updatedAt ? Date.parse(project.updatedAt) : NaN;
  return Number.isFinite(value) ? value : 0;
}

/** Owner-local project discovery: match every term across metadata. */
export function discoverProjects<T extends ProjectDiscoveryItem>(
  projects: readonly T[],
  query: string,
  sort: ProjectSort = "recent",
): T[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return projects
    .filter((p) => {
      const haystack = [p.name, p.description ?? "", p.instructions ?? ""].join(" ").toLocaleLowerCase();
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || a.id.localeCompare(b.id);
      if (sort === "name") return byName;
      if (sort === "name-desc") return -byName;
      return recentTime(b) - recentTime(a) || byName;
    });
}
