"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bug, Download, Menu, PlusCircle } from "lucide-react";
import Sidebar from "./sidebar";
import Chat from "./chat";
import Modal from "./modal";
import ProfileMenu from "./profile-menu";
import type { BrainOption, BrainMode } from "./brain-selector";

type Conv = { id: string; title: string; updatedAt?: string | null };
type Proj = { id: string; name: string; isSystem?: boolean };
type LevelOption = {
  level: string;
  label: string;
  enabled?: boolean;
  comingSoon?: boolean;
  available?: boolean;
};
export type MsgMeta = {
  provider?: string;
  model?: string;
  requestedModelId?: string | null;
  fallbackFrom?: string | null;
  attempts?: number | null;
  latencyMs?: number | null;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    approx?: boolean;
  } | null;
  brainId?: string | null;
  brainSlug?: string | null;
  brainMode?: string | null;
  multiBrains?: string[] | null;
  brainConfidence?: number | null;
  brainMatched?: string[] | null;
  brainReason?: string | null;
  knowledgeCount?: number | null;
  memoryCount?: number | null;
  retrievalMethod?: string | null;
  sources?: string[] | null;
  referenceEntity?: string | null;
  referenceReason?: string | null;
};
export type Msg = {
  id: string;
  dbId?: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  error?: boolean;
  retryText?: string;
  meta?: MsgMeta | null;
  streaming?: boolean;
  isNew?: boolean;
  /** Phase 7 — clarification quick-action entity options, when the reply is a clarify. */
  clarify?: string[] | null;
  /** Phase 5 — feedback the user gave on this assistant message. */
  feedback?: "helpful" | "not_helpful" | null;
};
type User = { name?: string | null; email?: string | null; image?: string | null };

