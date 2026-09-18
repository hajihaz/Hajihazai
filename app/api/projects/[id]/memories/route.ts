import { auth } from "@/auth";
import { attachMemoryToProject, detachMemoryFromProject, getProject, listProjectMemories } from "@/lib/db/project-queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
const NO_STORE = { "Cache-Control": "private, no-store" } as const;
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params; const limited = await rateLimitResponse(`project-memories-read:${session.user.id}`, 120, 60_000); if (limited) return limited;
  if (!(await getProject(session.user.id, id))) return new Response("Not found", { status: 404 });
  const rows = await listProjectMemories(session.user.id, id);
  return Response.json({ memories: rows.map((r) => r.memory) }, { headers: NO_STORE });
}
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params; const limited = await rateLimitResponse(`project-memories-write:${session.user.id}`, 60, 60_000); if (limited) return limited;
  const oversized = rejectOversizedBody(req, 32_000); if (oversized) return oversized;
  const body = await req.json().catch(() => null);
  if (typeof body?.memoryId !== "string" || !body.memoryId) return Response.json({ error: "memoryId is required" }, { status: 400 });
  const row = await attachMemoryToProject(session.user.id, id, body.memoryId);
  if (!row) return new Response("Not found", { status: 404 });
  return Response.json({ projectMemory: row }, { status: 201 });
}
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params; const limited = await rateLimitResponse(`project-memories-write:${session.user.id}`, 60, 60_000); if (limited) return limited;
  const memoryId = new URL(req.url).searchParams.get("memoryId");
  if (!memoryId) return Response.json({ error: "memoryId is required" }, { status: 400 });
  const row = await detachMemoryFromProject(session.user.id, id, memoryId);
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(null, { status: 204 });
}