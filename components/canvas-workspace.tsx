"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, FileCode2, Maximize2, Minimize2, X } from "lucide-react";

type Props = {
  open: boolean;
  conversationId: string | null;
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  onClose: () => void;
};

const STORAGE_PREFIX = "hh-canvas:";
function defaultArtifact(messages: Props["messages"]) {
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  return {
    title: "Untitled artifact",
    content: last?.content ?? "",
  };
}

export default function CanvasWorkspace({
  open,
  conversationId,
  messages,
  onClose,
}: Props) {
  const initial = useMemo(() => defaultArtifact(messages), [messages]);
  const [title, setTitle] = useState(initial.title);
  const [content, setContent] = useState(initial.content);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    const key = conversationId ? STORAGE_PREFIX + conversationId : "";
    if (!key) {
      setTitle(initial.title);
      setContent(initial.content);
      return;
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as { title?: string; content?: string };
        setTitle(parsed.title || initial.title);
        setContent(parsed.content ?? initial.content);
      } else {
        setTitle(initial.title);
        setContent(initial.content);
      }
    } catch {
      setTitle(initial.title);
      setContent(initial.content);
    }
    setSaved(false);
  }, [open, conversationId, initial.title, initial.content]);

  function save() {
    if (!conversationId) return;
    try {
      localStorage.setItem(
        STORAGE_PREFIX + conversationId,
        JSON.stringify({ title: title.trim() || "Untitled artifact", content }),
      );
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1400);
    } catch {
      setSaved(false);
    }
  }

  function resetFromReply() {
    const next = defaultArtifact(messages);
    setTitle(next.title);
    setContent(next.content);
  }

  function download() {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = (title.trim() || "artifact").replace(/[^a-z0-9_-]+/gi, "-") + ".txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1000);
    } catch {}
  }

  if (!open) return null;

  return (
    <div className={expanded ? "fixed inset-0 z-50 flex bg-background" : "fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl bg-background shadow-2xl"}>
      <div className="flex min-w-0 flex-1 flex-col border-l">
        <header className="flex items-center gap-2 border-b px-3 py-2.5">
          <FileCode2 className="size-4 text-muted-foreground" />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Artifact title"
            className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
          />
          <button type="button" onClick={save} title="Save artifact" aria-label="Save artifact" className="rounded-lg p-2 hover:bg-accent">
            {saved ? <Check className="size-4" /> : <span className="text-xs font-medium">Save</span>}
          </button>
          <button type="button" onClick={resetFromReply} title="Use latest reply" aria-label="Use latest reply" className="rounded-lg p-2 text-xs hover:bg-accent">Reset</button>
          <button type="button" onClick={copy} title="Copy artifact" aria-label="Copy artifact" className="rounded-lg p-2 hover:bg-accent"><Copy className="size-4" /></button>
          <button type="button" onClick={download} title="Download artifact" aria-label="Download artifact" className="rounded-lg p-2 hover:bg-accent"><Download className="size-4" /></button>
          <button type="button" onClick={() => setExpanded((v) => !v)} title={expanded ? "Collapse canvas" : "Expand canvas"} aria-label={expanded ? "Collapse canvas" : "Expand canvas"} className="rounded-lg p-2 hover:bg-accent">
            {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <button type="button" onClick={onClose} title="Close canvas" aria-label="Close canvas" className="rounded-lg p-2 hover:bg-accent"><X className="size-4" /></button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b px-3 py-2 text-[11px] text-muted-foreground">Editable artifact · saved per conversation in this browser</div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck
            aria-label="Canvas editor"
            className="min-h-0 flex-1 resize-none bg-background px-4 py-4 font-mono text-sm leading-6 outline-none"
          />
        </div>
      </div>
    </div>
  );
}
