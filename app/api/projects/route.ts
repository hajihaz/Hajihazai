import { auth } from "@/auth";
import { listProjects, createProject } from "@/lib/db/project-queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
const NAME_MAX = 100;
const TEXT_MAX = 4000;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const readLimited = await rateLimitResponse(`projects-read:${session.user.id}`, 120, 60_000);
  if (readLimited) return readLimited;

  const rows = await listProjects(session.user.id);
  return Response.json({ projects: rows }, { headers: PRIVATE_NO_STORE });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const limited = await rateLimitResponse(`projects:${session.user.id}`, 30, 60_000);
  if (limited) return limited;

  const oversized = rejectOversizedBody(req, 65536);
  if (oversized) return oversized;

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "Name is required" }, { status: 400 });
  if (name.length > NAME_MAX) {
    return Response.json({ error: "Name is too long" }, { status: 400 });
  }
  const description =
    typeof body?.description === "string" ? body.description.slice(0, TEXT_MAX) : null;
  const instructions =
    typeof body?.instructions === "string" ? body.instructions.slice(0, TEXT_MAX) : null;

  const project = await createProject(session.user.id, { name, description, instructions });
  return Response.json({ project }, { status: 201 });
}
