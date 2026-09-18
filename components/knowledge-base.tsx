"use client";

import { useState } from "react";
import { BookOpen, FileText, Plus, Trash2, X } from "lucide-react";

type SourceType = "pdf" | "text" | "website" | "note" | "image";
type DocStatus = "processing" | "active" | "failed";
type Doc = {
  id: string;
  title: string;
  sourceType: SourceType;
  status: DocStatus;
};

const SOURCE_TYPES: SourceType[] = ["note", "text", "pdf", "website"];

export default function KnowledgeBase({
  initialDocuments,
}: {
  initialDocuments: Doc[];
}) {
  const [documents, setDocuments] = useState<Doc[]>(initialDocuments);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("note");
  const [saving, setSaving] = useState(false);

  // Editor state.
  const [openDoc, setOpenDoc] = useState<Doc | null>(null);
  const [content, setContent] = useState("");
  const [contentExists, setContentExists] = useState(false);
  const [loadingContent, setLoadingContent] = useState(false);
  const [savingContent, setSavingContent] = useState(false);

  // Chunk state.
  const [chunks, setChunks] = useState<
    { id: string; chunkIndex: number; content: string }[]
  >([]);
  const [chunkCount, setChunkCount] = useState<number | null>(null);
  const [chunkBusy, setChunkBusy] = useState(false);

  // Embedding state.
  const [embedStatus, setEmbedStatus] = useState<{
    total: number;
    embedded: number;
    dimensions: number;
  } | null>(null);
  const [embedBusy, setEmbedBusy] = useState(false);

  async function addDocument() {
    const t = title.trim();
    if (!t || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, sourceType }),
      });
      if (res.ok) {
        const data = await res.json();
        setDocuments((p) => [data.document, ...p]);
        setTitle("");
        setSourceType("note");
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeDocument(id: string) {
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDocuments((p) => p.filter((d) => d.id !== id));
      if (openDoc?.id === id) setOpenDoc(null);
    }
  }

  async function openDocument(d: Doc) {
    setOpenDoc(d);
    setLoadingContent(true);
    setContent("");
    setContentExists(false);
    setChunks([]);
    setChunkCount(null);
    setEmbedStatus(null);
    try {
      const res = await fetch(`/api/knowledge/${d.id}/content`);
      if (res.ok) {
        const data = await res.json();
        setContent(data.content?.content ?? "");
        setContentExists(!!data.content);
      }
    } finally {
      setLoadingContent(false);
    }
  }

  async function saveContent() {
    if (!openDoc || savingContent) return;
    setSavingContent(true);
    try {
      const res = await fetch(`/api/knowledge/${openDoc.id}/content`, {
        method: contentExists ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (res.ok) setContentExists(true);
    } finally {
      setSavingContent(false);
    }
  }

  async function generateChunks() {
    if (!openDoc || chunkBusy) return;
    setChunkBusy(true);
    try {
      const res = await fetch(`/api/knowledge/${openDoc.id}/chunk`, {
        method: "POST",
      });
      if (res.ok) await viewChunks();
    } finally {
      setChunkBusy(false);
    }
  }

  async function viewChunks() {
    if (!openDoc) return;
    const res = await fetch(`/api/knowledge/${openDoc.id}/chunks`);
    if (res.ok) {
      const data = await res.json();
      setChunks(data.chunks);
      setChunkCount(data.count);
    }
  }

  async function embedChunks() {
    if (!openDoc || embedBusy) return;
    setEmbedBusy(true);
    try {
      const res = await fetch(`/api/knowledge/${openDoc.id}/embed`, {
        method: "POST",
      });
      if (res.ok) setEmbedStatus(await res.json());
    } finally {
      setEmbedBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="size-6" />
          <h1 className="text-2xl font-semibold tracking-tight">
            Knowledge Base
          </h1>
        </div>
        <a
          href="/knowledge/search"
          className="rounded-lg border px-3 py-2 text-sm text-muted-foreground hover:bg-accent"
        >
          Search
        </a>
      </div>

      {/* Editor */}
      {openDoc ? (
        <div className="mb-8 rounded-xl border p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4" />
              {openDoc.title}
            </div>
            <button
              onClick={() => setOpenDoc(null)}
              aria-label="Close editor"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" />
            </button>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            placeholder={loadingContent ? "Loading…" : "Document content…"}
            disabled={loadingContent}
            className="w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={saveContent}
              disabled={savingContent || loadingContent}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              {savingContent ? "Saving…" : "Save content"}
            </button>
            <button
              onClick={generateChunks}
              disabled={chunkBusy || loadingContent}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-accent disabled:opacity-40"
            >
              {chunkBusy ? "Generating…" : "Generate Chunks"}
            </button>
            <button
              onClick={viewChunks}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-accent"
            >
              View Chunks
            </button>
            <button
              onClick={embedChunks}
              disabled={embedBusy || loadingContent}
              className="rounded-lg border px-4 py-2 text-sm hover:bg-accent disabled:opacity-40"
            >
              {embedBusy ? "Embedding…" : "Embed Chunks"}
            </button>
          </div>

          {embedStatus ? (
            <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              Embedded {embedStatus.embedded}/{embedStatus.total} chunks · dim{" "}
              {embedStatus.dimensions}
            </p>
          ) : null}

          {chunkCount !== null ? (
            <div className="mt-4 border-t pt-4">
              <p className="mb-2 text-sm font-medium">
                {chunkCount} chunk{chunkCount === 1 ? "" : "s"}
              </p>
              <ul className="space-y-2">
                {chunks.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-lg bg-muted/40 p-2 text-xs"
                  >
                    <span className="text-muted-foreground">
                      #{c.chunkIndex}
                    </span>{" "}
                    {c.content.slice(0, 140)}
                    {c.content.length > 140 ? "…" : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Add */}
      <div className="mb-8 rounded-xl border p-4">
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center gap-2">
            <select
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as SourceType)}
              className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              {SOURCE_TYPES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button
              onClick={addDocument}
              disabled={saving || !title.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              <Plus className="size-4" /> Add document
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      {documents.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No documents yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {documents.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {d.sourceType}
                  </span>
                  <StatusBadge status={d.status} />
                </div>
                <p className="mt-1.5 truncate font-medium">{d.title}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => openDocument(d)}
                  className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent"
                >
                  Open
                </button>
                <button
                  onClick={() => removeDocument(d.id)}
                  aria-label="Delete document"
                  className="rounded-lg p-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: DocStatus }) {
  const styles: Record<DocStatus, string> = {
    active: "bg-green-600/10 text-green-600",
    processing: "bg-amber-500/15 text-amber-600",
    failed: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status]}`}>
      {status}
    </span>
  );
}
