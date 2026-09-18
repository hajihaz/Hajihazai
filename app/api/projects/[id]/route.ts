import { auth } from "@/auth";
import { getProject, updateProject, deleteProject } from "@/lib/db/project-queries";
import { listProjectConversations } from "@/lib/db/queries";
import { listProjectDocuments } from "@/lib/db/knowledge-queries";
import { listProjectMemories } from "@/lib/db/project-queries";
import { listAutomations } from "@/lib/db/automation-queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
const NAME_MAX = 100;
const TEXT_MAX = 4000;

/** Full project workspace: project + its chats + its documents. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const project = await getProject(session.user.id, id);
  if (!project) return new Response("Not found", { status: 404 });

  const [chats, documents, memories, automations] = await Promise.all([
    listProjectConversations(session.user.id, id),
    listProjectDocuments(session.user.id, id),
    listProjectMemories(session.user.id, id),
    listAutomations(session.user.id, id),
  ]);
  return Response.json({
    project,
    chats: chats.map((c) => ({ id: c.id, title: c.title })),
    documents: documents.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      createdAt: d.createdAt,
    })),
    memories: memories.map((m) => ({
      id: m.memory.id,
      type: m.memory.type,
      title: m.memory.title,
      content: m.memory.content,
      status: m.memory.status,
    })),
    automations: automations.map((a) => ({
      id: a.id,
      name: a.name,
      schedule: a.schedule,
      timezone: a.timezone,
      status: a.status,
      nextRunAt: a.nextRunAt,
      lastRunAt: a.lastRunAt,
      lastStatus: a.lastStatus,
    })),
  }, { headers: PRIVATE_NO_STORE });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;

  const limited = await rateLimitResponse(`project-mutation:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 65536);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  const patch: { name?: string; description?: string | null; instructions?: string | null } = {};
  if (typeof body?.name === "string") {
    const n = body.name.trim();
    if (!n) return Response.json({ error: "Name is required" }, { status: 400 });
    patch.name = n.slice(0, NAME_MAX);
  }
  if (typeof body?.description === "string") patch.description = body.description.slice(0, TEXT_MAX);
  if (typeof body?.instructions === "string") patch.instructions = body.instructions.slice(0, TEXT_MAX);

  const updated = await updateProject(session.user.id, id, patch);
  if (!updated) return new Response("Not found", { status: 404 });
  return Response.json({ project: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const limited = await rateLimitResponse(`project-mutation:${session.user.id}`, 60, 60_000);
  if (limited) return limited;

  const ok = await deleteProject(session.user.id, id);
  if (!ok) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
