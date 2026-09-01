import { auth } from "@/auth";
import { createDocument, listDocuments } from "@/lib/db/knowledge-queries";
import { assertKnowledgeWritePermission } from "@/lib/knowledge/permissions";
import { rateLimitResponse } from "@/lib/ratelimit";
import { logKnowledgeAction } from "@/lib/knowledge/safety";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" } as const;
const SOURCE_TYPES = ["pdf", "text", "website", "note"] as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }
  const limited = await rateLimitResponse(`knowledge-list:${session.user.id}`, 60, 60_000);
  if (limited) return limited;
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
  if (title.trim().length > 200) {
    return new Response("title is too long (maximum 200 characters)", { status: 400 });
  }
  if (sourceType !== undefined && !SOURCE_TYPES.includes(sourceType)) {
    return new Response("invalid sourceType", { status: 400 });
  }

  // Content has a dedicated canonical-content endpoint. Reject it here rather
  // than validating/logging and silently discarding caller data.
  if (content !== undefined) {
    return Response.json(
      { error: "content is not accepted by this endpoint; create the document first, then save content" },
      { status: 400 },
    );
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
    contentAfter: null,
  });

  return Response.json({ document }, { status: 201 });
}
