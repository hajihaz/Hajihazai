import { auth } from "@/auth";
import { getAutomation } from "@/lib/db/automation-queries";
import { runAutomationNow } from "@/lib/automation/runner";
import { rateLimitResponse } from "@/lib/ratelimit";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(
    "automation-run:" + session.user.id,
    10,
    60_000,
  );
  if (limited) return limited;

  const { id } = await params;
  const automation = await getAutomation(session.user.id, id);
  if (!automation) return new Response("Not found", { status: 404 });
  if (automation.status !== "active" && automation.status !== "failed") {
    return Response.json(
      { error: "Automation must be active or failed to run now" },
      { status: 409 },
    );
  }

  const result = await runAutomationNow(session.user.id, id);
  if (result.status === "not_found") return new Response("Not found", { status: 404 });
  if (result.status === "not_active") {
    return Response.json(
      { error: "Automation must be active or failed to run now" },
      { status: 409 },
    );
  }
  return Response.json(
    { run: result },
    { status: result.status === "error" ? 500 : 200 },
  );
}
