import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "./index";
import { automations, automationRuns, projects } from "./schema";

export async function listAutomations(userId: string, projectId?: string) {
  return db.select().from(automations).where(
    projectId ? and(eq(automations.userId, userId), eq(automations.projectId, projectId)) : eq(automations.userId, userId),
  ).orderBy(desc(automations.updatedAt)).limit(200);
}

export async function getAutomation(userId: string, id: string) {
  const [row] = await db.select().from(automations)
    .where(and(eq(automations.id, id), eq(automations.userId, userId))).limit(1);
  return row ?? null;
}

export async function createAutomation(userId: string, input: {
  name: string; prompt: string; schedule: string; timezone: string;
  nextRunAt: Date; projectId?: string | null;
}) {
  if (input.projectId) {
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, input.projectId), eq(projects.userId, userId))).limit(1);
    if (!project) return null;
  }
  const [row] = await db.insert(automations).values({
    userId, name: input.name, prompt: input.prompt, schedule: input.schedule,
    timezone: input.timezone, nextRunAt: input.nextRunAt, projectId: input.projectId ?? null,
  }).returning();
  return row;
}

export async function updateAutomation(userId: string, id: string, patch: {
  name?: string; prompt?: string; schedule?: string; timezone?: string;
  nextRunAt?: Date | null; projectId?: string | null;
  status?: "active" | "paused" | "completed" | "failed";
}) {
  if (patch.projectId) {
    const [project] = await db.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, patch.projectId), eq(projects.userId, userId))).limit(1);
    if (!project) return null;
  }
  const [row] = await db.update(automations)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(automations.id, id), eq(automations.userId, userId))).returning();
  return row ?? null;
}

export async function deleteAutomation(userId: string, id: string) {
  const [row] = await db.delete(automations)
    .where(and(eq(automations.id, id), eq(automations.userId, userId))).returning();
  return !!row;
}

export async function listAutomationRuns(userId: string, automationId: string) {
  const owned = await getAutomation(userId, automationId);
  if (!owned) return null;
  return db.select().from(automationRuns)
    .where(and(eq(automationRuns.userId, userId), eq(automationRuns.automationId, automationId)))
    .orderBy(desc(automationRuns.startedAt)).limit(100);
}

/** Claim due rows by advancing nextRunAt before execution. */
export async function claimDueAutomations(now: Date, limit = 10) {
  const due = await db.select().from(automations)
    .where(and(eq(automations.status, "active"), lte(automations.nextRunAt, now)))
    .orderBy(automations.nextRunAt).limit(limit);
  const claimed = [];
  for (const row of due) {
    const [claim] = await db.update(automations)
      .set({ nextRunAt: new Date(now.getTime() + 10 * 60_000), updatedAt: now })
      .where(and(eq(automations.id, row.id), eq(automations.status, "active"), lte(automations.nextRunAt, now)))
      .returning();
    if (claim) claimed.push({ ...claim, claimedPreviousRunAt: row.nextRunAt });
  }
  return claimed;
}

export async function createAutomationRun(userId: string, automationId: string) {
  const [row] = await db.insert(automationRuns).values({ userId, automationId }).returning();
  return row;
}

export async function finishAutomationRun(userId: string, runId: string, result: {
  status: string; output?: string | null; error?: string | null; modelId?: string | null;
}) {
  const [row] = await db.update(automationRuns)
    .set({ ...result, finishedAt: new Date() })
    .where(and(eq(automationRuns.id, runId), eq(automationRuns.userId, userId)))
    .returning();
  return row ?? null;
}

export async function markAutomationResult(userId: string, automationId: string, result: {
  status: "active" | "failed"; lastError?: string | null; nextRunAt?: Date | null;
}) {
  const [row] = await db.update(automations)
    .set({
      lastRunAt: new Date(),
      lastStatus: result.status,
      lastError: result.lastError ?? null,
      status: result.status,
      nextRunAt: result.nextRunAt,
      updatedAt: new Date(),
    })
    .where(and(eq(automations.id, automationId), eq(automations.userId, userId)))
    .returning();
  return row ?? null;
}
