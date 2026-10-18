"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Bug, Download, Folder, GitFork, Menu, PlusCircle, Share2, Paperclip, X, PanelLeftClose, PanelLeftOpen, MoreHorizontal, FileText, SquarePen } from "lucide-react";
import Sidebar from "./sidebar";
import Chat from "./chat";
import Modal from "./modal";
import ProfileMenu from "./profile-menu";
import NotificationCenter from "./notification-center";
import GuestAuthGate from "./guest-auth-gate";

const ImageGenerator = dynamic(() => import("./image-generator"), { ssr: false });
const CanvasWorkspace = dynamic(() => import("./canvas-workspace"), { ssr: false });
const FileLibrary = dynamic(() => import("./file-library"), { ssr: false });

type Conv = { id: string; title: string; projectId?: string | null; updatedAt?: string | null; archived?: boolean; pinned?: boolean; intelligenceLevel?: string };
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
  sourceLinks?: Array<{
    title: string;
    url: string;
    host?: string | null;
    tier?: number | null;
    kind?: "search" | "website";
  }> | null;
  referenceEntity?: string | null;
  referenceReason?: string | null;
  research?: {
    depth?: "quick" | "smart" | "research";
    queries?: string[];
    reason?: string | null;
    evidenceCount?: number;
    provider?: string | null;
    sources?: Array<{
      title: string;
      url: string;
      host?: string | null;
      tier?: number | null;
      snippet?: string;
    }>;
  } | null;
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
type User = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

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
  initialProjects,
  isAdmin,
  isGuest,
  openConversationId,
}: {
  user: User;
  initialConversations: Conv[];
  initialProjects: Proj[];
  levels: LevelOption[];
  isAdmin: boolean;
  isGuest: boolean;
  openConversationId?: string;
}) {
  const [conversations, setConversations] =
    useState<Conv[]>(initialConversations);
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
  const [clientReady, setClientReady] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [projects, setProjects] = useState<Proj[]>(initialProjects);
  const projectLoadSeqRef = useRef(0);
  // Prevent delayed chat history responses from replacing a newly opened chat.
  const conversationLoadSeqRef = useRef(0);
  const activeConversation = activeId ? conversations.find((c) => c.id === activeId) : null;
  const activeProject = activeConversation?.projectId
    ? projects.find((p) => p.id === activeConversation.projectId)
    : null;

  const [levels, setLevels] = useState<LevelOption[]>(initialLevels);
  const [level, setLevel] = useState<string>(
    initialLevels.find((l) => l.available)?.level ?? "medium",
  );
  const [debug, setDebug] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageGeneratorOpen, setImageGeneratorOpen] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [fileLibraryOpen, setFileLibraryOpen] = useState(false);
  const [guestGateOpen, setGuestGateOpen] = useState(false);
  const [attachments, setAttachments] = useState<Array<{id:string;documentId:string;title:string;originalName?:string|null;mimeType?:string|null;byteSize?:number|null}>>([]);
  const abortRef = useRef<AbortController | null>(null);
  // Synchronous concurrency guard — React state lags a frame, so a ref is what
  // actually blocks a second send while a response is still generating.
  const generatingRef = useRef(false);

  // Refs for keyboard shortcuts
  const sidebarSearchRef = useRef<HTMLInputElement | null>(null);

  // Export dropdown state

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
    if (activeId) void fetch(`/api/conversations/${activeId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intelligenceLevel: newLevel }) });
    try {
      localStorage.setItem("hh-level", newLevel);
    } catch {
      /**/
    }
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
        setDesktopSidebarOpen(true);
        // rAF x2 to wait for sidebar slide-in before focusing
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            sidebarSearchRef.current?.focus();
          }),
        );
      } else if (e.key === "n") {
        const tag = (e.target as HTMLElement).tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        e.preventDefault();
        void newChat();
      } else if (e.key === "b") {
        e.preventDefault();
        if (window.innerWidth >= 768) {
          setDesktopSidebarOpen((current) => {
            const next = !current;
            try { localStorage.setItem("hh-desktop-sidebar", next ? "open" : "closed"); } catch { /* optional */ }
            return next;
          });
        } else setSidebarOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { if (localStorage.getItem("hh-desktop-sidebar") === "closed") setDesktopSidebarOpen(false); } catch { /* private browsing */ }
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMoreOpen(false); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [moreOpen]);

  const toggleDesktopSidebar = () => setDesktopSidebarOpen((current) => {
    const next = !current;
    try { localStorage.setItem("hh-desktop-sidebar", next ? "open" : "closed"); } catch { /* optional */ }
    return next;
  });

  useEffect(() => { setClientReady(true); }, []);

  // Keep the selected chat in the address bar so refreshes and shared project
  // search links restore the correct conversation, without a full navigation.
  useEffect(() => {
    if (!clientReady) return;
    const url = new URL(window.location.href);
    if (activeId) url.searchParams.set("c", activeId);
    else url.searchParams.delete("c");
    if (url.href !== window.location.href) {
      // Preserve Next.js router state rather than replacing it with null.
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }, [activeId, clientReady]);

  // Restore level from localStorage after mount
  useEffect(() => {
    try {
      const savedLevel = localStorage.getItem("hh-level");
      if (
        savedLevel &&
        initialLevels.some((l) => l.level === savedLevel && l.available)
      ) {
        setLevel(savedLevel);
      }
    } catch {
      /**/
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeId) void openConversation(activeId);
    void refreshLevels();
    void loadProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep project names/context fresh when returning from the Projects dashboard
  // or a project workspace in another tab/window.
  useEffect(() => {
    const refreshProjectsOnReturn = () => {
      void loadProjects();
    };
    window.addEventListener("focus", refreshProjectsOnReturn);
    document.addEventListener("visibilitychange", refreshProjectsOnReturn);
    return () => {
      window.removeEventListener("focus", refreshProjectsOnReturn);
      document.removeEventListener("visibilitychange", refreshProjectsOnReturn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProjects() {
    const requestSeq = ++projectLoadSeqRef.current;
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok || requestSeq !== projectLoadSeqRef.current) return;
      const data = await res.json();
      if (requestSeq !== projectLoadSeqRef.current) return;
      setProjects(
        (data.projects ?? []).map(
          (p: { id: string; name: string; isSystem?: boolean }) => ({
            id: p.id,
            name: p.name,
            isSystem: p.isSystem ?? false,
          }),
        ),
      );
    } catch {
      /**/
    }
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
      setProjects((p) => [
        { id: data.project.id, name: data.project.name },
        ...p,
      ]);
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
          const stillOk = data.levels.find(
            (l: LevelOption) => l.level === cur && l.available,
          );
          if (stillOk) return cur;
          return (
            data.default ??
            data.levels.find((l: LevelOption) => l.available)?.level ??
            cur
          );
        });
      }
    } catch {
      /**/
    }
  }

  const openConversation = useCallback(async (id: string) => {
    const requestId = ++conversationLoadSeqRef.current;
    setActiveId(id);
    setSidebarOpen(false);
    setLoading(true);
    setMessages([]);
    setAttachments([]);
    try {
      const res = await fetch(`/api/conversations/${id}/messages`);
      if (!res.ok || requestId !== conversationLoadSeqRef.current) return;
      const data = await res.json();
      if (requestId !== conversationLoadSeqRef.current) return;
      const loaded: Msg[] = (data.messages ?? []).map(
        (m: { id: string; role: Msg["role"]; content: string; metadata?: MsgMeta | null }) => ({
          id: m.id,
          dbId: m.id,
          role: m.role,
          content: m.content,
          meta: m.metadata ?? null,
          // isNew intentionally omitted → no animation on loaded messages
        }),
      );
      setMessages(loaded);
      const current = conversations.find(c => c.id === id);
      if (current?.intelligenceLevel && initialLevels.some(l => l.level === current.intelligenceLevel && l.available)) setLevel(current.intelligenceLevel);
      const ar = await fetch(`/api/conversations/${id}/attachments`);
      if (ar.ok) {
        const data = await ar.json();
        if (requestId === conversationLoadSeqRef.current) setAttachments(data.attachments ?? []);
      }
    } finally {
      if (requestId === conversationLoadSeqRef.current) setLoading(false);
    }
  }, []);

  const newChat = useCallback(async (projectId?: string | null) => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: projectId ? { "Content-Type": "application/json" } : undefined,
        body: projectId ? JSON.stringify({ projectId }) : undefined,
      });
      if (!res.ok) {
        notify("Couldn't create a new chat");
        return;
      }
      const convo: Conv = await res.json();
      // A pending old-history fetch must not overwrite this fresh workspace.
      conversationLoadSeqRef.current++;
      setLoading(false);
      setConversations((p) => [convo, ...p]);
      setActiveId(convo.id);
      setMessages([]);
      setAttachments([]);
      setSidebarOpen(false);
    } catch {
      notify("Couldn't create a new chat");
    }
  }, [notify]);

  const newChatInProject = useCallback(
    async (projectId: string) => {
      await newChat(projectId);
    },
    [newChat],
  );

  const switchProject = useCallback(
    async (projectId: string) => {
      if (!projectId) {
        const globalChat = conversations.find((c) => !c.projectId);
        if (globalChat) {
          await openConversation(globalChat.id);
        } else {
          await newChat(null);
        }
        return;
      }
      const projectChat = conversations.find((c) => c.projectId === projectId);
      if (projectChat) {
        await openConversation(projectChat.id);
      } else {
        await newChat(projectId);
      }
    },
    [conversations, newChat, openConversation],
  );

  async function confirmDelete() {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (!res.ok) {
        notify("Couldn't delete the chat");
        return;
      }
      setConversations((p) => p.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
      }
    } catch {
      notify("Couldn't delete the chat");
    }
  }

  const handleRename = useCallback(
    async (id: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;
      const previous = conversations.find((c) => c.id === id)?.title;
      setConversations((p) =>
        p.map((c) => (c.id === id ? { ...c, title: nextTitle } : c)),
      );
      try {
        const res = await fetch(`/api/conversations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle }),
        });
        if (!res.ok) {
          if (previous !== undefined) {
            setConversations((p) =>
              p.map((c) => (c.id === id ? { ...c, title: previous } : c)),
            );
          }
          notify("Couldn't rename the chat");
        }
      } catch {
        if (previous !== undefined) {
          setConversations((p) =>
            p.map((c) => (c.id === id ? { ...c, title: previous } : c)),
          );
        }
        notify("Couldn't rename the chat");
      }
    },
    [conversations, notify],
  );

  const branchMessage = useCallback(async (msg: Msg) => {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/conversations/${activeId}/branch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId: msg.id }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) { notify(data?.error ?? "Couldn't branch from this message"); return; }
      setConversations((p) => [{ id: data.id, title: data.title, projectId: data.projectId }, ...p]);
      await openConversation(data.id);
      notify("Message branch created");
    } catch { notify("Couldn't branch from this message"); }
  }, [activeId, notify, openConversation]);

  const branchConversation = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/conversations/${activeId}/branch`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) { notify(data?.error ?? "Couldn't branch the conversation"); return; }
      setConversations((p) => [{ id: data.id, title: data.title, projectId: data.projectId }, ...p]);
      await openConversation(data.id);
      notify("Conversation branched");
    } catch { notify("Couldn't branch the conversation"); }
  }, [activeId, notify, openConversation]);

  const shareConversation = useCallback(async () => {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/conversations/${activeId}/share`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) { notify(data?.error ?? "Couldn't create share link"); return; }
      const url = new URL(data.url, window.location.origin).toString();
      await navigator.clipboard.writeText(url);
      notify("Share link copied");
    } catch { notify("Couldn't create share link"); }
  }, [activeId, notify]);

  function exportConversation(format: "md" | "txt" | "pdf") {
    if (!activeId || messages.length === 0) return;
    const title =
      conversations.find((c) => c.id === activeId)?.title ?? "Conversation";
    const slug = title
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 60);

    if (format === "md") {
      const lines = [`# ${title}\n`];
      for (const m of messages) {
        if (m.role === "user") lines.push(`**You:** ${m.content}\n`);
        else if (m.role === "assistant")
          lines.push(`**HajiHaz:** ${m.content}\n`);
      }
      downloadBlob(
        new Blob([lines.join("\n")], { type: "text/markdown" }),
        `${slug}.md`,
      );
    } else if (format === "txt") {
      const lines = [`${title}\n${"=".repeat(title.length)}\n`];
      for (const m of messages) {
        if (m.role === "user") lines.push(`You: ${m.content}\n`);
        else if (m.role === "assistant") lines.push(`HajiHaz: ${m.content}\n`);
      }
      downloadBlob(
        new Blob([lines.join("\n")], { type: "text/plain" }),
        `${slug}.txt`,
      );
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
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 250);
      }
    }
  }

  /* ── message actions ── */

  const archiveConversation = useCallback(async (id: string, archived: boolean) => {
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived }) });
      if (!res.ok) { notify("Couldn't update the chat"); return; }
      if (archived) {
        setConversations((p) => p.filter((c) => c.id !== id));
        if (activeId === id) { setActiveId(null); setMessages([]); }
      } else {
        const list = await fetch("/api/conversations").then((r) => r.ok ? r.json() : null).catch(() => null);
        if (Array.isArray(list?.conversations)) setConversations(list.conversations);
      }
      notify(archived ? "Chat archived" : "Chat restored");
    } catch { notify("Couldn't update the chat"); }
  }, [activeId, notify]);

  const copyMessage = useCallback(
    async (text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        notify("Copied to clipboard");
      } catch {
        notify("Copy failed");
      }
    },
    [notify],
  );

  const deleteMessage = useCallback(
    async (msg: Msg) => {
      if (!msg.dbId) {
        setMessages((p) => p.filter((m) => m.id !== msg.id));
        return;
      }
      try {
        const res = await fetch(`/api/messages/${msg.dbId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          notify("Couldn't delete the message");
          return;
        }
        setMessages((p) => p.filter((m) => m.id !== msg.id));
      } catch {
        notify("Couldn't delete the message");
      }
    },
    [notify],
  );

  const editMessage = useCallback(async (msg: Msg) => {
    if (msg.role !== "user" || !msg.dbId || generatingRef.current) return;
    const next = window.prompt("Edit your message", msg.content);
    if (next === null || !next.trim() || next.trim() === msg.content.trim()) return;
    try {
      const res = await fetch(`/api/messages/${msg.dbId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: next.trim() }) });
      if (!res.ok) { notify("Couldn't edit the message"); return; }
      const idx = messages.findIndex((m) => m.id === msg.id);
      if (idx < 0) return;
      setMessages((p) => [...p.slice(0, idx), { ...msg, content: next.trim() }]);
      void runChat(next.trim(), { regenerate: true, regenerateUserMessageId: msg.dbId });
    } catch { notify("Couldn't edit the message"); }
  }, [messages, notify]);

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
      if (messages[i].role === "user") {
        priorText = messages[i].content;
        break;
      }
    }
    if (!priorText) return;
    if (msg.dbId)
      void fetch(`/api/messages/${msg.dbId}`, { method: "DELETE" }).catch(
        () => {},
      );
    setMessages((p) => p.filter((m) => m.id !== msg.id));
    const priorUser = [...messages.slice(0, idx)]
      .reverse()
      .find((m) => m.role === "user");
    void runChat(priorText, {
      regenerate: true,
      regenerateUserMessageId: priorUser?.dbId ?? undefined,
    });
  }

  // Synchronous acceptance lets the composer keep attachments and unsent text
  // whenever the guest gate or an active generation prevents sending.
  function send(files: File[] = []): boolean {
    const text = input.trim();
    if ((!text && files.length === 0) || generatingRef.current) return false;
    if (isGuest && messages.filter((message) => message.role === "user").length >= 5) {
      setGuestGateOpen(true);
      return false;
    }
    setInput("");
    if (files.length > 0) {
      generatingRef.current = true;
      void sendAttachments(files, text);
      return true;
    }
    const localId = uuid();
    setMessages((p) => [...p, { id: localId, role: "user", content: text, isNew: true }]);
    void runChat(text, { userLocalId: localId });
    return true;
  }

  async function detachAttachment(documentId: string) {
    if (!activeId) return;
    const res = await fetch(`/api/conversations/${activeId}/attachments?documentId=${encodeURIComponent(documentId)}`, {
      method: "DELETE",
    });
    if (res.ok) setAttachments((current) => current.filter((item) => item.documentId !== documentId));
  }

  async function sendAttachments(files: File[], prompt: string) {
    files = files.slice(0, 5);
    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
    const pdfEditIntent = pdfs.length > 0 && /\b(edit|change|replace|remove|delete|add|modify|rewrite|reformat|redesign|create|make|generate|convert|fix|update)\b/i.test(prompt) && /\bpdf|document|page|pages|format|layout|name|topic|title\b/i.test(prompt);
    setSending(true);
    setIsGenerating(true);
    const localId = uuid();
    const labels = files.map((f) => `📎 ${f.name}`).join("\n");
    setMessages((p) => [...p, { id: localId, role: "user", content: `${prompt || "Please analyze the attached files."}\n\n${labels}`, isNew: true }]);
    try {
      if (pdfEditIntent && pdfs.length <= 2 && files.length === pdfs.length) {
        const form = new FormData();
        form.append("source", pdfs[0]);
        if (pdfs[1]) form.append("reference", pdfs[1]);
        form.append("prompt", prompt);
        const res = await fetch("/api/pdf/edit", { method: "POST", body: form });
        if (!res.ok) { const data = await res.json().catch(() => null); throw new Error(data?.error || `PDF generation failed (HTTP ${res.status})`); }
        const blob = await res.blob();
        if (!blob.size) throw new Error("Generated PDF was empty");
        const url = URL.createObjectURL(blob); const a = document.createElement("a");
        a.href = url; a.download = pdfs[0].name.replace(/\.pdf$/i, "") + "-hajihaz-edited.pdf"; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessages((p) => [...p, { id: uuid(), role: "assistant", content: `📄 **PDF ready.** I applied your instruction to **${pdfs[0].name}** and downloaded the generated PDF.`, isNew: true }]);
        return;
      }

      // Normal ChatGPT-style file analysis: ingest the files into the user's private knowledge scope,
      // then immediately ask HajiHaz to use those newly indexed documents.
      const images = files.filter((f) => /^image\/(jpeg|png|webp|gif)$/i.test(f.type) || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
      const docs = files.filter((f) => !images.includes(f));
      if (images.length) {
        for (const image of images.slice(0, 4)) {
          const store = new FormData(); store.append("file", image); store.append("title", image.name);
          const stored = await fetch("/api/knowledge/upload", { method: "POST", body: store });
          if (!stored.ok) { const data = await stored.json().catch(() => null); throw new Error(data?.error || `Couldn't save ${image.name}`); }
          const storedData = await stored.json();
          if (activeId && storedData.documentId) {
            const attached = await fetch(`/api/conversations/${activeId}/attachments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentId: storedData.documentId }),
            });
            const attachedData = await attached.json().catch(() => null);
            if (attached.ok && attachedData?.attachment) {
              setAttachments((current) =>
                current.some((item) => item.documentId === storedData.documentId)
                  ? current
                  : [...current, { ...attachedData.attachment, title: image.name }],
              );
            }
          }
        }
        const form = new FormData();
        for (const image of images.slice(0, 4)) form.append("image", image);
        form.append("prompt", prompt || "Analyze these images carefully and describe everything relevant.");
        const res = await fetch("/api/chat/image", { method: "POST", body: form });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || `Image analysis failed (HTTP ${res.status})`);
        setMessages((p) => [...p, { id: uuid(), role: "assistant", content: data.text, isNew: true }]);
      }
      if (docs.length) {
        const uploaded: string[] = [];
        for (const file of docs) {
          const form = new FormData();
          form.append("file", file);
          form.append("title", file.name);
          const res = await fetch("/api/knowledge/upload", { method: "POST", body: form });
          if (!res.ok) { const data = await res.json().catch(() => null); throw new Error(data?.error || `Couldn't upload ${file.name} (HTTP ${res.status})`); }
          uploaded.push(file.name);
          const uploadedData = await res.clone().json().catch(() => null);
          if (activeId && uploadedData?.documentId) {
            const attached = await fetch(`/api/conversations/${activeId}/attachments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ documentId: uploadedData.documentId }),
            });
            const attachedData = await attached.json().catch(() => null);
            if (attached.ok && attachedData?.attachment) {
              setAttachments((current) =>
                current.some((item) => item.documentId === uploadedData.documentId)
                  ? current
                  : [...current, attachedData.attachment],
              );
            }
          }
        }
        const attachmentPrompt = `${prompt || "Analyze the attached files and summarize the most important information."}\n\nUse these newly attached files as the primary source for this response: ${uploaded.join(", ")}. If the request asks for facts from the files, distinguish file content from general knowledge.`;
        // File ingestion holds the generation lock to prevent duplicate sends.
        // Hand that lock to runChat now that ingestion is complete, otherwise
        // runChat rejects its own attachment-based follow-up as a duplicate.
        generatingRef.current = false;
        await runChat(attachmentPrompt, { userLocalId: localId });
      }
    } catch (error) {
      setMessages((p) => [...p, { id: uuid(), role: "assistant", content: `⚠️ ${error instanceof Error ? error.message : "File processing failed. Please try again."}`, error: true, isNew: true }]);
    } finally {
      setSending(false); setIsGenerating(false); generatingRef.current = false;
    }
  }

  // Send an explicit prompt (empty-state example prompts + clarification chips).
  function sendPrompt(text: string) {
    const t = text.trim();
    if (!t || generatingRef.current) return;
    if (isGuest && messages.filter((message) => message.role === "user").length >= 5) {
      setGuestGateOpen(true);
      return;
    }
    const localId = uuid();
    setMessages((p) => [
      ...p,
      { id: localId, role: "user", content: t, isNew: true },
    ]);
    void runChat(t, { userLocalId: localId });
  }

  // Phase 5 — record 👍/👎 on an assistant message (optimistic).
  async function sendFeedback(msg: Msg, value: "helpful" | "not_helpful") {
    if (!msg.dbId) return;
    const previous = msg.feedback;
    setMessages((p) =>
      p.map((m) => (m.id === msg.id ? { ...m, feedback: value } : m)),
    );
    try {
      const res = await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: msg.dbId, value }),
      });
      if (!res.ok) {
        setMessages((p) =>
          p.map((m) => (m.id === msg.id ? { ...m, feedback: previous } : m)),
        );
        notify("Couldn't save feedback");
      }
    } catch {
      setMessages((p) =>
        p.map((m) => (m.id === msg.id ? { ...m, feedback: previous } : m)),
      );
      notify("Couldn't save feedback");
    }
  }

  async function runChat(
    text: string,
    opts: {
      userLocalId?: string;
      regenerate?: boolean;
      regenerateUserMessageId?: string;
    },
  ) {
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
            userMessageId: opts.regenerateUserMessageId ?? null,
            // Keep server-side automatic routing; no manual Brain UI.
            brainId: null,
            brainMode: "smart",
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        if (isGuest && res.status === 403) {
          const data = await res.clone().json().catch(() => null);
          if (data?.error === "guest_message_limit") {
            setGuestGateOpen(true);
            // Restore the unsent draft when a limit was reached in another chat
            // or browser tab after the local optimistic message was shown.
            if (opts.userLocalId) {
              setInput((current) => current || text);
              setMessages((current) => current.filter((item) => item.id !== opts.userLocalId));
            }
            return;
          }
        }
        throw new Error(`HTTP ${res.status}`);
      }
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
                  {
                    id: streamMsgId,
                    role: "assistant" as const,
                    content: chunk,
                    streaming: true,
                    isNew: true,
                  },
                ]);
                addedStreamMsg = true;
                assistantShown = true;
              } else {
                setMessages((p) =>
                  p.map((m) =>
                    m.id === streamMsgId
                      ? { ...m, content: m.content + event.text }
                      : m,
                  ),
                );
              }
            } else if (event.t === "done") {
              if (opts.userLocalId && event.userMessageId) {
                setMessages((p) =>
                  p.map((m) =>
                    m.id === opts.userLocalId
                      ? { ...m, dbId: event.userMessageId }
                      : m,
                  ),
                );
              }
              setMessages((p) =>
                p.map((m) =>
                  m.id === streamMsgId
                    ? {
                        ...m,
                        dbId: event.assistantMessageId ?? null,
                        meta: event.meta
                          ? {
                              ...event.meta,
                              sourceLinks:
                                event.sourceLinks ??
                                event.meta.sourceLinks ??
                                null,
                              research:
                                event.research ??
                                event.meta.research ??
                                null,
                            }
                          : (event.sourceLinks?.length || event.research)
                            ? {
                                sourceLinks: event.sourceLinks ?? null,
                                research: event.research ?? null,
                              }
                            : null,
                        streaming: false,
                        clarify: event.clarify?.options ?? null,
                      }
                    : m,
                ),
              );
              if (event.title && convId) {
                setConversations((p) =>
                  p.map((c) =>
                    c.id === convId ? { ...c, title: event.title } : c,
                  ),
                );
              }
            } else if (event.t === "error") {
              setSending(false);
              assistantShown = true;
              setMessages((p) => [
                ...p,
                {
                  id: uuid(),
                  role: "assistant" as const,
                  content: "⚠️ Something went wrong. Please try again.",
                  error: true,
                  retryText: text,
                  isNew: true,
                },
              ]);
            }
          } catch {
            /**/
          }
        }
      }
    } catch (err) {
      const aborted = (err as { name?: string })?.name === "AbortError";
      assistantShown = true;
      setMessages((p) => [
        ...p,
        {
          id: uuid(),
          role: "assistant",
          content: aborted
            ? "⏱️ The request timed out. Please try again."
            : "⚠️ Couldn't reach HajiHaz. Check your connection and try again.",
          error: true,
          retryText: text,
          isNew: true,
        },
      ]);
    } finally {
      generatingRef.current = false;
      setSending(false);
      setIsGenerating(false);
      abortRef.current = null;
      if (addedStreamMsg) {
        setMessages((p) =>
          p.map((m) =>
            m.id === streamMsgId && m.streaming
              ? { ...m, streaming: false }
              : m,
          ),
        );
      } else if (!assistantShown) {
        // Stream ended with no content and no error → guarantee exactly one reply.
        setMessages((p) => [
          ...p,
          {
            id: uuid(),
            role: "assistant",
            content: "⚠️ No response received. Please try again.",
            error: true,
            retryText: text,
            isNew: true,
          },
        ]);
      }
    }
  }

  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-dvh overflow-hidden" data-app-ready={clientReady ? "true" : "false"}>
      <Sidebar
        conversations={conversations}
        projects={projects}
        activeId={activeId}
        onSelect={openConversation}
        onNew={() => void newChat(activeProject?.id)}
        onNewProject={newProject}
        onNewProjectChat={newChatInProject}
        onDelete={(id) =>
          setPendingDelete(conversations.find((c) => c.id === id) ?? null)
        }
        onRename={handleRename}
        onArchive={archiveConversation}
        onToast={notify}
        open={sidebarOpen}
        desktopOpen={desktopSidebarOpen}
        onClose={handleSidebarClose}
        searchRef={sidebarSearchRef}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="pt-safe relative z-20 flex min-h-[62px] shrink-0 items-center gap-1.5 border-b border-border/60 bg-background/90 px-3 backdrop-blur-xl sm:gap-2 sm:px-5">
          <button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open conversations" title="Open conversations" className="flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-accent md:hidden"><Menu className="size-5" /></button>
          <button type="button" onClick={toggleDesktopSidebar} aria-label={desktopSidebarOpen ? "Collapse sidebar" : "Expand sidebar"} title="Toggle sidebar (⌘B)" className="hidden size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground md:flex">
            {desktopSidebarOpen ? <PanelLeftClose className="size-[19px]" /> : <PanelLeftOpen className="size-[19px]" />}
          </button>
          <button type="button" onClick={() => void newChat(activeProject?.id)} title="New chat" aria-label="New chat" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"><SquarePen className="size-[19px]" /></button>
          <div className="ml-1 flex min-w-0 items-center gap-2">
            <span className="truncate text-[15px] font-semibold tracking-tight">HajiHaz <span className="text-muted-foreground">AI</span></span>
            <label className="sr-only" htmlFor="level-select">Response quality level</label>
            <select id="level-select" value={level} onChange={(event) => changeLevel(event.target.value)} className="min-w-0 max-w-[112px] cursor-pointer rounded-lg border border-transparent bg-muted/60 px-2 py-1.5 text-xs font-medium text-muted-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:max-w-[160px]">
              {levels.map((option) => <option key={option.level} value={option.level} disabled={!option.available}>{option.label}{option.comingSoon ? " (Soon)" : ""}</option>)}
            </select>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div className="relative">
              <button type="button" onClick={() => setMoreOpen((value) => !value)} aria-label="More chat tools" aria-expanded={moreOpen} aria-haspopup="menu" title="More chat tools" className="flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground"><MoreHorizontal className="size-5" /></button>
              {moreOpen ? <>
                <button type="button" className="fixed inset-0 z-30 cursor-default" tabIndex={-1} aria-label="Close chat tools" onClick={() => setMoreOpen(false)} />
                <div role="menu" aria-label="Chat tools" className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border bg-popover p-1.5 shadow-xl">
                  <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace</p>
                  <label className="block px-3 pb-2 text-xs text-muted-foreground">Active project
                    <select value={activeProject?.id ?? ""} onChange={(event) => { void switchProject(event.target.value); setMoreOpen(false); }} aria-label="Switch project" className="mt-1 w-full rounded-lg border bg-background px-2 py-2 text-sm text-foreground">
                      <option value="">Global chat</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.isSystem ? " (Global)" : ""}</option>)}
                    </select>
                  </label>
                  {[
                    { label: "File library", icon: <Paperclip className="size-4" />, run: () => setFileLibraryOpen(true), visible: true },
                    { label: "Open canvas", icon: <FileText className="size-4" />, run: () => setCanvasOpen(true), visible: messages.length > 0 },
                    { label: "Share conversation", icon: <Share2 className="size-4" />, run: () => void shareConversation(), visible: !!activeId && messages.length > 0 },
                    { label: "Branch conversation", icon: <GitFork className="size-4" />, run: () => void branchConversation(), visible: !!activeId && messages.length > 0 },
                    { label: "Diagnostics", icon: <Bug className="size-4" />, run: () => setDebug((v) => !v), visible: isAdmin },
                  ].filter((item) => item.visible).map((item) => (
                    <button key={item.label} role="menuitem" type="button" onClick={() => { setMoreOpen(false); item.run(); }} className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-accent">{item.icon}{item.label}</button>
                  ))}
                  {activeId && messages.length > 0 && (
                    <details className="group border-t border-border/70 pt-1">
                      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-3 rounded-lg px-3 text-sm hover:bg-accent">
                        <Download className="size-4" /> Export conversation <span className="ml-auto text-xs text-muted-foreground group-open:rotate-180">⌄</span>
                      </summary>
                      <div className="pb-1 pl-7">
                        {([ ["md", "Markdown (.md)"], ["txt", "Text (.txt)"], ["pdf", "Print / PDF"] ] as const).map(([format, title]) => (
                          <button type="button" role="menuitem" key={format} onClick={() => { setMoreOpen(false); exportConversation(format); }} className="flex min-h-9 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-accent">{title}</button>
                        ))}
                      </div>
                    </details>
                  )}
                  <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">⌘K Search · ⌘B Sidebar · ⌘N New chat</p>
                </div>
              </> : null}
            </div>
            <NotificationCenter />
            <ProfileMenu name={user.name} image={user.image} />
          </div>
        </header>

        {attachments.length > 0 ? (
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b px-3 py-2 text-xs">
            {attachments.map((a) => (
              <span key={a.id} className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1">
                <Paperclip className="size-3" />
                <span className="max-w-48 truncate">{a.originalName ?? a.title}</span>
                <button type="button" onClick={() => void detachAttachment(a.documentId)} aria-label={"Detach " + (a.originalName ?? a.title)} title="Detach from conversation" className="rounded-full p-0.5 hover:bg-accent">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

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
          onEdit={editMessage}
          onBranchMessage={branchMessage}
          onStop={stopGeneration}
          sending={sending}
          isGenerating={isGenerating}
          loading={loading}
          isAdmin={isAdmin}
          debug={debug}
          onOpenImageGenerator={() => {
            setImageGeneratorOpen(true);
          }}
          onOpenFileLibrary={() => setFileLibraryOpen(true)}
        />
        <ImageGenerator
          open={imageGeneratorOpen}
          onClose={() => setImageGeneratorOpen(false)}
        />
        <CanvasWorkspace
          open={canvasOpen}
          conversationId={activeId}
          messages={messages}
          onClose={() => setCanvasOpen(false)}
        />
        <FileLibrary
          open={fileLibraryOpen}
          conversationId={activeId}
          onClose={() => setFileLibraryOpen(false)}
          onAttached={(doc) => {
            setAttachments((p) => p.some(a => a.documentId === doc.id) ? p : [...p, { id: crypto.randomUUID(), documentId: doc.id, title: doc.title, originalName: doc.originalName, mimeType: doc.mimeType, byteSize: doc.byteSize }]);
            setFileLibraryOpen(false);
            notify(`Attached “${doc.title}”`);
          }}
        />
      </div>

      <GuestAuthGate open={isGuest && guestGateOpen} />

      {/* Delete confirmation */}
      <Modal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        title="Delete conversation?"
      >
        <p className="mb-4 text-sm text-muted-foreground">
          "{pendingDelete?.title}" and all its messages will be permanently
          removed. This cannot be undone.
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
