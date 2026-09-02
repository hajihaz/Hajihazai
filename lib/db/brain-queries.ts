import { count, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { brains, knowledgeDocument, knowledgeChunk, type Brain, type NewBrain } from "./schema";

/** Brain data layer — brains are global (no user scope); only admins create them. */
const BRAIN_LIST_LIMIT = 200;

export async function listBrains(): Promise<Brain[]> {
  return db
    .select()
    .from(brains)
    .orderBy(brains.isSystem, brains.name)
    .limit(BRAIN_LIST_LIMIT);
}

export async function getBrainById(id: string): Promise<Brain | null> {
  const [row] = await db.select().from(brains).where(eq(brains.id, id));
  return row ?? null;
}

export async function getBrainBySlug(slug: string): Promise<Brain | null> {
  const [row] = await db.select().from(brains).where(eq(brains.slug, slug));
  return row ?? null;
}

export async function createBrain(input: {
  name: string;
  slug: string;
  description?: string | null;
  icon?: string;
  color?: string;
  isSystem?: boolean;
}): Promise<Brain> {
  const [row] = await db
    .insert(brains)
    .values({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
      icon: input.icon ?? "🧠",
      color: input.color ?? "#6366f1",
      isSystem: input.isSystem ?? false,
    })
    .returning();
  return row;
}

export async function updateBrain(
  id: string,
  input: Partial<Pick<NewBrain, "name" | "slug" | "description" | "icon" | "color">>,
): Promise<Brain | null> {
  const [row] = await db
    .update(brains)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(brains.id, id))
    .returning();
  return row ?? null;
}

export async function deleteBrain(id: string): Promise<boolean> {
  const [row] = await db.delete(brains).where(eq(brains.id, id)).returning();
  return !!row;
}

/** Stats for admin dashboard — document count, chunk count per brain. */
export async function getBrainStats() {
  const docCounts = await db
    .select({
      brainId: knowledgeDocument.brainId,
      documents: count(knowledgeDocument.id),
    })
    .from(knowledgeDocument)
    .groupBy(knowledgeDocument.brainId);

  const chunkCounts = await db
    .select({
      brainId: knowledgeDocument.brainId,
      chunks: count(knowledgeChunk.id),
    })
    .from(knowledgeChunk)
    .innerJoin(knowledgeDocument, eq(knowledgeChunk.documentId, knowledgeDocument.id))
    .groupBy(knowledgeDocument.brainId);

  const docMap = new Map(docCounts.map((r) => [r.brainId ?? "__none__", Number(r.documents)]));
  const chunkMap = new Map(chunkCounts.map((r) => [r.brainId ?? "__none__", Number(r.chunks)]));

  const all = await listBrains();
  return all.map((b) => ({
    ...b,
    documentCount: docMap.get(b.id) ?? 0,
    chunkCount: chunkMap.get(b.id) ?? 0,
  }));
}

export async function listBrainsForPicker() {
  return db
    .select({ id: brains.id, name: brains.name, slug: brains.slug, icon: brains.icon, color: brains.color })
    .from(brains)
    .orderBy(desc(brains.isSystem), brains.name)
    .limit(BRAIN_LIST_LIMIT);
}
