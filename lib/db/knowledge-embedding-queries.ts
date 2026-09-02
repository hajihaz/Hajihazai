import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import { knowledgeChunk, knowledgeDocument } from "./schema";

/**
 * Phase 7.3 — Chunk embedding storage. Ownership via the parent document.
 * Storage only — no retrieval / similarity search.
 */

async function ownedDocument(userId: string, documentId: string) {
  const [doc] = await db
    .select({ id: knowledgeDocument.id })
    .from(knowledgeDocument)
    .where(
      and(
        eq(knowledgeDocument.id, documentId),
        eq(knowledgeDocument.userId, userId),
      ),
    );
  return doc ?? null;
}

/** Store one chunk's embedding (scoped to a document the user owns). */
export async function storeChunkEmbedding(
  userId: string,
  documentId: string,
  chunkId: string,
  embedding: number[],
) {
  if (!(await ownedDocument(userId, documentId))) return null;
  const [row] = await db
    .update(knowledgeChunk)
    .set({ embedding })
    .where(
      and(
        eq(knowledgeChunk.id, chunkId),
        eq(knowledgeChunk.documentId, documentId),
      ),
    )
    .returning({ id: knowledgeChunk.id });
  return row ?? null;
}

/** Counts of total vs embedded chunks for a document (user-scoped). */
export async function getChunkEmbeddingStatus(
  userId: string,
  documentId: string,
) {
  if (!(await ownedDocument(userId, documentId))) return null;

  // Count in Postgres instead of loading every 768-dimensional vector into the
  // server just to determine whether it exists. This matters for large docs.
  const [row] = await db
    .select({
      total: count(),
      embedded: sql<number>`count(*) filter (where ${knowledgeChunk.embedding} is not null)`.mapWith(Number),
    })
    .from(knowledgeChunk)
    .where(eq(knowledgeChunk.documentId, documentId));

  return {
    total: Number(row?.total ?? 0),
    embedded: Number(row?.embedded ?? 0),
  };
}

/** Chunks belonging to a document that the user owns (for embedding). */
export async function listOwnedChunks(userId: string, documentId: string) {
  if (!(await ownedDocument(userId, documentId))) return null;
  return db
    .select({ id: knowledgeChunk.id, content: knowledgeChunk.content })
    .from(knowledgeChunk)
    .where(eq(knowledgeChunk.documentId, documentId));
}

/** Only chunks still missing a vector; used by retryable indexing. */
export async function listOwnedUnembeddedChunks(userId: string, documentId: string) {
  if (!(await ownedDocument(userId, documentId))) return null;
  return db
    .select({ id: knowledgeChunk.id, content: knowledgeChunk.content })
    .from(knowledgeChunk)
    .where(
      and(
        eq(knowledgeChunk.documentId, documentId),
        isNull(knowledgeChunk.embedding),
      ),
    );
}
