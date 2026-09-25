import {
  pgTable,
  pgEnum,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ------------------------------------------------------------------ */
/* Auth.js core tables                                                 */
/* (shape required by @auth/drizzle-adapter — do not rename columns)   */
/* ------------------------------------------------------------------ */

export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type")
      .$type<"oauth" | "oidc" | "email" | "webauthn">()
      .notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (t) => [
  index("session_user_idx").on(t.userId),
  index("session_expires_idx").on(t.expires),
]);

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

/* ------------------------------------------------------------------ */
/* Application tables                                                  */
/* ------------------------------------------------------------------ */

export const messageRole = pgEnum("message_role", [
  "user",
  "assistant",
  "system",
]);

export const conversations = pgTable(
  "conversation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    // Project workspace this chat belongs to (null = loose "Recent Chats").
    projectId: text("project_id"),
    // Multi-model foundation: which model produced this conversation.
    modelId: text("modelId").notNull().default("ollama:qwen2.5"),
    // Personality foundation: which persona is active (default = Haji).
    personaId: text("personaId").notNull().default("haji"),
    archived: boolean("archived").notNull().default(false),
    pinned: boolean("pinned").notNull().default(false),
    intelligenceLevel: text("intelligence_level").notNull().default("medium"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("conversation_user_idx").on(t.userId),
    index("conversation_project_idx").on(t.projectId),
  ],
);

