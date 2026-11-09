import { runDueAutomations } from "@/lib/automation/runner";
import { isCronAuthorized } from "@/lib/cron-authorization";

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json(await runDueAutomations(new Date(), 10));
  } catch (error) {
    console.error("[cron] automation runner failed:", error);
    return Response.json({ error: "Automation runner failed" }, { status: 500 });
  }
}
