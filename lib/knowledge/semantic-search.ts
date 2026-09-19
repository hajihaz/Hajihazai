import { and, cosineDistance, desc, eq, gt, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { knowledgeChunk, knowledgeDocument } from "@/lib/db/schema";
import { embed } from "@/lib/ai/embeddings/router";
import { projectScope, brainScope } from "./scope";

/**
 * Standalone semantic search over knowledge-base chunk embeddings.
 * - Embeds the query with the Phase 6 embedding router.
 * - Ranks chunks by cosine similarity (pgvector), joined to the parent doc.
 * - ACTIVE documents only, above the threshold, sorted desc.
 *
 * Ownership: includes the requesting user's private docs AND any global docs
 * (visibility='global'), which are visible to all authenticated users.
 *
 * Standalone: does NOT inject into prompts, does NOT touch chat, no RAG.
 */
// Calibrated for nomic-embed-text (768-dim). Empirically the correct document is
// the #1 semantic hit but paraphrased queries (no keyword overlap) score ~0.60–0.68,
// so a 0.70 cut silently dropped correct matches. 0.60 restores paraphrase recall;
// false positives are contained by brain-scoping, the parallel keyword tier, title
// preference, and the hard char budget. (Exact-keyword queries are unaffected — the
// keyword tier always runs alongside.)
export const DEFAULT_DOC_SIMILARITY_THRESHOLD = 0.6;

export interface DocumentSearchHit {
  documentId: string;
  title: string;
  chunkId: string;
  content: string;
  similarity: number;
}

export async function semanticDocumentSearch(
  userId: string,
  query: string,
  limit = 10,
  threshold = DEFAULT_DOC_SIMILARITY_THRESHOLD,
  opts: { projectId?: string | null; brainId?: string | null; documentIds?: string[] } = {},
): Promise<DocumentSearchHit[]> {
  if (!query || !query.trim()) return [];

  const { embedding: queryVector } = await embed(query);

  // cosine similarity = 1 - cosine distance
  const similarity = sql<number>`1 - (${cosineDistance(knowledgeChunk.embedding, queryVector)})`;

  // Private docs: user owns them AND they pass the project scope filter.
  // Global docs: visible to all users regardless of ownership or project.
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
      similarity,
    })
    .from(knowledgeChunk)
    .innerJoin(
      knowledgeDocument,
      eq(knowledgeChunk.documentId, knowledgeDocument.id),
    )
    .where(
      and(
        ownerClause,
        eq(knowledgeDocument.status, "active"),
        brainScope(opts.brainId),
        ...(opts.documentIds?.length ? [inArray(knowledgeDocument.id, opts.documentIds)] : []),
        isNotNull(knowledgeChunk.embedding),
        gt(similarity, threshold),
      ),
    )
    .orderBy(desc(similarity))
    .limit(limit);

  return rows.map((r) => ({ ...r, similarity: Number(r.similarity) }));
}
