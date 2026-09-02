import { embed } from "@/lib/ai/embeddings/router";
import {
  getChunkEmbeddingStatus,
  listOwnedUnembeddedChunks,
  storeChunkEmbedding,
} from "@/lib/db/knowledge-embedding-queries";

const MAX_EMBED_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [250, 750] as const;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function embedWithRetry(content: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_EMBED_ATTEMPTS; attempt++) {
    try {
      const result = await embed(content);
      if (result.embedding.length !== 768) {
        throw new Error(
          `Embedding dimension mismatch: expected 768, got ${result.embedding.length}`,
        );
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_EMBED_ATTEMPTS - 1) {
        await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Embedding failed after retries");
}

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
  const { embedding, dimensions } = await embedWithRetry(content);
  const stored = await storeChunkEmbedding(
    userId,
    documentId,
    chunkId,
    embedding,
  );
  if (!stored) return null;
  return { id: chunkId, dimensions };
}

/**
 * Embed every currently-unembedded chunk of a document.
 *
 * Completed chunks are skipped on subsequent calls, making a partial provider
 * outage recoverable without recomputing successful vectors. Each chunk is
 * isolated so one bad/transient failure does not prevent later chunks from
 * being embedded.
 */
export async function embedDocumentChunks(userId: string, documentId: string) {
  const chunks = await listOwnedUnembeddedChunks(userId, documentId);
  if (chunks === null) return null; // not owned / missing

  let embedded = 0;
  let dimensions = 0;
  let failed = 0;

  for (const c of chunks) {
    try {
      const result = await embedWithRetry(c.content);
      const stored = await storeChunkEmbedding(
        userId,
        documentId,
        c.id,
        result.embedding,
      );
      if (!stored) {
        // The chunk may have been replaced by a newer reindex while the
        // provider call was in flight. Treat it as a stale work item rather
        // than writing anything into the new index.
        continue;
      }
      embedded++;
      dimensions = result.dimensions;
    } catch (error) {
      failed++;
      console.warn(
        `[knowledge] embedding failed for chunk ${c.id}; it remains unembedded for retry:`,
        error,
      );
    }
  }

  const status = await getChunkEmbeddingStatus(userId, documentId);
  return {
    total: status?.total ?? chunks.length,
    embedded: status?.embedded ?? embedded,
    failed,
    dimensions,
  };
}
