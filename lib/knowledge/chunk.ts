/**
 * Pure document chunking — no imports / side effects (unit-testable).
 *
 * Fixed-size character windows with overlap:
 *   - chunk size = 1000 characters
 *   - overlap    = 200 characters
 *   - order preserved (chunkIndex ascending)
 *
 * No embeddings / retrieval — text splitting only.
 */

export const CHUNK_SIZE = 1000;
export const CHUNK_OVERLAP = 200;

export interface Chunk {
  chunkIndex: number;
  content: string;
}

export function chunkDocument(
  content: string,
  size: number = CHUNK_SIZE,
  overlap: number = CHUNK_OVERLAP,
): Chunk[] {
  const text = content ?? "";
  if (!text.trim()) return [];

  // Guard against degenerate config (overlap must be < size to advance).
  const step = Math.max(1, size - overlap);

  const chunks: Chunk[] = [];
  let index = 0;
  let start = 0;

  while (start < text.length) {
    const targetEnd = Math.min(start + size, text.length);
    let end = targetEnd;

    // Keep natural-language chunks intact when there is a useful boundary near
    // the target. For minified/code-like text with no whitespace, retain the
    // exact fixed-size window so chunking remains deterministic and bounded.
    if (targetEnd < text.length) {
      const minBoundary = start + Math.floor(size * 0.7);
      const window = text.slice(minBoundary, targetEnd);
      const boundary = [...window].reduce((best, char, i) =>
        /\s/.test(char) ? minBoundary + i + 1 : best,
        -1,
      );
      if (boundary > start) end = boundary;
    }

    const slice = text.slice(start, end);
    chunks.push({ chunkIndex: index, content: slice });
    index++;
    if (end >= text.length) break;

    // Preserve approximately the configured overlap, but never begin the next
    // chunk halfway through a word. Advancing to the next whitespace boundary
    // slightly reduces overlap and improves embedding/retrieval coherence.
    const desiredStart = Math.max(start + 1, end - overlap);
    let nextStart = desiredStart;
    while (nextStart < end && !/\s/.test(text[nextStart])) nextStart++;
    while (nextStart < end && /\s/.test(text[nextStart])) nextStart++;
    start = nextStart > desiredStart && nextStart < end ? nextStart : desiredStart;
  }

  return chunks;
}
