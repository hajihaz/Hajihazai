import { and, asc, eq } from "drizzle-orm";
import { db } from "./index";
import { knowledgeChunk, knowledgeDocument } from "./schema";
import type { Chunk } from "@/lib/knowledge/chunk";

/**
 * Phase 7.2 — Chunk storage. Ownership enforced THROUGH the parent document.
 * No embeddings / retrieval — chunk rows only.
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

/** Replace any existing chunks for the document with the given ordered set. */
export async function createChunks(
  userId: string,
  documentId: string,
  chunks: Chunk[],
) {
  if (!(await ownedDocument(userId, documentId))) return null;

  // Replace the searchable index atomically. A failed insert must never leave
  // the document with a partially regenerated chunk set.
  return db.transaction(async (tx) => {
    await tx
      .delete(knowledgeChunk)
      .where(eq(knowledgeChunk.documentId, documentId));

    if (chunks.length === 0) return [];

    return tx
      .insert(knowledgeChunk)
      .values(
        chunks.map((c) => ({
          documentId,
          chunkIndex: c.chunkIndex,
          content: c.content,
        })),
      )
      .returning();
  });
}

export async function listChunks(userId: string, documentId: string) {
  if (!(await ownedDocument(userId, documentId))) return null;
  return db
    .select()
    .from(knowledgeChunk)
    .where(eq(knowledgeChunk.documentId, documentId))
    .orderBy(asc(knowledgeChunk.chunkIndex));
}

export async function deleteChunks(userId: string, documentId: string) {
  if (!(await ownedDocument(userId, documentId))) return null;
  return db
    .delete(knowledgeChunk)
    .where(eq(knowledgeChunk.documentId, documentId))
    .returning();
}
