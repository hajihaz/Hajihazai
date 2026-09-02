import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { adminExportAuditLog } from "@/lib/admin/queries";

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-export-audit:${sess.adminId}`, 5, 60_000);
  if (limited) return limited;

  const rows = await adminExportAuditLog();
  const csv = toCSV(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      action: r.action,
      documentTitle: r.documentTitle,
      documentId: r.documentId ?? "",
      userId: r.userId ?? "",
      createdAt: r.createdAt?.toISOString() ?? "",
    })),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
