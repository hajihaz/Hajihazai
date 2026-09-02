import { and, count, desc, eq, gte, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  admins,
  users,
  userProfiles,
  sessions,
  projects,
  knowledgeDocument,
  knowledgeChunk,
  conversations,
  messages,
  userMemory,
  brains,
  blockedEmails,
  knowledgePermissions,
  knowledgeAuditLog,
  notifications,
  userNotifications,
  type Admin,
  type BlockedEmail,
  type KnowledgePermission,
  type KnowledgeAuditLog,
  type Notification,
} from "@/lib/db/schema";
import { isUniqueViolation, revokeOtherSessions } from "@/lib/db/credential-queries";
import { hashPassword } from "@/lib/auth/password";
import { getRetrievalAnalytics, computeRetrievalAnalytics, type RetrievalAnalytics } from "@/lib/admin/analytics";

/** Admin data layer. Admin identity is DB-driven (no ADMIN_EMAILS env). */

// Admin list endpoints are bounded to prevent accidental giant responses.
const ADMIN_LIST_LIMIT = 500;
const BLOCKED_EMAIL_LIST_LIMIT = 500;
const ADMIN_EXPORT_USER_LIMIT = 10_000;

export async function countAdmins(): Promise<number> {
  const [row] = await db.select({ count: count() }).from(admins);
  return Number(row?.count ?? 0);
}

export async function getAdminByUsername(username: string): Promise<Admin | null> {
  const [row] = await db.select().from(admins).where(eq(admins.username, username));
  return row ?? null;
}

/** Public-safe admin list (never returns password hashes). */
export async function listAdmins() {
  return db
    .select({
      id: admins.id,
      username: admins.username,
      createdAt: admins.createdAt,
      createdBy: admins.createdBy,
    })
    .from(admins)
    .orderBy(desc(admins.createdAt))
    .limit(ADMIN_LIST_LIMIT);
}

export async function createAdmin(input: {
  username: string;
  passwordHash: string;
  createdBy?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: "taken" }> {
  try {
    const [row] = await db
      .insert(admins)
      .values({
        username: input.username,
        passwordHash: input.passwordHash,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    return { ok: true, id: row.id };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: "taken" };
    throw err;
  }
}

export async function deleteAdmin(id: string): Promise<boolean> {
  const [row] = await db.delete(admins).where(eq(admins.id, id)).returning();
  return !!row;
}

export async function resetAdminPassword(
  id: string,
  passwordHash: string,
): Promise<boolean> {
  const [row] = await db
    .update(admins)
    .set({ passwordHash })
    .where(eq(admins.id, id))
    .returning();
  return !!row;
}

/* ----------------------------- admin views ----------------------------- */

export async function adminListUsers() {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      username: userProfiles.username,
      createdAt: userProfiles.createdAt,
      lastLogin: userProfiles.lastLogin,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .orderBy(desc(userProfiles.createdAt))
    .limit(ADMIN_LIST_LIMIT);
}

export async function adminListProjects() {
  return db
    .select()
    .from(projects)
    .orderBy(desc(projects.createdAt))
    .limit(ADMIN_LIST_LIMIT);
}

export async function adminListDocuments() {
  return db
    .select({
      id: knowledgeDocument.id,
      userId: knowledgeDocument.userId,
      projectId: knowledgeDocument.projectId,
      title: knowledgeDocument.title,
      sourceType: knowledgeDocument.sourceType,
      status: knowledgeDocument.status,
      createdAt: knowledgeDocument.createdAt,
    })
    .from(knowledgeDocument)
    .orderBy(desc(knowledgeDocument.createdAt))
    .limit(ADMIN_LIST_LIMIT);
}

/** Knowledge documents enriched with user email and project name. */
export async function adminListKnowledge() {
  return db
    .select({
      id: knowledgeDocument.id,
      title: knowledgeDocument.title,
      category: knowledgeDocument.category,
      sourceType: knowledgeDocument.sourceType,
      status: knowledgeDocument.status,
      projectId: knowledgeDocument.projectId,
      projectName: projects.name,
      userId: knowledgeDocument.userId,
      userEmail: users.email,
      createdAt: knowledgeDocument.createdAt,
    })
    .from(knowledgeDocument)
    .leftJoin(projects, eq(projects.id, knowledgeDocument.projectId))
    .leftJoin(users, eq(users.id, knowledgeDocument.userId))
    .orderBy(desc(knowledgeDocument.createdAt))
    .limit(ADMIN_LIST_LIMIT);
}

/** Admin can delete any knowledge document (no ownership restriction). */
export async function adminDeleteKnowledge(documentId: string): Promise<boolean> {
  // Re-use the user-scoped helper by providing the actual owner — but since
  // admin has no userId, we do a direct admin-level delete instead.
  const [row] = await db
    .delete(knowledgeDocument)
    .where(eq(knowledgeDocument.id, documentId))
    .returning();
  return !!row;
}

/** All projects across all users, enriched with user email and isSystem flag. */
export async function adminListProjectsWithUsers() {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      isSystem: projects.isSystem,
      userId: projects.userId,
      userEmail: users.email,
      createdAt: projects.createdAt,
    })
    .from(projects)
    .leftJoin(users, eq(users.id, projects.userId))
    .orderBy(desc(projects.createdAt))
    .limit(ADMIN_LIST_LIMIT);
}

