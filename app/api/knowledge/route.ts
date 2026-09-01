import { auth } from "@/auth";
import { createDocument, listDocuments } from "@/lib/db/knowledge-queries";
import { assertKnowledgeWritePermission } from "@/lib/knowledge/permissions";
import { rateLimitResponse } from "@/lib/ratelimit";
import { validateKnowledgeContent, logKnowledgeAction } from "@/lib/knowledge/safety";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
const SOURCE_TYPES = ["pdf", "text", "website", "note"] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const documents = await listDocuments(session.user.id);
  return Response.json({ documents }, { headers: PRIVATE_NO_STORE });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const limited = await rateLimitResponse(`knowledge-create:${session.user.id}`, 30, 60_000);
  if (limited) return limited;

  const perm = await assertKnowledgeWritePermission(session.user.email);
  if (!perm.ok) {
    return Response.json({ error: perm.error }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const title = body?.title;
  const sourceType = body?.sourceType;
  const content: unknown = body?.content;

  if (typeof title !== "string" || !title.trim()) {
    return new Response("title is required", { status: 400 });
  }
  if (sourceType !== undefined && !SOURCE_TYPES.includes(sourceType)) {
    return new Response("invalid sourceType", { status: 400 });
  }

  // Safety validation when content is provided at creation time
  if (typeof content === "string") {
    const safety = validateKnowledgeContent(content);
    if (!safety.ok) {
      return Response.json({ error: safety.error }, { status: 422 });
    }
  }

  const document = await createDocument(session.user.id, {
    title: title.trim(),
    sourceType,
  });

  void logKnowledgeAction({
    userId: session.user.id,
    email: session.user.email ?? "unknown",
    action: "create",
    documentId: document.id,
    documentTitle: title.trim(),
    contentAfter: typeof content === "string" ? content.slice(0, 2000) : null,
  });

  return Response.json({ document }, { status: 201 });
}