export const messages = pgTable(
  "message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversationId")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    // Per-message provenance for multi-model routing.
    modelId: text("modelId"),
    tokens: integer("tokens"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  // Composite supports ordered windowed reads (newest N per conversation).
  (t) => [index("message_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

/* ------------------------------------------------------------------ */
/* Relations (query ergonomics for Step 7 history)                     */
/* ------------------------------------------------------------------ */

export const conversationsRelations = relations(
  conversations,
  ({ one, many }) => ({
    user: one(users, {
      fields: [conversations.userId],
      references: [users.id],
    }),
    messages: many(messages),
  }),
);

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

/* ------------------------------------------------------------------ */
/* Inferred types                                                      */
/* ------------------------------------------------------------------ */

export type User = typeof users.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

/* ------------------------------------------------------------------ */
/* Phase 5 — Memory foundation (CRUD only; no embeddings/retrieval)    */
/* ------------------------------------------------------------------ */

export const memoryStatus = pgEnum("memory_status", [
  "pending",
  "active",
  "deleted",
]);

export const userMemory = pgTable(
  "user_memory",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("note"),
    // Optional human-readable title (Brain Sprint: richer memory management).
    title: text("title"),
    content: text("content").notNull(),
    // Importance score 1-5 (5 = most important). Null = unrated.
    importance: integer("importance"),
    // Phase 5 Step 2: extracted memories land as 'pending' until approved.
    status: memoryStatus("status").notNull().default("active"),
    // Phase 6.1: pgvector embedding (nullable until embedded). 768 = canonical.
    embedding: vector("embedding", { dimensions: 768 }),
    // Temporal memory lifecycle: a fact can expire or be superseded without
    // destroying its history. Retrieval only considers currently-valid memories.
    validFrom: timestamp("valid_from", { mode: "date" }).notNull().defaultNow(),
    validUntil: timestamp("valid_until", { mode: "date" }),
    supersededBy: text("superseded_by"),
    // 0-100 confidence assigned by the memory lifecycle, not by the chat model.
    confidence: integer("confidence"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    // Composite index: retrieval/management filter by (userId, status).
    index("user_memory_user_status_idx").on(t.userId, t.status),
    // HNSW index for vector similarity (cosine).
    index("user_memory_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const userMemoryRelations = relations(userMemory, ({ one }) => ({
  user: one(users, {
    fields: [userMemory.userId],
    references: [users.id],
  }),
}));

export type UserMemory = typeof userMemory.$inferSelect;
export type NewUserMemory = typeof userMemory.$inferInsert;

/* ------------------------------------------------------------------ */
/* Phase 7.0 — Knowledge Base foundation (document registry only)      */
/* ------------------------------------------------------------------ */

export const knowledgeSourceType = pgEnum("knowledge_source_type", [
  "pdf",
  "text",
  "website",
  "note",
  "image",
]);

export const knowledgeStatus = pgEnum("knowledge_status", [
  "processing",
  "active",
  "failed",
]);

export const knowledgeVisibility = pgEnum("knowledge_visibility", [
  "private",
  "global",
]);

export const knowledgeDocument = pgTable(
  "knowledge_document",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // Organisational label (Personal, Education, Family, Business, Trading, Law …).
    category: text("category"),
    // Project this document belongs to (null = user-level knowledge).
    projectId: text("project_id"),
    // Brain this document belongs to (null = visible in all brains).
    brainId: text("brain_id").references(() => brains.id, { onDelete: "set null" }),
    sourceType: knowledgeSourceType("sourceType").notNull().default("note"),
    status: knowledgeStatus("status").notNull().default("active"),
    // Visibility: private = owner only; global = all authenticated users.
    visibility: knowledgeVisibility("visibility").notNull().default("private"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
    // Stable file identity/metadata for the persistent File Library.
    originalName: text("original_name"),
    mimeType: text("mime_type"),
    byteSize: integer("byte_size"),
    // Image bytes are stored only when an image needs stable browser preview.
    fileData: text("file_data"),
  },
  (t) => [
    index("knowledge_document_user_idx").on(t.userId),
    index("knowledge_document_project_idx").on(t.projectId),
    index("knowledge_document_brain_idx").on(t.brainId),
  ],
);

export const knowledgeDocumentRelations = relations(
  knowledgeDocument,
  ({ one }) => ({
    user: one(users, {
      fields: [knowledgeDocument.userId],
      references: [users.id],
    }),
  }),
);

export type KnowledgeDocument = typeof knowledgeDocument.$inferSelect;
export type NewKnowledgeDocument = typeof knowledgeDocument.$inferInsert;

/* ------------------------------------------------------------------ */
/* Phase 7.1 — Document content storage (single text blob)             */
/* ------------------------------------------------------------------ */

export const knowledgeContent = pgTable(
  "knowledge_content",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("documentId")
      .notNull()
      .references(() => knowledgeDocument.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("knowledge_content_document_unique_idx").on(t.documentId),
  ],
);

export const knowledgeContentRelations = relations(
  knowledgeContent,
  ({ one }) => ({
    document: one(knowledgeDocument, {
      fields: [knowledgeContent.documentId],
      references: [knowledgeDocument.id],
    }),
  }),
);

export type KnowledgeContent = typeof knowledgeContent.$inferSelect;
export type NewKnowledgeContent = typeof knowledgeContent.$inferInsert;

/* ------------------------------------------------------------------ */
/* Phase 7.2 — Chunking (chunk generation + storage only)              */
/* ------------------------------------------------------------------ */

export const knowledgeChunk = pgTable(
  "knowledge_chunk",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    documentId: text("documentId")
      .notNull()
      .references(() => knowledgeDocument.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunkIndex").notNull(),
    content: text("content").notNull(),
    // Phase 7.3: pgvector embedding (nullable until embedded). 768 = canonical.
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("knowledge_chunk_document_idx").on(t.documentId),
    // HNSW index for cosine similarity (storage only; no search this phase).
    index("knowledge_chunk_embedding_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const knowledgeChunkRelations = relations(knowledgeChunk, ({ one }) => ({
  document: one(knowledgeDocument, {
    fields: [knowledgeChunk.documentId],
    references: [knowledgeDocument.id],
  }),
}));

export type KnowledgeChunk = typeof knowledgeChunk.$inferSelect;
export type NewKnowledgeChunk = typeof knowledgeChunk.$inferInsert;


/* ------------------------------------------------------------------ */
/* Platform — conversation resources and persistent artifacts          */
/* ------------------------------------------------------------------ */

export const conversationAttachments = pgTable(
  "conversation_attachment",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    documentId: text("document_id").notNull().references(() => knowledgeDocument.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("conversation_attachment_unique_idx").on(t.conversationId, t.documentId),
    index("conversation_attachment_conversation_idx").on(t.conversationId),
    index("conversation_attachment_user_idx").on(t.userId),
  ],
);

export type ConversationAttachment = typeof conversationAttachments.$inferSelect;
export type NewConversationAttachment = typeof conversationAttachments.$inferInsert;

export const artifacts = pgTable(
  "artifact",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    sourceDocumentId: text("source_document_id").references(() => knowledgeDocument.id, { onDelete: "set null" }),
    title: text("title").notNull().default("Untitled artifact"),
    content: text("content").notNull().default(""),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("artifact_user_idx").on(t.userId), index("artifact_conversation_idx").on(t.conversationId)],
);

export const artifactVersions = pgTable(
  "artifact_version",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    artifactId: text("artifact_id").notNull().references(() => artifacts.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("artifact_version_artifact_idx").on(t.artifactId, t.createdAt)],
);

export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type ArtifactVersion = typeof artifactVersions.$inferSelect;

/* ------------------------------------------------------------------ */
/* Phase 8.3 — Tool invocation audit                                   */
/* ------------------------------------------------------------------ */

export const toolInvocationStatus = pgEnum("tool_invocation_status", [
  "success",
  "error",
  "timeout",
]);

export const toolInvocation = pgTable(
  "tool_invocation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toolName: text("toolName").notNull(),
    input: jsonb("input"),
    output: jsonb("output"),
    status: toolInvocationStatus("status").notNull(),
    durationMs: integer("durationMs").notNull(),
    // Phase 8.4: serialized payload sizes (full payloads are capped on store).
    inputSize: integer("inputSize").notNull().default(0),
    outputSize: integer("outputSize").notNull().default(0),
    error: text("error"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("tool_invocation_user_idx").on(t.userId),
    index("tool_invocation_created_idx").on(t.createdAt),
  ],
);

export type ToolInvocation = typeof toolInvocation.$inferSelect;
export type NewToolInvocation = typeof toolInvocation.$inferInsert;

/* ------------------------------------------------------------------ */
/* Google profile + onboarding                                         */
/* ------------------------------------------------------------------ */

export const userProfiles = pgTable(
  "user_profiles",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // One profile per Auth.js user.
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    googleId: text("google_id").unique(), // Google "sub"
    email: text("email").notNull().unique(),
    googleName: text("google_name"),
    profilePicture: text("profile_picture"),
    // Set during onboarding (null until then). Case-insensitive uniqueness is
    // enforced by a functional unique index added in the migration.
    username: text("username"),
    // Set when a user enables username/password login (scrypt hash; nullable
    // for Google-only users). Never store plaintext.
    passwordHash: text("password_hash"),
    mobileNumber: text("mobile_number"),
    countryCode: text("country_code"),
    isDisabled: boolean("is_disabled").notNull().default(false),
    isTerminated: boolean("is_terminated").notNull().default(false),
    isSuspended: boolean("is_suspended").notNull().default(false),
    suspendedAt: timestamp("suspended_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
    lastLogin: timestamp("last_login", { mode: "date" }),
  },
  (t) => [
    uniqueIndex("user_profiles_google_id_idx").on(t.googleId),
    uniqueIndex("user_profiles_email_idx").on(t.email),
    index("user_profiles_username_idx").on(t.username),
    // Keep the case-insensitive uniqueness constraint in the schema itself so
    // fresh `drizzle-kit push` databases match migration 0012 and production.
    uniqueIndex("user_profiles_username_lower_unique").on(sql`lower(${t.username})`),
    index("user_profiles_created_idx").on(t.createdAt),
  ],
);

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

/* ------------------------------------------------------------------ */
/* Platform — Projects (ChatGPT-style project workspaces)              */
/* ------------------------------------------------------------------ */

export const projects = pgTable(
  "projects",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    instructions: text("instructions"),
    // System projects (e.g. "Haji Core") inject their knowledge into ALL chats
    // for the owner, regardless of which project the chat belongs to.
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("projects_user_idx").on(t.userId)],
);

export const projectsRelations = relations(projects, ({ one }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
}));

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

