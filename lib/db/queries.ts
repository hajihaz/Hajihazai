import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "./index";
import { conversations, messages } from "./schema";

/* ----------------------------- Conversations ----------------------------- */

export async function listConversations(userId: string) {
  return db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(200);
}

export async function createConversation(
  userId: string,
  title = "New chat",
  projectId: string | null = null,
) {
  const [row] = await db
    .insert(conversations)
    .values({ userId, title, projectId })
    .returning();
  return row;
}

/** Chats that belong to a specific project (ownership-scoped). */
export async function listProjectConversations(
  userId: string,
  projectId: string,
) {
  return db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.projectId, projectId),
      ),
    )
    .orderBy(desc(conversations.updatedAt));
}

/** Fetch a conversation only if it belongs to the given user (ownership guard). */
export async function getConversation(userId: string, id: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
  return row ?? null;
}

export async function deleteConversation(userId: string, id: string) {
  await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

export async function setConversationTitle(userId: string, id: string, title: string) {
  await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

/** Rename a conversation the user owns (ownership-scoped). Returns null if not owned. */
export async function renameConversation(
  userId: string,
  id: string,
  title: string,
) {
  const [row] = await db
    .update(conversations)
    .set({ title, updatedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning();
  return row ?? null;
}

/* -------------------------------- Messages -------------------------------- */

export async function getMessage(userId: string, messageId: string) {
  const [row] = await db
    .select({ message: messages })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(messages.id, messageId), eq(conversations.userId, userId)))
    .limit(1);
  return row?.message ?? null;
}

export async function listMessages(conversationId: string) {
  return db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt))
    .limit(200);
}

/**
 * Newest `limit` messages for a conversation, returned in ASC order.
 * Fetches only the rows needed (ORDER BY createdAt DESC LIMIT n) instead of
 * loading the whole conversation and slicing in JS (Phase 9.0 hot-path fix).
 */
export async function listRecentMessages(conversationId: string, limit = 20) {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function addMessage(input: {
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  modelId?: string;
  /** Per-message provenance (retrieval analytics on assistant replies). */
  metadata?: Record<string, unknown>;
}) {
  const [row] = await db.insert(messages).values(input).returning();
  // Bump the conversation so it sorts to the top of the sidebar.
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, input.conversationId));
  return row;
}

/**
 * Insert a message only when the conversation belongs to the given user.
 * Ownership is enforced in the same DB operation sequence as the insert, so a
 * caller cannot write into another user's conversation merely by knowing its ID.
 */
export async function addOwnedMessage(
  userId: string,
  input: {
    conversationId: string;
    role: "user" | "assistant" | "system";
    content: string;
    modelId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  const [owned] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, input.conversationId),
        eq(conversations.userId, userId),
      ),
    )
    .limit(1);
  if (!owned) return null;
  return addMessage(input);
}


/**
 * Record 👍/👎 feedback on an assistant message the user owns. Merges into the
 * existing message metadata (alongside retrieval provenance) so analytics can
 * aggregate helpfulness by query/brain. Ownership enforced via the conversation.
 */
export async function setMessageFeedback(
  userId: string,
  messageId: string,
  value: "helpful" | "not_helpful",
) {
  const [owned] = await db
    .select({ id: messages.id, metadata: messages.metadata })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(
      and(
        eq(messages.id, messageId),
        eq(conversations.userId, userId),
        eq(messages.role, "assistant"),
      ),
    );
  if (!owned) return false;
  const meta =
    owned.metadata && typeof owned.metadata === "object"
      ? (owned.metadata as Record<string, unknown>)
      : {};
  await db
    .update(messages)
    .set({ metadata: { ...meta, feedback: value } })
    .where(eq(messages.id, messageId));
  return true;
}

/**
 * Delete a single message the user owns (message → conversation → user).
 * Returns false if the message doesn't exist or belongs to another user.
 */
export async function deleteMessage(userId: string, messageId: string) {
  const [owned] = await db
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .where(and(eq(messages.id, messageId), eq(conversations.userId, userId)));
  if (!owned) return false;
  await db.delete(messages).where(eq(messages.id, messageId));
  return true;
}
