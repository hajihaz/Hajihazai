/**
 * HajiHaz research planner — deterministic query decomposition.
 *
 * A research request should not depend on one search formulation. This module
 * creates a small set of complementary queries without calling an LLM.
 */
export interface ResearchQueryPlan {
  queries: string[];
  maxParallel: number;
  reason: string;
}

const CURRENT_RE =
  /\b(current|currently|latest|today|now|right now|live|recent|as of)\b/i;
const COMPARE_RE =
  /\b(compare|comparison|versus|\bvs\b|difference|different|better|best)\b/i;
const AUTHORITY_RE =
  /\b(law|legal|government|election|minister|president|court|regulation|official|statistics|statistic|policy)\b/i;

function addUnique(out: string[], query: string): void {
  const q = query.trim();
  if (q && !out.some((x) => x.toLowerCase() === q.toLowerCase())) out.push(q);
}

/** Build up to three complementary search formulations for a research turn. */
export function planResearchQueries(
  message: string,
  depth: "quick" | "smart" | "research",
): ResearchQueryPlan {
  const base = message.trim();
  if (!base || depth !== "research")
    return {
      queries: base ? [base] : [],
      maxParallel: 1,
      reason: "single-query path",
    };

  const queries: string[] = [];
  addUnique(queries, base);

  if (CURRENT_RE.test(base)) {
    addUnique(queries, `${base} latest authoritative sources`);
  }
  if (AUTHORITY_RE.test(base)) {
    addUnique(queries, `${base} official source`);
  } else if (COMPARE_RE.test(base)) {
    addUnique(queries, `${base} independent comparison`);
  } else {
    addUnique(queries, `${base} primary sources`);
  }

  return {
    queries: queries.slice(0, 3),
    maxParallel: Math.min(3, queries.length),
    reason:
      queries.length > 1
        ? "complementary formulations for evidence coverage"
        : "single-query research",
  };
}
