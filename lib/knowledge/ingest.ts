import { createDocument, deleteDocument } from "@/lib/db/knowledge-queries";
import { createContent } from "@/lib/db/knowledge-content-queries";
import { createChunks } from "@/lib/db/knowledge-chunk-queries";
import { chunkDocument } from "./chunk";
import { extractText, extFromName } from "./extract";
import { embedDocumentChunks } from "./embed-chunks";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Ingest one document: validate → extract text → register document → store
 * content → chunk. Ownership is enforced downstream (every query is userId
 * scoped). Embeddings are generated separately (best-effort) so a down
 * embedding provider never blocks ingestion; keyword retrieval still works.
 */
export async function ingestDocument(
  userId: string,
  input: {
    filename: string;
    buffer: Buffer;
    projectId?: string | null;
    brainId?: string | null;
    title?: string;
    visibility?: "private" | "global";
  },
): Promise<
  | { ok: true; documentId: string; chunks: number }
  | { ok: false; error: string }
> {
  if (input.buffer.length === 0) return { ok: false, error: "File is empty" };
  if (input.buffer.length > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "File exceeds the 5MB limit" };
  }

  const ext = extFromName(input.filename);
  const extracted = extractText(ext, input.buffer);
  if (!extracted.ok) return { ok: false, error: extracted.error };

  const text = extracted.text.trim();
  if (!text) return { ok: false, error: "No readable text in document" };

  const doc = await createDocument(userId, {
    title: input.title?.trim() || input.filename,
    sourceType: ext === "pdf" ? "pdf" : "text",
    projectId: input.projectId ?? null,
    brainId: input.brainId ?? null,
    visibility: input.visibility ?? "private",
  });

  try {
    const content = await createContent(userId, doc.id, text);
    if (!content) throw new Error("failed to store document content");
    const chunks = chunkDocument(text);
    const storedChunks = await createChunks(userId, doc.id, chunks);
    if (storedChunks === null) throw new Error("failed to store document chunks");

    // Best-effort embedding for semantic search. Keyword retrieval works without
    // it, so a down embedding provider never blocks ingestion or retrieval.
    try {
      await embedDocumentChunks(userId, doc.id);
    } catch (err) {
      console.warn("[knowledge] embedding failed (keyword retrieval still works):", err);
    }

    return { ok: true, documentId: doc.id, chunks: chunks.length };
  } catch (err) {
    console.error("[knowledge] ingestion persistence failed; cleaning up document:", err);
    await deleteDocument(userId, doc.id).catch((cleanupErr) =>
      console.error("[knowledge] document cleanup failed:", cleanupErr),
    );
    return { ok: false, error: "Could not save the document. Please try again." };
  }
}

/**
 * Ingest plain text pasted directly by the admin — no file parsing needed.
 * Uses the same chunk→embed pipeline so keyword + semantic retrieval both work.
 */
export async function ingestText(
  userId: string,
  input: {
    title: string;
    content: string;
    projectId?: string | null;
    category?: string | null;
    brainId?: string | null;
    visibility?: "private" | "global";
  },
): Promise<
  | { ok: true; documentId: string; chunks: number }
  | { ok: false; error: string }
> {
  const text = input.content.trim();
  if (!text) return { ok: false, error: "Content is empty" };
  if (Buffer.byteLength(text, "utf8") > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "Content exceeds the 5 MB limit" };
  }

  const doc = await createDocument(userId, {
    title: input.title.trim() || "Untitled",
    sourceType: "note",
    projectId: input.projectId ?? null,
    category: input.category ?? null,
    brainId: input.brainId ?? null,
    visibility: input.visibility ?? "private",
  });

  try {
    const content = await createContent(userId, doc.id, text);
    if (!content) throw new Error("failed to store document content");
    const chunks = chunkDocument(text);
    const storedChunks = await createChunks(userId, doc.id, chunks);
    if (storedChunks === null) throw new Error("failed to store document chunks");

    try {
      await embedDocumentChunks(userId, doc.id);
    } catch (err) {
      console.warn("[knowledge] embedding failed (keyword retrieval still works):", err);
    }

    return { ok: true, documentId: doc.id, chunks: chunks.length };
  } catch (err) {
    console.error("[knowledge] text ingestion persistence failed; cleaning up document:", err);
    await deleteDocument(userId, doc.id).catch((cleanupErr) =>
      console.error("[knowledge] document cleanup failed:", cleanupErr),
    );
    return { ok: false, error: "Could not save the document. Please try again." };
  }
}