/* ------------------------------------------------------------------ */
/* Project-scoped memory + automations                                  */
/* ------------------------------------------------------------------ */

export const projectMemories = pgTable(
  "project_memory",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    memoryId: text("memory_id").notNull().references(() => userMemory.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_memory_unique_idx").on(t.projectId, t.memoryId),
    index("project_memory_project_idx").on(t.projectId),
    index("project_memory_memory_idx").on(t.memoryId),
    index("project_memory_user_idx").on(t.userId),
  ],
);

export type ProjectMemory = typeof projectMemories.$inferSelect;

export const automationStatus = pgEnum("automation_status", [
  "active",
  "paused",
  "completed",
  "failed",
]);

export const automations = pgTable(
  "automation",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    schedule: text("schedule").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    status: automationStatus("status").notNull().default("active"),
    nextRunAt: timestamp("next_run_at", { mode: "date" }),
    lastRunAt: timestamp("last_run_at", { mode: "date" }),
    lastStatus: text("last_status"),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("automation_user_idx").on(t.userId),
    index("automation_project_idx").on(t.projectId),
    index("automation_due_idx").on(t.status, t.nextRunAt),
  ],
);

export type Automation = typeof automations.$inferSelect;

export const automationRuns = pgTable(
  "automation_run",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    automationId: text("automation_id").notNull().references(() => automations.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { mode: "date" }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { mode: "date" }),
    status: text("status").notNull().default("running"),
    output: text("output"),
    error: text("error"),
    modelId: text("model_id"),
  },
  (t) => [
    index("automation_run_automation_idx").on(t.automationId, t.startedAt),
    index("automation_run_user_idx").on(t.userId),
  ],
);

