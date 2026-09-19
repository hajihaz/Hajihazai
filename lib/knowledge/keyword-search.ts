import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeChunk, knowledgeDocument } from "@/lib/db/schema";
import { projectScope, brainScope } from "./scope";
import type { DocumentSearchHit } from "./semantic-search";

/**
 * Keyword retrieval over knowledge chunks — the reliable fallback that works
 * even when chunks are NOT embedded or the embedding provider is down.
 *
 * Ranks by query-term matches in the chunk (ILIKE), with a boost for matches in
 * the document TITLE (exact-title / article-number preference). Numeric tokens
 * (e.g. "14", "21", "32") are preserved so "article 14" ranks Article 14 first.
 * Small typos in entity/person names are fuzzy-corrected so "hajij"→haji,
 * "alimm"→alim, "safna"→safina still retrieve the right documents.
 */

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "of", "at", "in",
  "on", "to", "for", "and", "or", "as", "by", "with", "which", "what", "who",
  "whom", "whose", "does", "do", "did", "where", "when", "how", "why", "i",
  "you", "he", "she", "it", "we", "they", "my", "his", "her", "their", "this",
  "that", "these", "those", "from", "about",
]);

/** Known entity / person / place / business names for typo correction. */
const ENTITY_VOCAB = [
  "haji", "alim", "safina", "shehnaz", "nisha", "sahabuddin", "hamza",
  "hidhayaa", "kabeer", "azees", "kaif", "abul", "selva", "sundar", "hussain",
  "meeran", "mohamed", "backer", "allbee", "suplaykart", "nagore", "chennai",
];

export function tokenize(query: string): string[] {
  const seen = new Set<string>();
  for (const raw of query.toLowerCase().split(/[^a-z0-9]+/)) {
    // Require ≥3 chars, EXCEPT pure numbers (e.g. article "14"/"21"/"32", years)
    // which are legal/reference-bearing and must not be discarded. Short words
    // (hi, ok) still dropped — they ILIKE-match across the whole corpus.
    const isNumber = /^\d+$/.test(raw);
    if ((raw.length < 3 && !isNumber) || STOPWORDS.has(raw)) continue;
    seen.add(raw);
  }
  return [...seen];
}

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

/** For a small-typo token, the canonical entity name it likely refers to. */
function fuzzyEntity(token: string): string | null {
  if (token.length < 4) return null;
  for (const e of ENTITY_VOCAB) {
    if (Math.abs(token.length - e.length) <= 1 && editDistance(token, e) === 1) return e;
  }
  return null;
}

/** Query terms + fuzzy-corrected entity names for typo tolerance. */
export function expandedTerms(query: string): string[] {
  const base = tokenize(query);
  const extra = base.map(fuzzyEntity).filter((e): e is string => e !== null);
  return [...new Set([...base, ...extra])];
}

export async function keywordDocumentSearch(
  userId: string,
  query: string,
  opts: { projectId?: string | null; brainId?: string | null; limit?: number; documentIds?: string[] } = {},
): Promise<DocumentSearchHit[]> {
  const terms = expandedTerms(query);
  if (terms.length === 0) return [];
  const limit = opts.limit ?? 10;

  // Content matches (+1 each) plus a TITLE match boost (+2 each) so exact-title
  // and article-number references rank first.
  const contentScore = sql.join(
    terms.map((t) => sql`(case when ${knowledgeChunk.content} ilike ${"%" + t + "%"} then 1 else 0 end)`),
    sql` + `,
  );
  const titleScore = sql.join(
    terms.map((t) => sql`(case when ${knowledgeDocument.title} ilike ${"%" + t + "%"} then 2 else 0 end)`),
    sql` + `,
  );
  // Entity boost — founder / ownership / CEO queries strongly prefer the document
  // whose TITLE is "…Founders" (the authoritative source for those facts), so
  // "who founded allbee" ranks AllBee — Founders #1 over Company Overview.
  const foundingQuery = /\b(found|founder|founded|founding|owner|ownership|owns|ceo|cfo)\b/.test(query.toLowerCase());
  const founderBoost = foundingQuery
    ? sql`(case when ${knowledgeDocument.title} ilike ${"%founder%"} then 5 else 0 end)`
    : sql`0`;
  const score = sql<number>`((${contentScore}) + (${titleScore}) + (${founderBoost}))`;
  const anyMatch = sql`(${sql.join(
    terms.map((t) => sql`(${knowledgeChunk.content} ilike ${"%" + t + "%"} or ${knowledgeDocument.title} ilike ${"%" + t + "%"})`),
    sql` or `,
  )})`;

  const privateOwner =
    opts.projectId !== undefined
      ? and(eq(knowledgeDocument.userId, userId), projectScope(opts.projectId)!)
      : eq(knowledgeDocument.userId, userId);
  const ownerClause = or(privateOwner, eq(knowledgeDocument.visibility, "global"));

  const rows = await db
    .select({
      documentId: knowledgeDocument.id,
      title: knowledgeDocument.title,
      chunkId: knowledgeChunk.id,
      content: knowledgeChunk.content,
      score,
    })
    .from(knowledgeChunk)
    .innerJoin(knowledgeDocument, eq(knowledgeChunk.documentId, knowledgeDocument.id))
    .where(
      and(
        ownerClause,
        eq(knowledgeDocument.status, "active"),
        brainScope(opts.brainId),
        ...(opts.documentIds?.length ? [inArray(knowledgeDocument.id, opts.documentIds)] : []),
        anyMatch,
      ),
    )
    .orderBy(desc(score))
    .limit(limit);

  return rows.map((r) => ({
    documentId: r.documentId,
    title: r.title,
    chunkId: r.chunkId,
    content: r.content,
    similarity: Number(r.score),
  }));
}
