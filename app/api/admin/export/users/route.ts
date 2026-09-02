import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { adminExportUsers } from "@/lib/admin/queries";

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ];
  return lines.join("\n");
}

export async function GET() {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-export-users:${sess.adminId}`, 5, 60_000);
  if (limited) return limited;

  const rows = await adminExportUsers();
  const csv = toCSV(
    rows.map((r) => ({
      id: r.id,
      email: r.email,
      username: r.username ?? "",
      name: r.googleName ?? "",
      loginType: r.hasGoogle && r.hasPassword ? "google+password" : r.hasGoogle ? "google" : "password",
      status: r.isTerminated ? "terminated" : r.isSuspended ? "suspended" : r.isDisabled ? "disabled" : "active",
      createdAt: r.createdAt?.toISOString() ?? "",
      lastLogin: r.lastLogin?.toISOString() ?? "",
    })),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
