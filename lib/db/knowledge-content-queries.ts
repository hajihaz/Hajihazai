import { and, eq } from "drizzle-orm";
import { db } from "./index";
import { knowledgeChunk, knowledgeContent, knowledgeDocument } from "./schema";

/**
 * Phase 7.1 — Document content storage (single text blob per document).
 *
 * Ownership is enforced THROUGH the parent document: every function verifies
 * that the document belongs to the user before touching its content.
 * No chunking / embeddings / retrieval — one row of text per document.
 */

/** Returns the document if owned by the user, else null. */
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

export async function getContent(userId: string, documentId: string) {
  if (!(await ownedDocument(userId, documentId))) return null;
  const [row] = await db
    .select()
    .from(knowledgeContent)
    .where(eq(knowledgeContent.documentId, documentId));
  return row ?? null;
}

export async function createContent(
  userId: string,
  documentId: string,
  content: string,
) {
  if (!(await ownedDocument(userId, documentId))) return null;
  const [row] = await db
    .insert(knowledgeContent)
    .values({ documentId, content })
    .returning();
  return row;
}

export async function updateContent(
  userId: string,
  documentId: string,
  content: string,
) {
  if (!(await ownedDocument(userId, documentId))) return null;
  const [row] = await db
    .update(knowledgeContent)
    .set({ content, updatedAt: new Date() })
    .where(eq(knowledgeContent.documentId, documentId))
    .returning();
  return row ?? null;
}

export async function deleteContent(userId: string, documentId: string) {
  if (!(await ownedDocument(userId, documentId))) return null;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .delete(knowledgeContent)
      .where(eq(knowledgeContent.documentId, documentId))
      .returning();
    if (!row) return null;

    // Content is the canonical source for the searchable index. Once it is
    // deleted, retaining old chunks would make retrieval answer from stale data.
    // Delete chunks (including pgvector embeddings) in the same transaction so
    // the canonical content and searchable index cannot diverge on failure.
    await tx
      .delete(knowledgeChunk)
      .where(eq(knowledgeChunk.documentId, documentId));

    return row;
  });
}
