import { auth } from "@/auth";
import { assertKnowledgeWritePermission } from "@/lib/knowledge/permissions";
import { getProject } from "@/lib/db/project-queries";
import { ingestDocument, MAX_UPLOAD_BYTES } from "@/lib/knowledge/ingest";
import { extFromName, isSupportedExt } from "@/lib/knowledge/extract";
import { rateLimitResponse } from "@/lib/ratelimit";

/** Upload + ingest a knowledge document (optionally into a project). */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });

  const perm = await assertKnowledgeWritePermission(session.user.email);
  if (!perm.ok) return Response.json({ error: perm.error }, { status: 403 });

  const limited = await rateLimitResponse(`knowledge-upload:${session.user.id}`, 20, 60_000);
  if (limited) return limited;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "A file is required" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json({ error: "File exceeds the 5MB limit" }, { status: 413 });
  }
  if (!isSupportedExt(extFromName(file.name))) {
    return Response.json(
      { error: "Unsupported file type. Allowed: TXT and MD" },
      { status: 400 },
    );
  }

  const projectId = (form?.get("projectId") as string) || null;
  if (projectId) {
    const owned = await getProject(session.user.id, projectId);
    if (!owned) return new Response("Not found", { status: 404 });
  }
  const title = (form?.get("title") as string) || file.name;
  const buffer = Buffer.from(await file.arrayBuffer());

  const result = await ingestDocument(session.user.id, {
    filename: file.name,
    buffer,
    projectId,
    title,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  return Response.json({
    ok: true,
    documentId: result.documentId,
    chunks: result.chunks,
  });
}