const CHAT_TIMEOUT_MS = 60_000;
const uuid = () => crypto.randomUUID();

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ChatApp({
  user,
  initialConversations,
  levels: initialLevels,
  isAdmin,
  openConversationId,
}: {
  user: User;
  initialConversations: Conv[];
  levels: LevelOption[];
  isAdmin: boolean;
  openConversationId?: string;
}) {
  const [conversations, setConversations] = useState<Conv[]>(initialConversations);
  const [activeId, setActiveId] = useState<string | null>(
    (openConversationId &&
      initialConversations.some((c) => c.id === openConversationId)
      ? openConversationId
      : initialConversations[0]?.id) ?? null,
  );
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<Proj[]>([]);

  const [levels, setLevels] = useState<LevelOption[]>(initialLevels);
  const [level, setLevel] = useState<string>(
    initialLevels.find((l) => l.available)?.level ?? "medium",
  );
  const [debug, setDebug] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Synchronous concurrency guard — React state lags a frame, so a ref is what
  // actually blocks a second send while a response is still generating.
  const generatingRef = useRef(false);

  // Refs for keyboard shortcuts
  const sidebarSearchRef = useRef<HTMLInputElement | null>(null);

  // Export dropdown state
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Brain system state
  const [brains, setBrains] = useState<BrainOption[]>([]);
  const [selectedBrainId, setSelectedBrainId] = useState<string | null>(null);
  // First-time users default to Smart; returning users are restored on mount.
  const [brainMode, setBrainMode] = useState<BrainMode>("smart");

  // Delete confirmation modal
  const [pendingDelete, setPendingDelete] = useState<Conv | null>(null);

  // Toast
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  }, []);

  function changeLevel(newLevel: string) {
    setLevel(newLevel);
    try { localStorage.setItem("hh-level", newLevel); } catch { /**/ }
  }

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;

      if (e.key === "k") {
        e.preventDefault();
        setSidebarOpen(true);
        // rAF x2 to wait for sidebar slide-in before focusing
        requestAnimationFrame(() => requestAnimationFrame(() => {
          sidebarSearchRef.current?.focus();
        }));
      } else if (e.key === "n") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        void newChat();
      } else if (e.key === "b") {
        e.preventDefault();
        setSidebarOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore level from localStorage after mount
  useEffect(() => {
    try {
      const savedLevel = localStorage.getItem("hh-level");
      if (savedLevel && initialLevels.some((l) => l.level === savedLevel && l.available)) {
        setLevel(savedLevel);
      }
    } catch { /**/ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore brain mode (Smart/Manual) after mount; first-time users stay Smart.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("hh-brain-mode");
      if (saved === "smart" || saved === "manual") setBrainMode(saved);
    } catch { /**/ }
  }, []);

  useEffect(() => {
    if (activeId) void openConversation(activeId);
    void refreshLevels();
    void loadProjects();
    void loadBrains();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadBrains() {
    try {
      const res = await fetch("/api/brains");
      if (!res.ok) return;
      const data = await res.json();
      const loaded: BrainOption[] = (data.brains ?? []).map(
        (b: { id: string; name: string; slug: string; icon: string; color: string }) => ({
          id: b.id, name: b.name, slug: b.slug, icon: b.icon, color: b.color,
        }),
      );
      setBrains(loaded);
      try {
        const savedBrainId = localStorage.getItem("hh-brain-id");
        const match = savedBrainId && loaded.find((b) => b.id === savedBrainId);
        if (match) { setSelectedBrainId(match.id); return; }
      } catch { /**/ }
      const hajiCore = loaded.find((b) => b.slug === "haji-core");
      if (hajiCore) setSelectedBrainId(hajiCore.id);
    } catch { /**/ }
  }

  async function loadProjects() {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data = await res.json();
      setProjects(
        (data.projects ?? []).map((p: { id: string; name: string; isSystem?: boolean }) => ({
          id: p.id, name: p.name, isSystem: p.isSystem ?? false,
        })),
      );
    } catch { /**/ }
  }

  const newProject = useCallback(async () => {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.project) {
      setProjects((p) => [{ id: data.project.id, name: data.project.name }, ...p]);
    }
  }, []);

  async function refreshLevels() {
    try {
      const res = await fetch("/api/models");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.levels) && data.levels.length > 0) {
        setLevels(data.levels);
        setLevel((cur) => {
          const stillOk = data.levels.find((l: LevelOption) => l.level === cur && l.available);
          if (stillOk) return cur;
          return data.default ?? data.levels.find((l: LevelOption) => l.available)?.level ?? cur;
        });
      }
    } catch { /**/ }
  }

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      const data = await res.json();
      const loaded: Msg[] = (data.messages ?? []).map(
        (m: { id: string; role: Msg["role"]; content: string }) => ({
          id: m.id, dbId: m.id, role: m.role, content: m.content,
          // isNew intentionally omitted → no animation on loaded messages
        }),
      );
      setMessages(loaded);
    } finally {
      setLoading(false);
    }
  }, []);

  const newChat = useCallback(async () => {
    const res = await fetch("/api/conversations", { method: "POST" });
    const convo: Conv = await res.json();
    setConversations((p) => [convo, ...p]);
    setActiveId(convo.id);
    setMessages([]);
    setSidebarOpen(false);
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    await fetch(`/api/conversations/${id}`, { method: "DELETE" });
    setConversations((p) => p.filter((c) => c.id !== id));
    if (activeId === id) { setActiveId(null); setMessages([]); }
  }

  const handleRename = useCallback(async (id: string, title: string) => {
    if (!title.trim()) return;
    setConversations((p) => p.map((c) => (c.id === id ? { ...c, title } : c)));
    await fetch(`/api/conversations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  }, []);

  function exportConversation(format: "md" | "txt" | "pdf") {
    if (!activeId || messages.length === 0) return;
    setIsExportOpen(false);
    const title = conversations.find((c) => c.id === activeId)?.title ?? "Conversation";
    const slug = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);

    if (format === "md") {
      const lines = [`# ${title}\n`];
      for (const m of messages) {
        if (m.role === "user") lines.push(`**You:** ${m.content}\n`);
        else if (m.role === "assistant") lines.push(`**HajiHaz:** ${m.content}\n`);
      }
      downloadBlob(new Blob([lines.join("\n")], { type: "text/markdown" }), `${slug}.md`);
    } else if (format === "txt") {
      const lines = [`${title}\n${"=".repeat(title.length)}\n`];
      for (const m of messages) {
        if (m.role === "user") lines.push(`You: ${m.content}\n`);
        else if (m.role === "assistant") lines.push(`HajiHaz: ${m.content}\n`);
      }
      downloadBlob(new Blob([lines.join("\n")], { type: "text/plain" }), `${slug}.txt`);
    } else if (format === "pdf") {
      const body = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) =>
          m.role === "user"
            ? `<div class="msg user"><strong>You</strong><p>${escHtml(m.content)}</p></div>`
            : `<div class="msg ai"><strong>HajiHaz</strong><p>${escHtml(m.content)}</p></div>`,
        )
        .join("");
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;padding:32px;color:#111}
h1{font-size:1.4rem;margin-bottom:24px;border-bottom:1px solid #e5e7eb;padding-bottom:12px}
.msg{margin:16px 0;padding:14px 16px;border-radius:10px;line-height:1.6}
.msg strong{display:block;font-size:0.75rem;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;opacity:0.6}
.msg p{margin:0;white-space:pre-wrap}.user{background:#eff6ff}.ai{background:#f9fafb}
</style></head><body><h1>${escHtml(title)}</h1>${body}</body></html>`;
      const win = window.open("", "_blank");
      if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 250); }
    }
  }

  /* ── message actions ── */

  const copyMessage = useCallback(async (text: string) => {
    try { await navigator.clipboard.writeText(text); notify("Copied to clipboard"); }
    catch { notify("Copy failed"); }
  }, [notify]);

  const deleteMessage = useCallback((msg: Msg) => {
    setMessages((p) => p.filter((m) => m.id !== msg.id));
    if (msg.dbId) void fetch(`/api/messages/${msg.dbId}`, { method: "DELETE" }).catch(() => {});
  }, []);

  function retryMessage(msg: Msg) {
    if (msg.error) {
      setMessages((p) => p.filter((m) => m.id !== msg.id));
      void runChat(msg.retryText ?? "", {});
      return;
    }
    const idx = messages.findIndex((m) => m.id === msg.id);
    if (idx < 0) return;
    let priorText = "";
    for (let i = idx - 1; i >= 0; i--) {
      if (messages[i].role === "user") { priorText = messages[i].content; break; }
    }
    if (!priorText) return;
    if (msg.dbId) void fetch(`/api/messages/${msg.dbId}`, { method: "DELETE" }).catch(() => {});
    setMessages((p) => p.filter((m) => m.id !== msg.id));
    void runChat(priorText, { regenerate: true });
  }

  function send() {
    const text = input.trim();
    if (!text || generatingRef.current) return; // block duplicate/concurrent sends
    setInput("");
    const localId = uuid();
    setMessages((p) => [...p, { id: localId, role: "user", content: text, isNew: true }]);
    void runChat(text, { userLocalId: localId });
  }

  // Send an explicit prompt (empty-state example prompts + clarification chips).
  function sendPrompt(text: string) {
    const t = text.trim();
    if (!t || generatingRef.current) return;
    const localId = uuid();
    setMessages((p) => [...p, { id: localId, role: "user", content: t, isNew: true }]);
    void runChat(t, { userLocalId: localId });
  }

  // Phase 5 — record 👍/👎 on an assistant message (optimistic).
  async function sendFeedback(msg: Msg, value: "helpful" | "not_helpful") {
    if (!msg.dbId) return;
    setMessages((p) => p.map((m) => (m.id === msg.id ? { ...m, feedback: value } : m)));
    await fetch("/api/chat/feedback", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: msg.dbId, value }),
    }).catch(() => {});
  }

  async function runChat(text: string, opts: { userLocalId?: string; regenerate?: boolean }) {
    if (generatingRef.current) return; // never run two generations at once
    generatingRef.current = true;
    setSending(true);
    setIsGenerating(true);

    let convId = activeId;
    const streamMsgId = uuid();
    let addedStreamMsg = false;
    let assistantShown = false; // ensures the user message gets exactly one reply

    try {
      if (!convId) {
        const res = await fetch("/api/conversations", { method: "POST" });
        const convo = await res.json();
        setConversations((p) => [{ id: convo.id, title: convo.title }, ...p]);
        convId = convo.id;
        setActiveId(convId);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: convId,
            message: text,
            level,
            regenerate: opts.regenerate ?? false,
            brainId: brainMode === "manual" ? selectedBrainId : null,
            brainMode,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.t === "chunk") {
              if (!addedStreamMsg) {
                setSending(false);
                const chunk = typeof event.text === "string" ? event.text : "";
                setMessages((p) => [
                  ...p,
                  { id: streamMsgId, role: "assistant" as const, content: chunk, streaming: true, isNew: true },
                ]);
                addedStreamMsg = true;
                assistantShown = true;
              } else {
                setMessages((p) =>
                  p.map((m) =>
                    m.id === streamMsgId ? { ...m, content: m.content + event.text } : m,
                  ),
                );
              }
            } else if (event.t === "done") {
              if (opts.userLocalId && event.userMessageId) {
                setMessages((p) =>
                  p.map((m) => m.id === opts.userLocalId ? { ...m, dbId: event.userMessageId } : m),
                );
              }
              setMessages((p) =>
                p.map((m) =>
                  m.id === streamMsgId
                    ? { ...m, dbId: event.assistantMessageId ?? null, meta: event.meta ?? null, streaming: false, clarify: event.clarify?.options ?? null }
                    : m,
                ),
              );
              if (event.title && convId) {
                setConversations((p) =>
                  p.map((c) => (c.id === convId ? { ...c, title: event.title } : c)),
                );
              }
            } else if (event.t === "error") {
              setSending(false);
              assistantShown = true;
              setMessages((p) => [
                ...p,
                { id: uuid(), role: "assistant" as const, content: "⚠️ Something went wrong. Please try again.", error: true, retryText: text, isNew: true },
              ]);
            }
          } catch { /**/ }
        }
      }
    } catch (err) {
      const aborted = (err as { name?: string })?.name === "AbortError";
      assistantShown = true;
      setMessages((p) => [
        ...p,
        {
          id: uuid(), role: "assistant",
          content: aborted
            ? "⏱️ The request timed out. Please try again."
            : "⚠️ Couldn't reach HajiHaz. Check your connection and try again.",
          error: true, retryText: text, isNew: true,
        },
      ]);
    } finally {
      generatingRef.current = false;
      setSending(false);
      setIsGenerating(false);
      abortRef.current = null;
      if (addedStreamMsg) {
        setMessages((p) =>
          p.map((m) => (m.id === streamMsgId && m.streaming ? { ...m, streaming: false } : m)),
        );
      } else if (!assistantShown) {
        // Stream ended with no content and no error → guarantee exactly one reply.
        setMessages((p) => [
          ...p,
          { id: uuid(), role: "assistant", content: "⚠️ No response received. Please try again.", error: true, retryText: text, isNew: true },
        ]);
      }
    }
  }

  const handleSelectBrain = useCallback((id: string | null) => {
    setSelectedBrainId(id);
    try { if (id) localStorage.setItem("hh-brain-id", id); else localStorage.removeItem("hh-brain-id"); } catch { /**/ }
  }, []);

  const handleSetBrainMode = useCallback((mode: BrainMode) => {
    setBrainMode(mode);
    try { localStorage.setItem("hh-brain-mode", mode); } catch { /**/ }
  }, []);

  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-dvh overflow-hidden">
      <Sidebar
        conversations={conversations}
        projects={projects}
        brains={brains}
        activeId={activeId}
        onSelect={openConversation}
        onNew={newChat}
        onNewProject={newProject}
        onDelete={(id) => setPendingDelete(conversations.find((c) => c.id === id) ?? null)}
        onRename={handleRename}
        onToast={notify}
        open={sidebarOpen}
        onClose={handleSidebarClose}
        searchRef={sidebarSearchRef}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-3 py-2.5 sm:px-4 sm:py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open conversations"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-accent md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <button
            type="button"
            onClick={newChat}
            aria-label="New chat"
            className="flex size-10 shrink-0 items-center justify-center rounded-lg hover:bg-accent md:hidden"
          >
            <PlusCircle className="size-5" />
          </button>

          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="size-7 shrink-0 rounded-full" />
            ) : null}
            <div className="min-w-0 text-sm">
              <div className="truncate font-medium leading-tight">{user.name}</div>
              <div className="truncate text-xs leading-tight text-muted-foreground">{user.email}</div>
            </div>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-2">
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setDebug((d) => !d)}
                aria-label="Toggle debug mode"
                aria-pressed={debug}
                title="Debug mode (admin)"
                className={`flex size-10 shrink-0 items-center justify-center rounded-lg border sm:size-9 ${
                  debug ? "bg-accent text-foreground" : "text-muted-foreground"
                }`}
              >
                <Bug className="size-4" />
              </button>
            ) : null}

            {/* Export button — only when there's a conversation with messages */}
            {activeId && messages.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsExportOpen((o) => !o)}
                  aria-label="Export conversation"
                  title="Export conversation"
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg border text-muted-foreground hover:bg-accent hover:text-foreground sm:size-9"
                >
                  <Download className="size-4" />
                </button>
                {isExportOpen ? (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      aria-hidden="true"
                      onClick={() => setIsExportOpen(false)}
                    />
                    <div className="absolute right-0 z-50 mt-1.5 w-44 overflow-hidden rounded-lg border bg-popover py-1 shadow-lg">
                      {(["md", "txt", "pdf"] as const).map((fmt) => (
                        <button
                          key={fmt}
                          onClick={() => exportConversation(fmt)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          {fmt === "md" && "Markdown (.md)"}
                          {fmt === "txt" && "Plain Text (.txt)"}
                          {fmt === "pdf" && "PDF (print)"}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            <label className="sr-only" htmlFor="level-select">Response quality level</label>
            <select
              id="level-select"
              value={level}
              onChange={(e) => changeLevel(e.target.value)}
              className="min-w-0 rounded-lg border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-ring sm:px-3 sm:py-1.5"
            >
              {levels.map((l) => (
                <option key={l.level} value={l.level} disabled={!l.available}>
                  {l.label}{l.comingSoon ? " (Coming Soon)" : ""}
                </option>
              ))}
            </select>

            <ProfileMenu name={user.name} image={user.image} />
          </div>
        </header>

        <Chat
          messages={messages}
          conversationId={activeId}
          input={input}
          setInput={setInput}
          onSend={send}
          onSendPrompt={sendPrompt}
          onFeedback={sendFeedback}
          onCopy={copyMessage}
          onDelete={deleteMessage}
          onRetry={retryMessage}
          onStop={stopGeneration}
          sending={sending}
          isGenerating={isGenerating}
          loading={loading}
          isAdmin={isAdmin}
          debug={debug}
          brains={brains}
          selectedBrainId={selectedBrainId}
          brainMode={brainMode}
          onSelectBrain={handleSelectBrain}
          onSetBrainMode={handleSetBrainMode}
        />
      </div>

      {/* Delete confirmation */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete conversation?"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          "{pendingDelete?.title}" and all its messages will be permanently removed. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => setPendingDelete(null)}
            className="min-h-10 rounded-lg border px-4 text-sm hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={confirmDelete}
            className="min-h-10 rounded-lg bg-destructive px-4 text-sm font-medium text-white hover:opacity-90"
          >
            Delete
          </button>
        </div>
      </Modal>

      {/* Toast */}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
