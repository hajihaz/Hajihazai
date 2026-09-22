import { requireAdmin } from "@/lib/admin/session";
import { listAdminAuditLog } from "@/lib/admin/queries";
import { rateLimitResponse } from "@/lib/ratelimit";

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  return raw.includes(",") || raw.includes('"') || raw.includes("\n")
    ? `"${raw.replace(/"/g, '""')}"`
    : raw;
}

export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-export-security-audit:${sess.adminId}`, 5, 60_000);
  if (limited) return limited;

  const rows = await listAdminAuditLog(200);
  const header = ["id", "adminId", "action", "targetType", "targetId", "ipAddress", "metadata", "createdAt"];
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push([
      row.id,
      row.adminId ?? "",
      row.action,
      row.targetType ?? "",
      row.targetId ?? "",
      row.ipAddress ?? "",
      row.metadata ? JSON.stringify(row.metadata) : "",
      row.createdAt.toISOString(),
    ].map(csvCell).join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="security-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
