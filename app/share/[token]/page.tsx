import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { verifyShareToken } from "@/lib/share";
import { db } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

export default async function SharedConversation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = verifyShareToken(token);
  if (!id) notFound();
  const [conversation] = await db.select({ id: conversations.id, title: conversations.title }).from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conversation) notFound();
  const rows = await db.select({ role: messages.role, content: messages.content, createdAt: messages.createdAt }).from(messages).where(eq(messages.conversationId, id)).orderBy(asc(messages.createdAt)).limit(200);
  return (
    <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3 border-b pb-5">
          <div className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-black"><img src="/branding/hajihaz-mark.png" alt="HajiHaz AI" className="size-9 object-contain" /></div>
          <div><p className="text-sm font-semibold">HajiHaz AI</p><p className="text-xs text-muted-foreground">Shared conversation · read only</p></div>
        </div>
        <h1 className="mb-7 text-2xl font-semibold tracking-tight">{conversation.title}</h1>
        <div className="space-y-6">
          {rows.map((m, i) => <article key={`${i}-${m.createdAt?.toISOString()}`} className="rounded-2xl border bg-card p-4 shadow-sm"><p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{m.role === "user" ? "You" : "HajiHaz"}</p>{m.role === "assistant" ? <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown></div> : <p className="whitespace-pre-wrap text-sm leading-6">{m.content}</p>}</article>)}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">This shared view is read-only. Attachments and private account data are not exposed.</p>
      </div>
    </main>
  );
}
