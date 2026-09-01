import { chunkDocument } from "./chunk";
import { embedDocumentChunks } from "./embed-chunks";
import { getContent } from "@/lib/db/knowledge-content-queries";
import { createChunks, KnowledgeContentChangedError } from "@/lib/db/knowledge-chunk-queries";

/** Rebuild chunks and embeddings from the document's canonical content. */
export async function reindexKnowledgeDocument(userId: string, documentId: string) {
  const content = await getContent(userId, documentId);
  if (!content) return null;

  const text = content.content.trim();
  const chunks = chunkDocument(text);
  let stored;
  try {
    stored = await createChunks(userId, documentId, chunks, content.updatedAt);
  } catch (error) {
    if (error instanceof KnowledgeContentChangedError) {
      // A newer content mutation owns the index now. Do not overwrite it with
      // this stale snapshot; the newer mutation will perform its own reindex.
      return null;
    }
    throw error;
  }
  if (stored === null) return null;

  let embedded = 0;
  try {
    const result = await embedDocumentChunks(userId, documentId);
    embedded = result?.embedded ?? 0;
  } catch (error) {
    console.warn("[knowledge] reindex embedding failed; keyword retrieval remains available:", error);
  }

  return { chunks: stored.length, embedded };
}
