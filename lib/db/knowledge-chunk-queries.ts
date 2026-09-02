import { and, asc, eq } from "drizzle-orm";
import { db } from "./index";
import { knowledgeChunk, knowledgeContent, knowledgeDocument } from "./schema";
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
export class KnowledgeContentChangedError extends Error {
  constructor() {
    super("Knowledge content changed while rebuilding chunks");
    this.name = "KnowledgeContentChangedError";
  }
}

export async function createChunks(
  userId: string,
  documentId: string,
  chunks: Chunk[],
  expectedContent?: string,
) {
  if (!(await ownedDocument(userId, documentId))) return null;

  // Replace the searchable index atomically. A failed insert must never leave
  // the document with a partially regenerated chunk set.
  return db.transaction(async (tx) => {
    // When rebuilding from canonical content, lock and verify the exact
    // content snapshot before replacing the index. Comparing the canonical
    // text (rather than a JS Date) avoids millisecond-precision races when two
    // mutations happen within the same timestamp bucket.
    if (expectedContent !== undefined) {
      const [current] = await tx
        .select({ content: knowledgeContent.content })
        .from(knowledgeContent)
        .where(eq(knowledgeContent.documentId, documentId))
        .for("update");
      if (!current || current.content !== expectedContent) {
        throw new KnowledgeContentChangedError();
      }
    }

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