/**
 * Minimal project list for UI dropdowns — only id/name/userId so it works
 * even before migration 0014 (no is_system column selected).
 */
export async function adminListProjectsForPicker() {
  return db
    .select({
      id: projects.id,
      name: projects.name,
      userId: projects.userId,
    })
    .from(projects)
    .orderBy(projects.name)
    .limit(ADMIN_LIST_LIMIT);
}

/* ----------------------------- analytics ------------------------------- */

export interface AdminAnalytics {
  totalUsers: number;
  totalConversations: number;
  totalMessages: number;
  totalDocuments: number;
  totalChunks: number;
  totalBrains: number;
  totalMemories: number;
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const [
    [{ cnt: totalUsers }],
    [{ cnt: totalConversations }],
    [{ cnt: totalMessages }],
    [{ cnt: totalDocuments }],
    [{ cnt: totalChunks }],
    [{ cnt: totalBrains }],
    [{ cnt: totalMemories }],
  ] = await Promise.all([
    db.select({ cnt: count() }).from(users),
    db.select({ cnt: count() }).from(conversations),
    db.select({ cnt: count() }).from(messages),
    db.select({ cnt: count() }).from(knowledgeDocument),
    db.select({ cnt: count() }).from(knowledgeChunk),
    db.select({ cnt: count() }).from(brains),
    db.select({ cnt: count() }).from(userMemory),
  ]);

  return {
    totalUsers: Number(totalUsers),
    totalConversations: Number(totalConversations),
    totalMessages: Number(totalMessages),
    totalDocuments: Number(totalDocuments),
    totalChunks: Number(totalChunks),
    totalBrains: Number(totalBrains),
    totalMemories: Number(totalMemories),
  };
}

/* ----------------------------- brain admin ----------------------------- */

export async function adminListKnowledgeWithBrain() {
  return db
    .select({
      id: knowledgeDocument.id,
      title: knowledgeDocument.title,
      category: knowledgeDocument.category,
      sourceType: knowledgeDocument.sourceType,
      status: knowledgeDocument.status,
      visibility: knowledgeDocument.visibility,
      projectId: knowledgeDocument.projectId,
      projectName: projects.name,
      brainId: knowledgeDocument.brainId,
      brainName: brains.name,
      brainIcon: brains.icon,
      userId: knowledgeDocument.userId,
      userEmail: users.email,
      createdAt: knowledgeDocument.createdAt,
    })
    .from(knowledgeDocument)
    .leftJoin(projects, eq(projects.id, knowledgeDocument.projectId))
    .leftJoin(brains, eq(brains.id, knowledgeDocument.brainId))
    .leftJoin(users, eq(users.id, knowledgeDocument.userId))
    .orderBy(desc(knowledgeDocument.createdAt))
    .limit(ADMIN_LIST_LIMIT);
}

/* ----------------------------- user management ----------------------------- */

