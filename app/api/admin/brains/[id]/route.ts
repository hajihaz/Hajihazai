import { requireAdmin } from "@/lib/admin/session";
import { rateLimitResponse } from "@/lib/ratelimit";
import { rejectOversizedBody } from "@/lib/auth/request";
import { getBrainById, updateBrain, deleteBrain } from "@/lib/db/brain-queries";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-read:brains-[id]:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const brain = await getBrainById(id);
  if (!brain) return new Response("Not found", { status: 404 });
  return Response.json({ brain });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const oversized = rejectOversizedBody(req, 64 * 1024);
  if (oversized) return oversized;

  const body = await req.json();
  const updated = await updateBrain(id, {
    ...(body.name ? { name: body.name.trim() } : {}),
    ...(body.slug ? { slug: body.slug.trim().toLowerCase().replace(/\s+/g, "-") } : {}),
    ...(body.description !== undefined ? { description: body.description || null } : {}),
    ...(body.icon ? { icon: body.icon } : {}),
    ...(body.color ? { color: body.color } : {}),
  });
  if (!updated) return new Response("Not found", { status: 404 });
  return Response.json({ brain: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sess = await requireAdmin();
  if (!sess) return new Response("Unauthorized", { status: 401 });
  const limited = await rateLimitResponse(`admin-mutation:${sess.adminId}`, 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const brain = await getBrainById(id);
  if (!brain) return new Response("Not found", { status: 404 });
  if (brain.isSystem) {
    return Response.json({ error: "Cannot delete a system brain" }, { status: 403 });
  }

  await deleteBrain(id);
  return Response.json({ ok: true });
}