export type AutomationRun = typeof automationRuns.$inferSelect;

/* ------------------------------------------------------------------ */
/* Platform — Username/password credentials + password reset           */
/* ------------------------------------------------------------------ */

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // We store only a SHA-256 hash of the token; the raw token lives in the
    // emailed link and is never persisted.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    usedAt: timestamp("used_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("password_reset_user_idx").on(t.userId),
    index("password_reset_expires_idx").on(t.expiresAt),
  ],
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

/* ------------------------------------------------------------------ */
/* Platform — Admin portal (database-driven; NOT env-driven)           */
/* ------------------------------------------------------------------ */

export const admins = pgTable("admins", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  // Admin id of the creator (null for the bootstrap admin).
  createdBy: text("created_by"),
});

export type Admin = typeof admins.$inferSelect;

export const adminSessions = pgTable(
  "admin_sessions",
  {
    token: text("token").primaryKey(),
    adminId: text("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("admin_sessions_admin_idx").on(t.adminId),
    index("admin_sessions_expires_idx").on(t.expiresAt),
  ],
);

export type AdminSession = typeof adminSessions.$inferSelect;

/* Security — admin audit trail. Never store passwords, session tokens, or API keys. */
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    adminId: text("admin_id").references(() => admins.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata"),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("admin_audit_log_admin_idx").on(t.adminId),
    index("admin_audit_log_created_idx").on(t.createdAt),
    index("admin_audit_log_action_idx").on(t.action),
  ],
);

export type AdminAuditLog = typeof adminAuditLog.$inferSelect;

/* ------------------------------------------------------------------ */
/* Brain System (Phase 1)                                              */
/* Global knowledge domains managed by admin; users select per-chat.  */
/* ------------------------------------------------------------------ */

export const brains = pgTable(
  "brains",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    icon: text("icon").notNull().default("🧠"),
    color: text("color").notNull().default("#6366f1"),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("brains_slug_idx").on(t.slug)],
);

export type Brain = typeof brains.$inferSelect;
export type NewBrain = typeof brains.$inferInsert;