export async function adminListUsersPage(opts?: { search?: string; page?: number; limit?: number }) {
  const limit = Math.min(opts?.limit ?? 20, 100);
  const offset = ((opts?.page ?? 1) - 1) * limit;
  const search = opts?.search?.trim();

  const where = search
    ? or(
        ilike(users.email, `%${search}%`),
        ilike(userProfiles.username, `%${search}%`),
        ilike(users.name, `%${search}%`),
      )
    : undefined;

  const [rows, [{ cnt }]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        username: userProfiles.username,
        createdAt: userProfiles.createdAt,
        lastLogin: userProfiles.lastLogin,
        isDisabled: userProfiles.isDisabled,
        isTerminated: userProfiles.isTerminated,
        isSuspended: userProfiles.isSuspended,
      })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(where)
      .orderBy(desc(userProfiles.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ cnt: count() })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(where),
  ]);

  return { users: rows, total: Number(cnt) };
}

export async function adminGetUserDetail(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      username: userProfiles.username,
      mobileNumber: userProfiles.mobileNumber,
      countryCode: userProfiles.countryCode,
      googleId: userProfiles.googleId,
      isDisabled: userProfiles.isDisabled,
      isTerminated: userProfiles.isTerminated,
      createdAt: userProfiles.createdAt,
      lastLogin: userProfiles.lastLogin,
    })
    .from(users)
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId));

  if (!row) return null;

  const [[{ convCount }], [{ msgCount }], [{ docCount }]] = await Promise.all([
    db.select({ convCount: count() }).from(conversations).where(eq(conversations.userId, userId)),
    db.select({ msgCount: count() }).from(messages)
      .leftJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(eq(conversations.userId, userId)),
    db.select({ docCount: count() }).from(knowledgeDocument).where(eq(knowledgeDocument.userId, userId)),
  ]);

  return { ...row, conversationCount: Number(convCount), messageCount: Number(msgCount), documentCount: Number(docCount) };
}

export async function adminSetUserDisabled(userId: string, disabled: boolean): Promise<boolean> {
  const [row] = await db
    .update(userProfiles)
    .set({ isDisabled: disabled, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId))
    .returning();
  return !!row;
}

export async function adminTerminateUser(userId: string, email: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(userProfiles)
      .set({ isDisabled: true, isTerminated: true, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
    await tx
      .insert(blockedEmails)
      .values({ email: email.toLowerCase(), reason: "terminated" })
      .onConflictDoNothing();
    // Revoke all active sessions immediately
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}

export async function adminRevokeUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function adminDeleteUser(userId: string): Promise<boolean> {
  const [row] = await db.delete(users).where(eq(users.id, userId)).returning();
  return !!row;
}

export async function adminResetUserPassword(userId: string, newPassword: string): Promise<boolean> {
  const hash = await hashPassword(newPassword);
  const [row] = await db
    .update(userProfiles)
    .set({ passwordHash: hash, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId))
    .returning();
  if (row) await revokeOtherSessions(userId);
  return !!row;
}

/* ----------------------------- blocked emails ----------------------------- */

export async function listBlockedEmails(opts?: { search?: string }) {
  const search = opts?.search?.trim();
  return db
    .select()
    .from(blockedEmails)
    .where(search ? ilike(blockedEmails.email, `%${search}%`) : undefined)
    .orderBy(desc(blockedEmails.createdAt))
    .limit(BLOCKED_EMAIL_LIST_LIMIT);
}

export async function isEmailBlocked(email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: blockedEmails.id })
    .from(blockedEmails)
    .where(eq(blockedEmails.email, email.toLowerCase()))
    .limit(1);
  return !!row;
}

