import { auth } from "@/auth";
import { createAutomation, listAutomations } from "@/lib/db/automation-queries";
import { getProject } from "@/lib/db/project-queries";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { nextAutomationRun } from "@/lib/automation/schedule";
const NO_STORE = { "Cache-Control": "private, no-store" } as const;
const LIMITS = { name: 120, prompt: 12000, schedule: 200, timezone: 80 };
function validTimezone(value: string) { try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; } catch { return false; } }
export async function GET(req: Request) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`automations-read:${session.user.id}`, 120, 60_000); if (limited) return limited;
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;
  return Response.json({ automations: await listAutomations(session.user.id, projectId) }, { headers: NO_STORE });
}
export async function POST(req: Request) {
  const session = await auth(); if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`automations-write:${session.user.id}`, 30, 60_000); if (limited) return limited;
  const oversized = rejectOversizedBody(req, 64_000); if (oversized) return oversized;
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, LIMITS.name) : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, LIMITS.prompt) : "";
  const schedule = typeof body?.schedule === "string" ? body.schedule.trim().slice(0, LIMITS.schedule) : "";
  const timezone = typeof body?.timezone === "string" ? body.timezone.trim().slice(0, LIMITS.timezone) : "UTC";
  const projectId = typeof body?.projectId === "string" && body.projectId ? body.projectId : null;
  if (!name || !prompt || !schedule) return Response.json({ error: "name, prompt and schedule are required" }, { status: 400 });
  if (!validTimezone(timezone)) return Response.json({ error: "Invalid timezone" }, { status: 400 });
  const nextRunAt = nextAutomationRun(schedule, timezone);
  if (!nextRunAt) return Response.json({ error: "Invalid cron schedule" }, { status: 400 });
  if (projectId && !(await getProject(session.user.id, projectId))) return new Response("Project not found", { status: 404 });
  const row = await createAutomation(session.user.id, { name, prompt, schedule, timezone, nextRunAt, projectId });
  if (!row) return new Response("Project not found", { status: 404 });
  return Response.json({ automation: row }, { status: 201 });
}