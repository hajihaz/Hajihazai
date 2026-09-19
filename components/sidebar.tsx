"use client";

import Image from "next/image";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Brain,
  ChevronRight,
  Folder,
  FolderPlus,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";

type Conv = { id: string; title: string; projectId?: string | null; updatedAt?: string | null; archived?: boolean; pinned?: boolean };
type Proj = { id: string; name: string; isSystem?: boolean };
type BrainEntry = { id: string; name: string; slug: string; icon: string; color: string };

type DateGroup = { label: string; items: Conv[] };

function groupByDate(convs: Conv[]): DateGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400_000);
  const startOf7Days = new Date(startOfToday.getTime() - 6 * 86400_000);
  const groups: DateGroup[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 Days", items: [] },
    { label: "Older", items: [] },
  ];
  for (const c of convs) {
    const d = c.updatedAt ? new Date(c.updatedAt) : null;
    if (!d || isNaN(d.getTime())) { groups[3].items.push(c); }
    else if (d >= startOfToday) { groups[0].items.push(c); }
    else if (d >= startOfYesterday) { groups[1].items.push(c); }
    else if (d >= startOf7Days) { groups[2].items.push(c); }
    else { groups[3].items.push(c); }
  }
  return groups.filter((g) => g.items.length > 0);
}

const SECTION_KEYS = ["projects", "brains", "recent"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

function useSectionCollapse() {
  const STORAGE_KEY = "sidebar_collapsed";
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? new Set(JSON.parse(raw) as SectionKey[]) : new Set<SectionKey>();
    } catch {
      return new Set<SectionKey>();
    }
  });
  function toggle(key: SectionKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /**/ }
      return next;
    });
  }
  return { collapsed, toggle };
}

// Defined OUTSIDE Sidebar so React component identity is stable across re-renders.
// (An inner component would get a new type each render, causing remount + focus loss during rename.)
function ConvRow({
  c,
  projectName,
  isPinned,
  isActive,
  isRenaming,
  renameValue,
  renameInputRef,
  onRenameChange,
  onCommitRename,
  onCancelRename,
  onStartRename,
  onTogglePin,
  onArchive,
  onSelect,
  onDelete,
}: {
  c: Conv;
  projectName?: string;
  isPinned: boolean;
  isActive: boolean;
  isRenaming: boolean;
  renameValue: string;
  renameInputRef: React.RefObject<HTMLInputElement | null>;
  onRenameChange: (v: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartRename: () => void;
  onTogglePin: () => void;
  onArchive: () => void;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      onDoubleClick={() => !isRenaming && onStartRename()}
      className={`group flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm ${
        isActive ? "bg-accent" : "active:bg-accent/60 md:hover:bg-accent/60"
      }`}
    >
      <MessageSquare className="ml-1 size-4 shrink-0 text-muted-foreground" />

      {isRenaming ? (
        <input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommitRename(); }
            if (e.key === "Escape") { e.preventDefault(); onCancelRename(); }
          }}
          onBlur={onCommitRename}
          onClick={(e) => e.stopPropagation()}
          className="min-w-0 flex-1 rounded bg-background px-1 py-0.5 text-sm outline-none ring-1 ring-ring"
        />
      ) : (
        <>
          <span onClick={onSelect} className="min-w-0 flex-1 truncate">
            {c.title}
          </span>
          {projectName ? (
            <span className="hidden max-w-24 shrink-0 truncate rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline" title={projectName}>
              {projectName}
            </span>
          ) : null}
        </>
      )}

      {!isRenaming && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
            aria-label={isPinned ? "Unpin chat" : "Pin chat"}
            title={isPinned ? "Unpin" : "Pin"}
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:opacity-0 md:transition md:group-hover:opacity-100"
          >
            {isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          </button>
          <button onClick={(e) => { e.stopPropagation(); onArchive(); }} aria-label="Archive conversation" title="Archive" className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:opacity-0 md:transition md:group-hover:opacity-100">
            <Archive className="size-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onStartRename(); }}
            aria-label="Rename conversation"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-foreground md:opacity-0 md:transition md:group-hover:opacity-100"
          >
            <Pencil className="size-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            aria-label="Delete conversation"
            className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive md:opacity-0 md:transition md:group-hover:opacity-100"
          >
            <Trash2 className="size-4" />
          </button>
        </>
      )}
    </div>
  );
}

const MAX_PINNED = 20;