export async function addBlockedEmail(email: string, reason?: string): Promise<BlockedEmail | null> {
  try {
    const [row] = await db
      .insert(blockedEmails)
      .values({ email: email.toLowerCase(), reason: reason ?? null })
      .returning();
    return row ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

export async function removeBlockedEmail(id: string): Promise<boolean> {
  const [row] = await db.delete(blockedEmails).where(eq(blockedEmails.id, id)).returning();
  return !!row;
}

/* ------------------------- knowledge permissions -------------------------- */

const DEFAULT_PERMITTED_EMAILS = ["iamhajihaz@gmail.com", "now.kuddosahib@gmail.com"];
const KNOWLEDGE_PERMISSION_LIST_LIMIT = 500;

export async function listKnowledgePermissions(opts?: { search?: string }) {
  const search = opts?.search?.trim();
  return db
    .select()
    .from(knowledgePermissions)
    .where(search ? ilike(knowledgePermissions.email, `%${search}%`) : undefined)
    .orderBy(desc(knowledgePermissions.createdAt))
    .limit(KNOWLEDGE_PERMISSION_LIST_LIMIT);
}

export async function isKnowledgeWritePermitted(email: string): Promise<boolean> {
  const normalised = email.toLowerCase();
  if (DEFAULT_PERMITTED_EMAILS.includes(normalised)) return true;
  const [row] = await db
    .select({ id: knowledgePermissions.id })
    .from(knowledgePermissions)
    .where(eq(knowledgePermissions.email, normalised))
    .limit(1);
  return !!row;
}

export async function addKnowledgePermission(email: string, grantedBy?: string): Promise<KnowledgePermission | null> {
  try {
    const [row] = await db
      .insert(knowledgePermissions)
      .values({ email: email.toLowerCase(), grantedBy: grantedBy ?? null })
      .returning();
    return row ?? null;
  } catch (err) {
    if (isUniqueViolation(err)) return null;
    throw err;
  }
}

export async function removeKnowledgePermission(id: string): Promise<boolean> {
  const [row] = await db
    .delete(knowledgePermissions)
    .where(eq(knowledgePermissions.id, id))
    .returning();
  return !!row;
}

/* -------------------------- knowledge audit log --------------------------- */

export async function addKnowledgeAuditEntry(entry: {
  userId: string | null;
  email: string;
  action: string;
  documentId?: string | null;
  documentTitle: string;
  contentBefore?: string | null;
  contentAfter?: string | null;
}): Promise<void> {
  await db.insert(knowledgeAuditLog).values({
    userId: entry.userId ?? null,
    email: entry.email,
    action: entry.action,
    documentId: entry.documentId ?? null,
    documentTitle: entry.documentTitle,
    contentBefore: entry.contentBefore ?? null,
    contentAfter: entry.contentAfter ?? null,
  });
}

export async function listKnowledgeAuditLog(limit = 50): Promise<KnowledgeAuditLog[]> {
  return db
    .select()
    .from(knowledgeAuditLog)
    .orderBy(desc(knowledgeAuditLog.createdAt))
    .limit(limit);
}

/* ----------------------------- enhanced analytics ------------------------- */

export interface AdminAnalyticsV2 {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  totalConversations: number;
  totalMessages: number;
  totalDocuments: number;
  totalChunks: number;
  totalBrains: number;
  totalMemories: number;
  totalProjects: number;
  totalAdmins: number;
  charts: {
    dailySignups: Array<{ date: string; count: number }>;
    dailyMessages: Array<{ date: string; count: number }>;
    dailyKnowledgeUpdates: Array<{ date: string; count: number }>;
  };
  /** Retrieval quality metrics aggregated from assistant-message provenance. */
  retrieval: RetrievalAnalytics;
}

export async function getAdminAnalyticsV2(): Promise<AdminAnalyticsV2> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Kicked off in parallel with the counts below; degrades to empty on error.
  const retrievalPromise = getRetrievalAnalytics().catch(() => computeRetrievalAnalytics([]));

  const [
    [{ cnt: totalUsers }],
    [{ cnt: activeUsers }],
    [{ cnt: newUsersToday }],
    [{ cnt: totalConversations }],
    [{ cnt: totalMessages }],
    [{ cnt: totalDocuments }],
    [{ cnt: totalChunks }],
    [{ cnt: totalBrains }],
    [{ cnt: totalMemories }],
    [{ cnt: totalProjects }],
    [{ cnt: totalAdmins }],
    dailySignups,
    dailyMessages,
    dailyKnowledgeUpdates,
  ] = await Promise.all([
    db.select({ cnt: count() }).from(users),
    db.select({ cnt: count() }).from(userProfiles)
      .where(gte(userProfiles.lastLogin, thirtyDaysAgo)),
    db.select({ cnt: count() }).from(userProfiles)
      .where(gte(userProfiles.createdAt, todayStart)),
    db.select({ cnt: count() }).from(conversations),
    db.select({ cnt: count() }).from(messages),
    db.select({ cnt: count() }).from(knowledgeDocument),
    db.select({ cnt: count() }).from(knowledgeChunk),
    db.select({ cnt: count() }).from(brains),
    db.select({ cnt: count() }).from(userMemory),
    db.select({ cnt: count() }).from(projects),
    db.select({ cnt: count() }).from(admins),
    db.select({
      date: sql<string>`date_trunc('day', ${userProfiles.createdAt})::date::text`,
      count: count(),
    }).from(userProfiles)
      .where(gte(userProfiles.createdAt, sevenDaysAgo))
      .groupBy(sql`date_trunc('day', ${userProfiles.createdAt})`)
      .orderBy(sql`date_trunc('day', ${userProfiles.createdAt})`),
    db.select({
      date: sql<string>`date_trunc('day', ${messages.createdAt})::date::text`,
      count: count(),
    }).from(messages)
      .where(and(gte(messages.createdAt, sevenDaysAgo), eq(messages.role, "user")))
      .groupBy(sql`date_trunc('day', ${messages.createdAt})`)
      .orderBy(sql`date_trunc('day', ${messages.createdAt})`),
    db.select({
      date: sql<string>`date_trunc('day', ${knowledgeAuditLog.createdAt})::date::text`,
      count: count(),
    }).from(knowledgeAuditLog)
      .where(gte(knowledgeAuditLog.createdAt, sevenDaysAgo))
      .groupBy(sql`date_trunc('day', ${knowledgeAuditLog.createdAt})`)
      .orderBy(sql`date_trunc('day', ${knowledgeAuditLog.createdAt})`),
  ]);

  return {
    totalUsers: Number(totalUsers),
    activeUsers: Number(activeUsers),
    newUsersToday: Number(newUsersToday),
    totalConversations: Number(totalConversations),
    totalMessages: Number(totalMessages),
    totalDocuments: Number(totalDocuments),
    totalChunks: Number(totalChunks),
    totalBrains: Number(totalBrains),
    totalMemories: Number(totalMemories),
    totalProjects: Number(totalProjects),
    totalAdmins: Number(totalAdmins),
    charts: {
      dailySignups: dailySignups.map((r) => ({ date: r.date, count: Number(r.count) })),
      dailyMessages: dailyMessages.map((r) => ({ date: r.date, count: Number(r.count) })),
      dailyKnowledgeUpdates: dailyKnowledgeUpdates.map((r) => ({ date: r.date, count: Number(r.count) })),
    },
    retrieval: await retrievalPromise,
  };
}

/* ------------------------------------------------------------------ */
/* Suspend / Restore                                                    */
/* ------------------------------------------------------------------ */

export async function adminSuspendUser(userId: string): Promise<void> {
  await db
    .update(userProfiles)
    .set({ isSuspended: true, suspendedAt: new Date(), isDisabled: true, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId));
}

export async function adminRestoreUser(userId: string): Promise<void> {
  await db
    .update(userProfiles)
    .set({ isSuspended: false, suspendedAt: null, isDisabled: false, updatedAt: new Date() })
    .where(eq(userProfiles.userId, userId));
}

/* ------------------------------------------------------------------ */
/* Notifications                                                        */
/* ------------------------------------------------------------------ */

export async function adminListNotifications(limit = 50) {
  return db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function adminGetNotification(id: string) {
  const [row] = await db.select().from(notifications).where(eq(notifications.id, id)).limit(1);
  return row ?? null;
}

export async function adminCreateNotification(data: {
  title: string;
  message: string;
  targetType: "all" | "specific";
  createdBy?: string;
}): Promise<typeof notifications.$inferSelect> {
  const [row] = await db.insert(notifications).values(data).returning();
  return row;
}

export async function adminSendNotification(id: string): Promise<void> {
  const notif = await adminGetNotification(id);
  if (!notif) throw new Error("Notification not found");

  await db.update(notifications).set({ sentAt: new Date() }).where(eq(notifications.id, id));

  if (notif.targetType === "all") {
    const allUsers = await db
      .select({ id: users.id })
      .from(users)
      .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
      .where(and(eq(userProfiles.isDisabled, false), eq(userProfiles.isTerminated, false)));

    if (allUsers.length > 0) {
      await db.insert(userNotifications).values(
        allUsers.map((u) => ({ userId: u.id, notificationId: id })),
      );
    }
  }
}

export async function adminDeleteNotification(id: string): Promise<void> {
  await db.delete(notifications).where(eq(notifications.id, id));
}

export async function getUserNotifications(userId: string) {
  return db
    .select({
      id: userNotifications.id,
      notificationId: userNotifications.notificationId,
      title: notifications.title,
      message: notifications.message,
      isRead: userNotifications.isRead,
      createdAt: notifications.createdAt,
    })
    .from(userNotifications)
    .innerJoin(notifications, eq(notifications.id, userNotifications.notificationId))
    .where(eq(userNotifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(20);
}

export async function markNotificationRead(userNotifId: string, userId: string): Promise<void> {
  await db
    .update(userNotifications)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(userNotifications.id, userNotifId), eq(userNotifications.userId, userId)));
}

/* ------------------------------------------------------------------ */
/* Enhanced user detail                                                 */
/* ------------------------------------------------------------------ */

export async function adminGetEnhancedUserDetail(userId: string) {
  const [row] = await db
    .select({
      id: users.id,
      email: userProfiles.email,
      username: userProfiles.username,
      googleName: userProfiles.googleName,
      profilePicture: userProfiles.profilePicture,
      isDisabled: userProfiles.isDisabled,
      isTerminated: userProfiles.isTerminated,
      isSuspended: userProfiles.isSuspended,
      suspendedAt: userProfiles.suspendedAt,
      createdAt: userProfiles.createdAt,
      lastLogin: userProfiles.lastLogin,
      hasGoogle: sql<boolean>`(${userProfiles.googleId} IS NOT NULL)`.as("has_google"),
      hasPassword: sql<boolean>`(${userProfiles.passwordHash} IS NOT NULL)`.as("has_password"),
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) return null;

  const [[{ convs }], [{ msgs }], [{ docs }], [{ proj }]] = await Promise.all([
    db.select({ convs: count() }).from(conversations).where(eq(conversations.userId, userId)),
    db.select({ msgs: count() }).from(messages).innerJoin(conversations, eq(conversations.id, messages.conversationId)).where(eq(conversations.userId, userId)),
    db.select({ docs: count() }).from(knowledgeDocument).where(eq(knowledgeDocument.userId, userId)),
    db.select({ proj: count() }).from(projects).where(eq(projects.userId, userId)),
  ]);

  return {
    ...row,
    totalConversations: Number(convs),
    totalMessages: Number(msgs),
    totalDocuments: Number(docs),
    totalProjects: Number(proj),
  };
}

/* ------------------------------------------------------------------ */
/* Export helpers                                                       */
/* ------------------------------------------------------------------ */

export async function adminExportUsers() {
  return db
    .select({
      id: users.id,
      email: userProfiles.email,
      username: userProfiles.username,
      googleName: userProfiles.googleName,
      isDisabled: userProfiles.isDisabled,
      isTerminated: userProfiles.isTerminated,
      isSuspended: userProfiles.isSuspended,
      createdAt: userProfiles.createdAt,
      lastLogin: userProfiles.lastLogin,
      hasGoogle: sql<boolean>`(${userProfiles.googleId} IS NOT NULL)`.as("has_google"),
      hasPassword: sql<boolean>`(${userProfiles.passwordHash} IS NOT NULL)`.as("has_password"),
    })
    .from(users)
    .innerJoin(userProfiles, eq(userProfiles.userId, users.id))
    .orderBy(desc(userProfiles.createdAt))
    .limit(ADMIN_EXPORT_USER_LIMIT);
}

export async function adminExportAuditLog() {
  return db
    .select()
    .from(knowledgeAuditLog)
    .orderBy(desc(knowledgeAuditLog.createdAt))
    .limit(10_000);
}
