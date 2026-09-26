import { and, desc, eq } from "drizzle-orm";
import { db } from "./index";
import {
  artifacts,
  automationRuns,
  automations,
  conversations,
  knowledgeDocument,
  projectMemories,
  userMemory,
} from "./schema";

export type ProjectActivityEvent = {
  id: string;
  kind: "chat" | "file" | "memory" | "artifact" | "automation" | "automation_run";
  title: string;
  detail: string | null;
  href: string | null;
  at: Date;
};

export async function listProjectActivity(
  userId: string,
  projectId: string,
  limit = 30,
): Promise<ProjectActivityEvent[]> {
  const perTypeLimit = Math.max(10, Math.min(30, limit));
  const [chatRows, fileRows, memoryRows, artifactRows, automationRows, runRows] =
    await Promise.all([
      db.select({ id: conversations.id, title: conversations.title, at: conversations.updatedAt })
        .from(conversations)
        .where(and(eq(conversations.userId, userId), eq(conversations.projectId, projectId)))
        .orderBy(desc(conversations.updatedAt)).limit(perTypeLimit),
      db.select({ id: knowledgeDocument.id, title: knowledgeDocument.title, status: knowledgeDocument.status, at: knowledgeDocument.updatedAt })
        .from(knowledgeDocument)
        .where(and(eq(knowledgeDocument.userId, userId), eq(knowledgeDocument.projectId, projectId)))
        .orderBy(desc(knowledgeDocument.updatedAt)).limit(perTypeLimit),
      db.select({ id: projectMemories.id, title: userMemory.title, content: userMemory.content, at: projectMemories.createdAt })
        .from(projectMemories)
        .innerJoin(userMemory, eq(userMemory.id, projectMemories.memoryId))
        .where(and(eq(projectMemories.userId, userId), eq(projectMemories.projectId, projectId)))
        .orderBy(desc(projectMemories.createdAt)).limit(perTypeLimit),
      db.select({ id: artifacts.id, title: artifacts.title, conversationId: artifacts.conversationId, at: artifacts.updatedAt })
        .from(artifacts)
        .innerJoin(conversations, eq(conversations.id, artifacts.conversationId))
        .where(and(eq(artifacts.userId, userId), eq(conversations.userId, userId), eq(conversations.projectId, projectId)))
        .orderBy(desc(artifacts.updatedAt)).limit(perTypeLimit),
      db.select({ id: automations.id, name: automations.name, status: automations.status, at: automations.updatedAt })
        .from(automations)
        .where(and(eq(automations.userId, userId), eq(automations.projectId, projectId)))
        .orderBy(desc(automations.updatedAt)).limit(perTypeLimit),
      db.select({ id: automationRuns.id, name: automations.name, status: automationRuns.status, at: automationRuns.startedAt })
        .from(automationRuns)
        .innerJoin(automations, eq(automations.id, automationRuns.automationId))
        .where(and(eq(automationRuns.userId, userId), eq(automations.userId, userId), eq(automations.projectId, projectId)))
        .orderBy(desc(automationRuns.startedAt)).limit(perTypeLimit),
    ]);

  const events: ProjectActivityEvent[] = [
    ...chatRows.map((row) => ({ id: `chat:${row.id}`, kind: "chat" as const, title: row.title, detail: "Project chat updated", href: `/?c=${row.id}`, at: row.at })),
    ...fileRows.map((row) => ({ id: `file:${row.id}`, kind: "file" as const, title: row.title, detail: `Project file · ${row.status}`, href: `/projects/${projectId}#files`, at: row.at })),
    ...memoryRows.map((row) => ({ id: `memory:${row.id}`, kind: "memory" as const, title: row.title || row.content.slice(0, 80), detail: "Memory attached to project", href: `/projects/${projectId}#memory`, at: row.at })),
    ...artifactRows.map((row) => ({ id: `artifact:${row.id}`, kind: "artifact" as const, title: row.title, detail: "Project artifact updated", href: row.conversationId ? `/?c=${row.conversationId}` : `/projects/${projectId}#artifacts`, at: row.at })),
    ...automationRows.map((row) => ({ id: `automation:${row.id}`, kind: "automation" as const, title: row.name, detail: `Automation · ${row.status}`, href: `/projects/${projectId}#automations`, at: row.at })),
    ...runRows.map((row) => ({ id: `automation-run:${row.id}`, kind: "automation_run" as const, title: row.name, detail: `Automation run · ${row.status}`, href: `/projects/${projectId}#automations`, at: row.at })),
  ];

  return events
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, Math.max(1, Math.min(100, limit)));
}