const Sidebar = memo(function Sidebar({
  conversations,
  projects,
  brains,
  activeId,
  onSelect,
  onNew,
  onNewProject,
  onNewProjectChat,
  onDelete,
  onRename,
  onArchive,
  onToast,
  open,
  onClose,
  searchRef,
}: {
  conversations: Conv[];
  projects: Proj[];
  brains?: BrainEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNewProject: () => void;
  onNewProjectChat: (projectId: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onToast: (msg: string) => void;
  open: boolean;
  onClose: () => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [projectChats, setProjectChats] = useState<Record<string, Conv[]>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [archivedChats, setArchivedChats] = useState<Conv[]>([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const [loadingProj, setLoadingProj] = useState<string | null>(null);
  const { collapsed, toggle: toggleSection } = useSectionCollapse();

  // Search
  const [searchQuery, setSearchQuery] = useState("");

  // Pin
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  useEffect(() => { setPinned(new Set(conversations.filter(c => c.pinned).map(c => c.id))); }, [conversations]);


  // Inline rename
  const [inlineRenameId, setInlineRenameId] = useState<string | null>(null);
  const [inlineRenameValue, setInlineRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Touch for swipe-to-close
  const touchStartXRef = useRef<number | null>(null);

  // Body scroll lock when sidebar open on mobile
  useEffect(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (open && isMobile) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Focus rename input when rename starts
  useEffect(() => {
    if (inlineRenameId) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [inlineRenameId]);

  async function toggleProject(id: string) {
    if (expanded.has(id)) {
      setExpanded((prev) => { const next = new Set(prev); next.delete(id); return next; });
      return;
    }
    setExpanded((prev) => new Set([...prev, id]));
    if (!projectChats[id]) {
      setLoadingProj(id);
      try {
        const res = await fetch(`/api/projects/${id}`);
        if (res.ok) {
          const data = await res.json();
          setProjectChats((prev) => ({ ...prev, [id]: data.chats ?? [] }));
        }
      } finally {
        setLoadingProj(null);
      }
    }
  }

  async function toggleArchivedView() {
    const next = !showArchived;
    setShowArchived(next);
    if (!next || archivedChats.length) return;
    setLoadingArchived(true);
    try {
      const res = await fetch("/api/conversations?archived=true");
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setArchivedChats(Array.isArray(data.conversations) ? data.conversations : []);
    } catch {
      onToast("Couldn't load archived chats");
    } finally { setLoadingArchived(false); }
  }

  function handleArchive(id: string, archived: boolean) {
    onArchive(id, archived);
    if (archived) setArchivedChats((prev) => prev.filter((c) => c.id !== id));
    else setArchivedChats((prev) => prev.filter((c) => c.id !== id));
  }

  function togglePin(id: string) {
    setPinned((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev);
        next.delete(id);
        void fetch(`/api/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: false }) });
        return next;
      }
      if (prev.size >= MAX_PINNED) {
        onToast(`Maximum ${MAX_PINNED} pinned chats`);
        return prev;
      }
      const next = new Set(prev);
      next.add(id);
      void fetch(`/api/conversations/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pinned: true }) });
      return next;
    });
  }

  function startRename(c: Conv) {
    setInlineRenameId(c.id);
    setInlineRenameValue(c.title);
  }

  function commitRename() {
    const id = inlineRenameId;
    const title = inlineRenameValue.trim();
    setInlineRenameId(null);
    if (id && title) onRename(id, title);
  }

  function cancelRename() {
    setInlineRenameId(null);
  }

  const q = searchQuery.toLowerCase().trim();

  const filteredConversations = useMemo(
    () => (q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations),
    [conversations, q],
  );

  const pinnedConvs = useMemo(
    () => filteredConversations.filter((c) => pinned.has(c.id)),
    [filteredConversations, pinned],
  );
  const unpinnedConvs = useMemo(
    () => filteredConversations.filter((c) => !pinned.has(c.id)),
    [filteredConversations, pinned],
  );
  const dateGroups = useMemo(() => groupByDate(unpinnedConvs), [unpinnedConvs]);
  const sorted = useMemo(
    () =>
      [...projects].sort((a, b) => {
        if (a.isSystem && !b.isSystem) return -1;
        if (!a.isSystem && b.isSystem) return 1;
        return a.name.localeCompare(b.name);
      }),
    [projects],
  );
  const projectNameById = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      ) : null}

      <aside
        onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchStartXRef.current === null) return;
          const dx = touchStartXRef.current - e.changedTouches[0].clientX;
          if (dx > 50) onClose();
          touchStartXRef.current = null;
        }}
        className={`fixed inset-y-0 left-0 z-40 flex w-[82%] max-w-xs flex-col border-r bg-background transition-transform duration-200 ease-out md:static md:z-auto md:w-72 md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="p-3 pb-2">
          <div className="mb-2 flex items-center gap-2 px-1">
            <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-black">
              <Image src="/branding/hajihaz-mark.png" alt="HajiHaz AI" width={512} height={512} className="size-7 object-contain" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">HajiHaz AI</p>
              <p className="text-[10px] text-muted-foreground">Personal intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={onNew}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90"
          >
            <Plus className="size-4" /> New Chat
          </button>
          </div>
          <button
            onClick={onClose}
            aria-label="Close conversations"
            className="absolute right-3 top-3 flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-accent md:hidden"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search… ⌘K"
              aria-label="Search conversations"
              className="w-full rounded-lg border bg-muted/40 py-2 pl-8 pr-3 text-base outline-none focus:bg-background focus:ring-2 focus:ring-ring sm:text-sm"
            />
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
          {/* Projects */}
          <div className="mb-1 flex items-center justify-between px-2 pt-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleSection("projects")}
                aria-label="Collapse projects"
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className={`size-3 transition-transform ${collapsed.has("projects") ? "" : "rotate-90"}`} />
              </button>
              <a href="/projects" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground">
                Projects
              </a>
            </div>
            <button
              onClick={onNewProject}
              aria-label="New project"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <FolderPlus className="size-4" />
            </button>
          </div>

          {!collapsed.has("projects") && sorted.length === 0 ? (
            <p className="px-2 pb-2 text-xs text-muted-foreground">No projects yet</p>
          ) : !collapsed.has("projects") ? (
            <ul className="mb-2 space-y-0.5">
              {sorted.map((p) => {
                const isOpen = expanded.has(p.id);
                const chats = projectChats[p.id];
                return (
                  <li key={p.id}>
                    <div className="flex items-center gap-0.5 rounded-lg active:bg-accent/60 md:hover:bg-accent/60">
                      <button
                        onClick={() => toggleProject(p.id)}
                        aria-label={isOpen ? "Collapse project" : "Expand project"}
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
                      >
                        <ChevronRight className={`size-3.5 transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`} />
                      </button>
                      <a
                        href={`/projects/${p.id}`}
                        className="flex min-h-9 min-w-0 flex-1 items-center gap-2 text-sm"
                      >
                        {p.isSystem ? (
                          <Brain className="size-4 shrink-0 text-primary" />
                        ) : (
                          <Folder className="size-4 shrink-0 text-muted-foreground" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {p.isSystem ? (
                          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            Global
                          </span>
                        ) : null}
                      </a>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNewProjectChat(p.id);
                        }}
                        aria-label={"New chat in " + p.name}
                        title="New chat in project"
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                    {isOpen && (
                      <ul className="ml-5 mt-0.5 space-y-0.5 border-l pl-2">
                        {loadingProj === p.id && (
                          <li className="px-2 py-1 text-xs text-muted-foreground">Loading…</li>
                        )}
                        {chats?.length === 0 && loadingProj !== p.id && (
                          <li className="px-2 py-1 text-xs text-muted-foreground">No chats yet</li>
                        )}
                        {chats?.map((c) => (
                          <li key={c.id}>
                            <div
                              onClick={() => { onSelect(c.id); onClose(); }}
                              className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-sm ${
                                activeId === c.id ? "bg-accent" : "active:bg-accent/60 md:hover:bg-accent/60"
                              }`}
                            >
                              <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                              <span className="min-w-0 flex-1 truncate">{c.title}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}

          {/* Brains */}
          {brains && brains.length > 0 && (
            <>
              <div className="mb-1 flex items-center px-2 pt-1">
                <button
                  onClick={() => toggleSection("brains")}
                  className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className={`size-3 transition-transform ${collapsed.has("brains") ? "" : "rotate-90"}`} />
                  Brains
                </button>
              </div>
              {!collapsed.has("brains") && (
                <ul className="mb-2 space-y-0.5">
                  {brains.map((b) => (
                    <li key={b.id}>
                      <a
                        href={`/?brain=${b.slug}`}
                        className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-sm active:bg-accent/60 md:hover:bg-accent/60"
                      >
                        <span className="text-base leading-none">{b.icon}</span>
                        <span className="min-w-0 flex-1 truncate">{b.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {/* Archived Chats */}
          <div className="mb-2 px-1">
            <button
              onClick={toggleArchivedView}
              className={`flex min-h-9 w-full items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground ${showArchived ? "bg-accent/60 text-foreground" : ""}`}
              aria-expanded={showArchived}
              aria-label="Archived chats"
            >
              {showArchived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
              <span>Archived</span>
              {loadingArchived ? <span className="ml-auto text-[11px]">Loading…</span> : archivedChats.length > 0 ? <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{archivedChats.length}</span> : null}
            </button>
            {showArchived ? (
              <div className="mt-1 space-y-1">
                {archivedChats.length === 0 && !loadingArchived ? <p className="px-3 py-3 text-xs text-muted-foreground">No archived chats.</p> : null}
                {archivedChats.map((c) => (
                  <ConvRow
                    key={c.id}
                    c={c}
                    projectName={c.projectId ? projectNameById.get(c.projectId) : undefined}
                    isPinned={false}
                    isActive={activeId === c.id}
                    isRenaming={false}
                    renameValue=""
                    renameInputRef={renameInputRef}
                    onRenameChange={() => {}}
                    onCommitRename={() => {}}
                    onCancelRename={() => {}}
                    onStartRename={() => {}}
                    onTogglePin={() => {}}
                    onArchive={() => handleArchive(c.id, false)}
                    onSelect={() => { onSelect(c.id); onClose(); }}
                    onDelete={() => { onDelete(c.id); setArchivedChats((prev) => prev.filter((x) => x.id !== c.id)); }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* Recent Chats */}
          <div className="mb-1 flex items-center px-2 pt-1">
            <button
              onClick={() => toggleSection("recent")}
              className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
            >
              <ChevronRight className={`size-3 transition-transform ${collapsed.has("recent") ? "" : "rotate-90"}`} />
              Recent Chats
            </button>
          </div>

          {!collapsed.has("recent") && conversations.length === 0 && !q ? (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
              <MessageSquare className="size-6 text-muted-foreground/60" />
              <p className="text-sm font-medium">No conversations yet</p>
              <p className="text-xs text-muted-foreground">
                Tap "New Chat" to start your first conversation.
              </p>
            </div>
          ) : !collapsed.has("recent") ? (
            <div className="space-y-3">
              {/* Pinned section */}
              {pinnedConvs.length > 0 && (
                <div>
                  <p className="mb-0.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Pinned
                  </p>
                  <ul className="space-y-0.5">
                    {pinnedConvs.map((c) => (
                      <li key={c.id}>
                        <ConvRow
                          c={c}
                          projectName={c.projectId ? projectNameById.get(c.projectId) : undefined}
                          isPinned
                          isActive={activeId === c.id}
                          isRenaming={inlineRenameId === c.id}
                          renameValue={inlineRenameValue}
                          renameInputRef={renameInputRef}
                          onRenameChange={setInlineRenameValue}
                          onCommitRename={commitRename}
                          onCancelRename={cancelRename}
                          onStartRename={() => startRename(c)}
                          onTogglePin={() => togglePin(c.id)}
                          onArchive={() => handleArchive(c.id, !c.archived)}
                          onSelect={() => onSelect(c.id)}
                          onDelete={() => onDelete(c.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Search: flat results (no date groups) */}
              {q && filteredConversations.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-muted-foreground">
                  No results for "{searchQuery}"
                </p>
              ) : q ? (
                <ul className="space-y-0.5">
                  {unpinnedConvs.map((c) => (
                    <li key={c.id}>
                      <ConvRow
                        c={c}
                        projectName={c.projectId ? projectNameById.get(c.projectId) : undefined}
                        isPinned={false}
                        isActive={activeId === c.id}
                        isRenaming={inlineRenameId === c.id}
                        renameValue={inlineRenameValue}
                        renameInputRef={renameInputRef}
                        onRenameChange={setInlineRenameValue}
                        onCommitRename={commitRename}
                        onCancelRename={cancelRename}
                        onStartRename={() => startRename(c)}
                        onTogglePin={() => togglePin(c.id)}
                        onArchive={() => handleArchive(c.id, !c.archived)}
                        onSelect={() => onSelect(c.id)}
                        onDelete={() => onDelete(c.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                /* Date-grouped unpinned conversations */
                dateGroups.map((group) => (
                  <div key={group.label}>
                    <p className="mb-0.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      {group.label}
                    </p>
                    <ul className="space-y-0.5">
                      {group.items.map((c) => (
                        <li key={c.id}>
                          <ConvRow
                            c={c}
                            isPinned={false}
                            isActive={activeId === c.id}
                            isRenaming={inlineRenameId === c.id}
                            renameValue={inlineRenameValue}
                            renameInputRef={renameInputRef}
                            onRenameChange={setInlineRenameValue}
                            onCommitRename={commitRename}
                            onCancelRename={cancelRename}
                            onStartRename={() => startRename(c)}
                            onTogglePin={() => togglePin(c.id)}
                            onArchive={() => handleArchive(c.id, !c.archived)}
                            onSelect={() => onSelect(c.id)}
                            onDelete={() => onDelete(c.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </nav>
      </aside>
    </>
  );
});
export default Sidebar;
