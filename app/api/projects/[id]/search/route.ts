import { auth } from "@/auth";
import { db } from "@/lib/db";
import {
  artifacts,
  automations,
  conversations,
  knowledgeContent,
  knowledgeDocument,
  messages,
  projectMemories,
  projects,
  userMemory,
} from "@/lib/db/schema";
import { rateLimitResponse } from "@/lib/ratelimit";
import { and, desc, eq, ilike, or } from "drizzle-orm";

const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function snippet(text: string | null | undefined, query: string, max = 180) {
  const source = (text ?? "").replace(/\s+/g, " ").trim();
  if (!source) return null;
  const index = source.toLowerCase().indexOf(query.toLowerCase());
  if (source.length <= max) return source;
  const start = Math.max(0, index >= 0 ? index - Math.floor(max / 3) : 0);
  const end = Math.min(source.length, start + max);
  return `${start > 0 ? "…" : ""}${source.slice(start, end)}${end < source.length ? "…" : ""}`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`project-search:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const [project] = await db.select({
    id: projects.id,
    name: projects.name,
    description: projects.description,
    instructions: projects.instructions,
    updatedAt: projects.updatedAt,
  }).from(projects)
    .where(and(eq(projects.id, id), eq(projects.userId, session.user.id))).limit(1);
  if (!project) return new Response("Not found", { status: 404 });

  const query = new URL(req.url).searchParams.get("q")?.trim().slice(0, 200) ?? "";
  if (!query) return Response.json({ results: [] }, { headers: NO_STORE });
  const term = `%${query}%`;

  const [docs, chats, messageRows, artifactRows, memoryRows, automationRows] = await Promise.all([
    db.select({
      id: knowledgeDocument.id,
      title: knowledgeDocument.title,
      content: knowledgeContent.content,
      updatedAt: knowledgeDocument.updatedAt,
    }).from(knowledgeDocument)
      .leftJoin(knowledgeContent, eq(knowledgeContent.documentId, knowledgeDocument.id))
      .where(and(
        eq(knowledgeDocument.userId, session.user.id),
        eq(knowledgeDocument.projectId, id),
        or(ilike(knowledgeDocument.title, term), ilike(knowledgeContent.content, term)),
      )).orderBy(desc(knowledgeDocument.updatedAt)).limit(12),
    db.select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
      .from(conversations)
      .where(and(
        eq(conversations.userId, session.user.id),
        eq(conversations.projectId, id),
        ilike(conversations.title, term),
      )).orderBy(desc(conversations.updatedAt)).limit(12),
    db.select({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
      conversationId: conversations.id,
      conversationTitle: conversations.title,
    }).from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(and(
        eq(conversations.userId, session.user.id),
        eq(conversations.projectId, id),
        ilike(messages.content, term),
      )).orderBy(desc(messages.createdAt)).limit(12),
    db.select({
      id: artifacts.id,
      title: artifacts.title,
      content: artifacts.content,
      updatedAt: artifacts.updatedAt,
      conversationId: conversations.id,
    }).from(artifacts)
      .innerJoin(conversations, eq(conversations.id, artifacts.conversationId))
      .where(and(
        eq(artifacts.userId, session.user.id),
        eq(conversations.userId, session.user.id),
        eq(conversations.projectId, id),
        or(ilike(artifacts.title, term), ilike(artifacts.content, term)),
      )).orderBy(desc(artifacts.updatedAt)).limit(12),
    db.select({
      id: userMemory.id,
      title: userMemory.title,
      content: userMemory.content,
      at: projectMemories.createdAt,
    }).from(projectMemories)
      .innerJoin(userMemory, eq(userMemory.id, projectMemories.memoryId))
      .where(and(
        eq(projectMemories.userId, session.user.id),
        eq(projectMemories.projectId, id),
        eq(userMemory.userId, session.user.id),
        or(ilike(userMemory.title, term), ilike(userMemory.content, term)),
      )).orderBy(desc(projectMemories.createdAt)).limit(12),
    db.select({
      id: automations.id,
      name: automations.name,
      prompt: automations.prompt,
      updatedAt: automations.updatedAt,
    }).from(automations)
      .where(and(
        eq(automations.userId, session.user.id),
        eq(automations.projectId, id),
        or(ilike(automations.name, term), ilike(automations.prompt, term)),
      )).orderBy(desc(automations.updatedAt)).limit(12),
  ]);

  const qLower = query.toLowerCase();
  const projectMatchText = [project.name, project.description, project.instructions]
    .find((value) => value?.toLowerCase().includes(qLower));

  const results = [
    ...(projectMatchText ? [{
      id: project.id,
      kind: "project" as const,
      title: project.name,
      snippet: snippet(projectMatchText, query),
      href: `/projects/${id}#instructions`,
      at: project.updatedAt,
    }] : []),
    ...docs.map((row) => ({ id: row.id, kind: "file" as const, title: row.title, snippet: snippet(row.content, query), href: `/projects/${id}#files`, at: row.updatedAt })),
    ...chats.map((row) => ({ id: row.id, kind: "chat" as const, title: row.title, snippet: null, href: `/?c=${row.id}`, at: row.updatedAt })),
    ...messageRows.map((row) => ({ id: row.id, kind: "message" as const, title: row.conversationTitle, snippet: snippet(row.content, query), href: `/?c=${row.conversationId}`, at: row.createdAt })),
    ...artifactRows.map((row) => ({ id: row.id, kind: "artifact" as const, title: row.title, snippet: snippet(row.content, query), href: `/?c=${row.conversationId}`, at: row.updatedAt })),
    ...memoryRows.map((row) => ({ id: row.id, kind: "memory" as const, title: row.title || "Project memory", snippet: snippet(row.content, query), href: `/projects/${id}#memory`, at: row.at })),
    ...automationRows.map((row) => ({ id: row.id, kind: "automation" as const, title: row.name, snippet: snippet(row.prompt, query), href: `/projects/${id}#automations`, at: row.updatedAt })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 30)
    .map(({ at: _at, ...result }) => result);

  return Response.json({ results }, { headers: NO_STORE });
}
