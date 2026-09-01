import { embed } from "@/lib/ai/embeddings/router";
import {
  getChunkEmbeddingStatus,
  listOwnedChunks,
  storeChunkEmbedding,
} from "@/lib/db/knowledge-embedding-queries";

/**
 * Phase 7.3 — Chunk embedding service.
 * Embeds knowledge_chunk.content via the Phase 6 embedding router and stores
 * the vector. Storage only — no retrieval / semantic search.
 */

/** Embed a single chunk's text and store its vector. */
export async function embedChunk(
  userId: string,
  documentId: string,
  chunkId: string,
  content: string,
) {
  const { embedding, dimensions } = await embed(content);
  const stored = await storeChunkEmbedding(
    userId,
    documentId,
    chunkId,
    embedding,
  );
  if (!stored) return null;
  return { id: chunkId, dimensions };
}

/** Embed every chunk of a document the user owns; store all vectors. */
export async function embedDocumentChunks(userId: string, documentId: string) {
  const chunks = await listOwnedChunks(userId, documentId);
  if (chunks === null) return null; // not owned / missing

  let embedded = 0;
  let dimensions = 0;
  for (const c of chunks) {
    const result = await embed(c.content);
    if (result.embedding.length !== 768) {
      throw new Error(`Embedding dimension mismatch: expected 768, got ${result.embedding.length}`);
    }
    const stored = await storeChunkEmbedding(userId, documentId, c.id, result.embedding);
    if (!stored) throw new Error(`Chunk ${c.id} disappeared during embedding`);
    embedded++;
    dimensions = result.dimensions;
  }

  const status = await getChunkEmbeddingStatus(userId, documentId);
  return {
    total: status?.total ?? chunks.length,
    embedded: status?.embedded ?? embedded,
    dimensions,
  };
}
