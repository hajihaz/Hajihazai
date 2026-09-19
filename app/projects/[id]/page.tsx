import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProject, listProjectMemories } from "@/lib/db/project-queries";
import { listProjectConversations } from "@/lib/db/queries";
import { listProjectDocuments } from "@/lib/db/knowledge-queries";
import { listProjectArtifacts } from "@/lib/db/artifact-queries";
import { listAutomations } from "@/lib/db/automation-queries";
import ProjectWorkspace from "@/components/project-workspace";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const { id } = await params;

  const project = await getProject(session.user.id, id);
  if (!project) notFound();

  const [chats, documents, artifacts, memories, automations] = await Promise.all([
    listProjectConversations(session.user.id, id),
    listProjectDocuments(session.user.id, id),
    listProjectArtifacts(session.user.id, id),
    listProjectMemories(session.user.id, id),
    listAutomations(session.user.id, id),
  ]);

  return (
    <ProjectWorkspace
      project={{
        id: project.id,
        name: project.name,
        description: project.description,
        instructions: project.instructions,
        isSystem: project.isSystem,
      }}
      initialChats={chats.map((c) => ({ id: c.id, title: c.title }))}
      initialDocs={documents.map((d) => ({
        id: d.id,
        title: d.title,
        status: d.status,
      }))}
      initialArtifacts={artifacts.map((a) => ({
        id: a.id,
        title: a.title,
        conversationId: a.conversationId,
        updatedAt: a.updatedAt.toISOString(),
      }))}
      initialMemories={memories.map((m) => ({
        id: m.memory.id,
        type: m.memory.type,
        title: m.memory.title,
        content: m.memory.content,
        status: m.memory.status,
      }))}
      initialAutomations={automations.map((a) => ({
        id: a.id,
        name: a.name,
        prompt: a.prompt,
        schedule: a.schedule,
        timezone: a.timezone,
        status: a.status,
        nextRunAt: a.nextRunAt?.toISOString() ?? null,
        lastRunAt: a.lastRunAt?.toISOString() ?? null,
        lastStatus: a.lastStatus,
        lastError: a.lastError,
      }))}
    />
  );
}
