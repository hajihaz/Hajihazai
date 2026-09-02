import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { projects, conversations, type Project } from "./schema";

const PROJECT_LIST_LIMIT = 200;

/** System projects (isSystem = true) inject knowledge into ALL user chats. */
export async function listSystemProjects(userId: string): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.isSystem, true)))
    .limit(PROJECT_LIST_LIMIT);
}

/**
 * Project workspace data layer. Every function is ownership-scoped by userId —
 * a user can only ever read or mutate their own projects.
 */

export async function listProjects(userId: string): Promise<Project[]> {
  return db
    .select()
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.updatedAt))
    .limit(PROJECT_LIST_LIMIT);
}

export async function getProject(
  userId: string,
  id: string,
): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)));
  return row ?? null;
}

export async function createProject(
  userId: string,
  input: {
    name: string;
    description?: string | null;
    instructions?: string | null;
    isSystem?: boolean;
  },
): Promise<Project> {
  const [row] = await db
    .insert(projects)
    .values({
      userId,
      name: input.name,
      description: input.description ?? null,
      instructions: input.instructions ?? null,
      isSystem: input.isSystem ?? false,
    })
    .returning();
  return row;
}

export async function updateProject(
  userId: string,
  id: string,
  patch: { name?: string; description?: string | null; instructions?: string | null },
): Promise<Project | null> {
  const [row] = await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteProject(userId: string, id: string): Promise<boolean> {
  // Detach chats first so they fall back to "Recent Chats" instead of dangling.
  await db
    .update(conversations)
    .set({ projectId: null })
    .where(and(eq(conversations.projectId, id), eq(conversations.userId, userId)));
  const [row] = await db
    .delete(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, userId)))
    .returning();
  return !!row;
}

/** Move a chat into a project (or out of one with null). Ownership-checked. */
export async function assignConversationToProject(
  userId: string,
  conversationId: string,
  projectId: string | null,
): Promise<boolean> {
  if (projectId) {
    const owned = await getProject(userId, projectId);
    if (!owned) return false;
  }
  const [row] = await db
    .update(conversations)
    .set({ projectId, updatedAt: new Date() })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .returning();
  return !!row;
}
