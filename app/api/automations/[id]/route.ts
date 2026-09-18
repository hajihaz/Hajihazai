import { auth } from "@/auth";
import { deleteAutomation, getAutomation, updateAutomation } from "@/lib/db/automation-queries";
import { getProject } from "@/lib/db/project-queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { nextAutomationRun } from "@/lib/automation/schedule";
const NO_STORE = { "Cache-Control": "private, no-store" } as const;
function validTimezone(value: string) { try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; } }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params; const limited = await rateLimitResponse(`automation-read:${session.user.id}`, 120, 60_000); if (limited) return limited;
  const row = await getAutomation(session.user.id, id); if (!row) return new Response("Not found", { status: 404 });
  return Response.json({ automation: row }, { headers: NO_STORE });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params; const limited = await rateLimitResponse(`automation-write:${session.user.id}`, 60, 60_000); if (limited) return limited;
  const oversized = rejectOversizedBody(req, 64_000); if (oversized) return oversized;
  const current = await getAutomation(session.user.id, id); if (!current) return new Response("Not found", { status: 404 });
  const body = await req.json().catch(() => null);
  const patch: Parameters<typeof updateAutomation>[2] = {};
  if (typeof body?.name === "string") patch.name = body.name.trim().slice(0, 120);
  if (typeof body?.prompt === "string") patch.prompt = body.prompt.trim().slice(0, 12000);
  if (typeof body?.schedule === "string") patch.schedule = body.schedule.trim().slice(0, 200);
  if (typeof body?.timezone === "string") {
    const timezone = body.timezone.trim().slice(0, 80);
    if (!validTimezone(timezone)) return Response.json({ error: "Invalid timezone" }, { status: 400 });
    patch.timezone = timezone;
  }
  if (body?.status === "active" || body?.status === "paused" || body?.status === "completed" || body?.status === "failed") patch.status = body.status;
  if (Object.prototype.hasOwnProperty.call(body ?? {}, "projectId")) {
    if (body.projectId !== null && typeof body.projectId !== "string") return Response.json({ error: "Invalid projectId" }, { status: 400 });
    if (body.projectId && !(await getProject(session.user.id, body.projectId))) return new Response("Project not found", { status: 404 });
    patch.projectId = body.projectId;
  }
  const schedule = patch.schedule ?? current.schedule;
  const timezone = patch.timezone ?? current.timezone;
  if (patch.schedule !== undefined || patch.timezone !== undefined || patch.status === "active") {
    const next = nextAutomationRun(schedule, timezone);
    if (!next) return Response.json({ error: "Invalid cron schedule" }, { status: 400 });
    patch.nextRunAt = next;
  }
  const row = await updateAutomation(session.user.id, id, patch); if (!row) return new Response("Not found", { status: 404 });
  return Response.json({ automation: row });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params; const limited = await rateLimitResponse(`automation-write:${session.user.id}`, 60, 60_000); if (limited) return limited;
  if (!(await deleteAutomation(session.user.id, id))) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}
