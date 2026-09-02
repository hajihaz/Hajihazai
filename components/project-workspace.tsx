"use client";

import { useRef, useState } from "react";
import { ArrowLeft, FileText, MessageSquarePlus, Upload } from "lucide-react";

type Chat = { id: string; title: string };
type Doc = { id: string; title: string; status: string };

export default function ProjectWorkspace({
  project,
  initialChats,
  initialDocs,
}: {
  project: { id: string; name: string; description: string | null; instructions: string | null };
  initialChats: Chat[];
  initialDocs: Doc[];
}) {
  const [chats] = useState<Chat[]>(initialChats);
  const [docs, setDocs] = useState<Doc[]>(initialDocs);
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [instrMsg, setInstrMsg] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveInstructions() {
    setInstrMsg(null);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instructions }),
    });
    setInstrMsg(res.ok ? "Saved" : "Could not save");
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || busy) return;
    setBusy(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", project.id);
      const res = await fetch("/api/knowledge/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadMsg(data.error ?? "Upload failed");
        return;
      }
      setUploadMsg(`Added “${file.name}” (${data.chunks} chunks)`);
      // Refresh the document list.
      const refreshed = await fetch(`/api/projects/${project.id}`);
      if (refreshed.ok) setDocs((await refreshed.json()).documents ?? []);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setBusy(false);
    }
  }

  async function newChat() {
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    if (!res.ok) return;
    const data = await res.json();
    window.location.href = `/?c=${data.id}`;
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-3xl px-4 py-8">
      <a href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to chat
      </a>
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      {project.description ? (
        <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>
      ) : null}

      {/* Project Chats */}
      <section className="mt-8 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Project Chats</h2>
          <button
            onClick={newChat}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <MessageSquarePlus className="size-4" /> New chat
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border">
          {chats.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No chats in this project yet.</p>
          ) : (
            chats.map((c) => (
              <a
                key={c.id}
                href={`/?c=${c.id}`}
                className="block border-b px-3 py-2.5 text-sm last:border-0 hover:bg-accent"
              >
                {c.title}
              </a>
            ))
          )}
        </div>
      </section>

      {/* Project Knowledge / Files */}
      <section className="mt-8 space-y-2">
        <h2 className="text-sm font-semibold">Project Knowledge &amp; Files</h2>
        <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.docx" className="text-sm" />
          <button
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          >
            <Upload className="size-4" /> Upload
          </button>
        </form>
        <p className="text-xs text-muted-foreground">
          PDF, DOCX, TXT, and MD supported. Max 5MB.
        </p>
        {uploadMsg ? <p className="text-xs text-muted-foreground">{uploadMsg}</p> : null}
        <div className="overflow-hidden rounded-lg border">
          {docs.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No documents yet.</p>
          ) : (
            docs.map((d) => (
              <div key={d.id} className="flex items-center gap-2 border-b px-3 py-2.5 text-sm last:border-0">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{d.title}</span>
                <span className="text-xs text-muted-foreground">{d.status}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Project Instructions */}
      <section className="mt-8 space-y-2">
        <h2 className="text-sm font-semibold">Project Instructions</h2>
        <p className="text-xs text-muted-foreground">
          Added to the system prompt for every chat in this project.
        </p>
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={5}
          placeholder="e.g. Always answer as a legal assistant; cite the relevant act."
          className="w-full resize-y rounded-lg border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={saveInstructions}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Save instructions
          </button>
          {instrMsg ? <span className="text-xs text-muted-foreground">{instrMsg}</span> : null}
        </div>
      </section>
    </main>
  );
}