/* ------------------------------------------------------------------ */
/* V1 Launch — Blocked Emails (terminated / banned users)              */
/* ------------------------------------------------------------------ */

export const blockedEmails = pgTable(
  "blocked_emails",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull().unique(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("blocked_emails_email_idx").on(t.email)],
);

export type BlockedEmail = typeof blockedEmails.$inferSelect;

/* ------------------------------------------------------------------ */
/* V1 Launch — Knowledge Update Permissions (write-access whitelist)   */
/* ------------------------------------------------------------------ */

export const knowledgePermissions = pgTable(
  "knowledge_permissions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text("email").notNull().unique(),
    grantedBy: text("granted_by"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("knowledge_permissions_email_idx").on(t.email)],
);

export type KnowledgePermission = typeof knowledgePermissions.$inferSelect;

/* ------------------------------------------------------------------ */
/* V1 Launch — Knowledge Audit Log                                     */
/* ------------------------------------------------------------------ */

export const knowledgeAuditLog = pgTable(
  "knowledge_audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    action: text("action").notNull(),
    documentId: text("document_id"),
    documentTitle: text("document_title").notNull(),
    contentBefore: text("content_before"),
    contentAfter: text("content_after"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("knowledge_audit_log_user_idx").on(t.userId),
    index("knowledge_audit_log_created_idx").on(t.createdAt),
  ],
);

export type KnowledgeAuditLog = typeof knowledgeAuditLog.$inferSelect;

/* ------------------------------------------------------------------ */
/* V1+ — System settings (key/value store for runtime config)          */
/* ------------------------------------------------------------------ */

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export type SystemSetting = typeof systemSettings.$inferSelect;

/* ------------------------------------------------------------------ */
/* Runtime rate-limit buckets (shared across serverless instances)    */
/* ------------------------------------------------------------------ */

export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    bucketKey: text("bucket_key").primaryKey(),
    count: integer("count").notNull().default(0),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  },
  (t) => [index("rate_limit_buckets_expires_idx").on(t.expiresAt)],
);

export type RateLimitBucket = typeof rateLimitBuckets.$inferSelect;

/* ------------------------------------------------------------------ */
/* Shared AI model health (distributed circuit-breaker state)           */
/* ------------------------------------------------------------------ */

export const aiModelHealth = pgTable(
  "ai_model_health",
  {
    modelId: text("model_id").primaryKey(),
    healthy: boolean("healthy").notNull(),
    checkedAt: timestamp("checked_at", { mode: "date" }).notNull(),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    retryAfterMs: integer("retry_after_ms"),
    unhealthyUntil: timestamp("unhealthy_until", { mode: "date" }),
  },
  (t) => [index("ai_model_health_unhealthy_idx").on(t.unhealthyUntil)],
);

export type AiModelHealth = typeof aiModelHealth.$inferSelect;

/* ------------------------------------------------------------------ */
/* V1+ — Admin Notifications                                           */
/* ------------------------------------------------------------------ */

export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: text("title").notNull(),
    message: text("message").notNull(),
    // "all" = broadcast to all users, "specific" = only notificationTargets rows
    targetType: text("target_type").notNull().default("all"),
    sentAt: timestamp("sent_at", { mode: "date" }),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_created_idx").on(t.createdAt),
    index("notifications_sent_idx").on(t.sentAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;

export const userNotifications = pgTable(
  "user_notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("user_notifications_user_idx").on(t.userId),
    index("user_notifications_notification_idx").on(t.notificationId),
    uniqueIndex("user_notifications_unique_idx").on(t.userId, t.notificationId),
  ],
);

export type UserNotification = typeof userNotifications.$inferSelect;

export const notificationTargets = pgTable(
  "notification_targets",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    notificationId: text("notification_id")
      .notNull()
      .references(() => notifications.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("notification_targets_unique_idx").on(t.notificationId, t.userId),
    index("notification_targets_notification_idx").on(t.notificationId),
    index("notification_targets_user_idx").on(t.userId),
  ],
);

export type NotificationTarget = typeof notificationTargets.$inferSelect;
