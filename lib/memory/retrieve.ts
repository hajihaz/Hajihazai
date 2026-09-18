import { and, eq, gt, ilike, lte, or, isNull, exists, notExists } from "drizzle-orm";
import { db } from "@/lib/db";
import { projectMemories, userMemory } from "@/lib/db/schema";
import { rankMemories, significantTokens } from "./ranking";

function memoryScope(userId: string, projectId?: string | null) {
  if (!projectId) return eq(userMemory.userId, userId);
  const linked = exists(
    db.select({ id: projectMemories.id }).from(projectMemories).where(and(
      eq(projectMemories.memoryId, userMemory.id),
      eq(projectMemories.userId, userId),
      eq(projectMemories.projectId, projectId),
    )),
  );
  return and(eq(userMemory.userId, userId), or(linked, notExists(
    db.select({ id: projectMemories.id }).from(projectMemories).where(and(
      eq(projectMemories.memoryId, userMemory.id),
      eq(projectMemories.userId, userId),
    )),
  )));
}

export async function getActiveMemories(userId: string, projectId?: string | null) {
  const now = new Date();
  return db.select({
    id: userMemory.id, type: userMemory.type, content: userMemory.content,
    status: userMemory.status, validFrom: userMemory.validFrom,
    validUntil: userMemory.validUntil, updatedAt: userMemory.updatedAt,
  }).from(userMemory).where(and(
    memoryScope(userId, projectId), eq(userMemory.status, "active"),
    lte(userMemory.validFrom, now),
    or(isNull(userMemory.validUntil), gt(userMemory.validUntil, now)),
  ));
}

async function getKeywordCandidates(userId: string, q: string, projectId?: string | null) {
  const tokens = significantTokens(q);
  if (tokens.length === 0) return [];
  const variants = new Set(tokens);
  for (const token of tokens) {
    if (token.length > 4 && token.endsWith("es")) variants.add(token.slice(0, -2));
    if (token.length > 3 && token.endsWith("s")) variants.add(token.slice(0, -1));
  }
  const now = new Date();
  return db.select({
    id: userMemory.id, type: userMemory.type, content: userMemory.content,
    status: userMemory.status, validFrom: userMemory.validFrom,
    validUntil: userMemory.validUntil, updatedAt: userMemory.updatedAt,
  }).from(userMemory).where(and(
    memoryScope(userId, projectId), eq(userMemory.status, "active"),
    lte(userMemory.validFrom, now),
    or(isNull(userMemory.validUntil), gt(userMemory.validUntil, now)),
    or(...[...variants].map((token) => ilike(userMemory.content, `%${token}%`))),
  ));
}

export async function searchMemories(userId: string, q?: string, projectId?: string | null) {
  const now = Date.now();
  if (!q?.trim()) return rankMemories(await getActiveMemories(userId, projectId), q, now);
  return rankMemories(await getKeywordCandidates(userId, q, projectId), q, now);
}

export async function searchWithDiagnostics(userId: string, q?: string, projectId?: string | null) {
  const all = await db.select().from(userMemory).where(memoryScope(userId, projectId));
  const now = new Date();
  const active = all.filter((m) =>
    m.status === "active" && m.validFrom <= now &&
    (m.validUntil === null || m.validUntil > now),
  );
  const results = rankMemories(active, q, now.getTime());
  const resultIds = new Set(results.map((r) => r.id));
  const excluded = all.filter((m) => !resultIds.has(m.id)).map((m) => {
    let reason: string;
    if (m.status !== "active") reason = m.status;
    else if (m.validFrom > now) reason = "not-yet-valid";
    else if (m.validUntil !== null && m.validUntil <= now) reason = "expired";
    else reason = "no-match";
    return { id: m.id, type: m.type, content: m.content, status: m.status, reason };
  });
  return { query: q ?? "", results, excluded };
}
