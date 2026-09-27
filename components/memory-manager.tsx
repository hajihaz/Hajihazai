"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Download,
  Pencil,
  RefreshCcw,
  Search,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from "lucide-react";

type Status = "active" | "pending" | "deleted";
type Lifecycle = "current" | "pending" | "scheduled" | "expired" | "superseded" | "deleted";
type Memory = {
  id: string;
  type: string;
  title: string | null;
  content: string;
  status: Status;
  importance: number | null;
  confidence: number | null;
  validFrom: string;
  validUntil: string | null;
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
};
type Stats = {
  active: number;
  retrievable: number;
  pending: number;
  scheduled: number;
  expired: number;
  superseded: number;
  deleted: number;
  total: number;
};
type Filter = "all" | Lifecycle;
type Draft = {
  title: string;
  type: string;
  content: string;
  importance: string;
  confidence: string;
  validFrom: string;
  validUntil: string;
};

function toLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function lifecycleOf(memory: Memory): Lifecycle {
  if (memory.status === "deleted") return "deleted";
  if (memory.status === "pending") return "pending";
  if (memory.supersededBy) return "superseded";
  const now = Date.now();
  if (new Date(memory.validFrom).getTime() > now) return "scheduled";
  if (memory.validUntil && new Date(memory.validUntil).getTime() <= now) return "expired";
  return "current";
}

function draftFrom(memory: Memory): Draft {
  return {
    title: memory.title ?? "",
    type: memory.type,
    content: memory.content,
    importance: memory.importance?.toString() ?? "",
    confidence: memory.confidence?.toString() ?? "",
    validFrom: toLocalInput(memory.validFrom),
    validUntil: toLocalInput(memory.validUntil),
  };
}

export default function MemoryManager({
  initialMemories,
  initialStats,
}: {
  initialMemories: Memory[];
  initialStats: Stats;
}) {
  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [stats, setStats] = useState<Stats>(initialStats);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft | null>(null);
  const [replaceId, setReplaceId] = useState<string | null>(null);
  const [replaceDraft, setReplaceDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memories.filter((memory) => {
      const lifecycle = lifecycleOf(memory);
      if (filter !== "all" && lifecycle !== filter) return false;
      if (!q) return true;
      return [memory.title, memory.type, memory.content]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [memories, filter, query]);

  async function refresh(message?: string) {
    const res = await fetch("/api/memories?status=all", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setMemories(data.memories);
      setStats(data.stats);
      setSelected(new Set());
      if (message) setNotice(message);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const allSelected = visible.length > 0 && visible.every((memory) => prev.has(memory.id));
      if (allSelected) return new Set();
      return new Set(visible.map((memory) => memory.id));
    });
  }

  async function bulk(action: "approve" | "reject" | "delete") {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/memories/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids: [...selected] }),
      });
      if (res.ok) await refresh(`${action[0].toUpperCase()}${action.slice(1)} complete.`);
      else setNotice((await res.text().catch(() => "")) || "Memory action failed.");
    } finally {
      setBusy(false);
    }
  }


  async function pendingAction(id: string, action: "approve" | "reject") {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/memories/${id}/${action}`, { method: "POST" });
      if (res.ok) await refresh(action === "approve" ? "Memory approved." : "Memory rejected.");
      else setNotice((await res.text().catch(() => "")) || "Memory action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function forgetAll() {
    if (!window.confirm("Delete ALL of your memories? This cannot be undone.")) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/memories/forget-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (res.ok) await refresh("All memories deleted.");
      else setNotice((await res.text().catch(() => "")) || "Could not delete memories.");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(memory: Memory) {
    setReplaceId(null);
    setReplaceDraft(null);
    setEditId(memory.id);
    setEditDraft(draftFrom(memory));
    setNotice(null);
  }

  async function saveEdit(id: string) {
    if (!editDraft?.content.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const body: Record<string, unknown> = {
        title: editDraft.title.trim() || null,
        type: editDraft.type.trim() || "note",
        content: editDraft.content.trim(),
        importance: editDraft.importance === "" ? null : Number(editDraft.importance),
        confidence: editDraft.confidence === "" ? null : Number(editDraft.confidence),
        validUntil: editDraft.validUntil ? toIso(editDraft.validUntil) : null,
      };
      const validFrom = toIso(editDraft.validFrom);
      if (validFrom) body.validFrom = validFrom;
      const res = await fetch(`/api/memories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setNotice((await res.text().catch(() => "")) || "Could not save memory.");
        return;
      }
      setEditId(null);
      setEditDraft(null);
      await refresh("Memory updated.");
    } finally {
      setBusy(false);
    }
  }

  function startReplace(memory: Memory) {
    setEditId(null);
    setEditDraft(null);
    setReplaceId(memory.id);
    setReplaceDraft({ ...draftFrom(memory), validFrom: toLocalInput(new Date().toISOString()), validUntil: "" });
    setNotice(null);
  }

  async function saveReplacement(id: string) {
    if (!replaceDraft?.content.trim() || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/memories/${id}/replace`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: replaceDraft.title.trim() || null,
          type: replaceDraft.type.trim() || "note",
          content: replaceDraft.content.trim(),
          importance: replaceDraft.importance === "" ? null : Number(replaceDraft.importance),
          confidence: replaceDraft.confidence === "" ? null : Number(replaceDraft.confidence),
          validUntil: replaceDraft.validUntil ? toIso(replaceDraft.validUntil) : null,
        }),
      });
      if (!res.ok) {
        setNotice((await res.text().catch(() => "")) || "Could not replace memory.");
        return;
      }
      setReplaceId(null);
      setReplaceDraft(null);
      await refresh("Memory replaced. The previous value remains in lifecycle history.");
    } finally {
      setBusy(false);
    }
  }

  async function expire(memory: Memory) {
    if (!window.confirm("Expire this memory now? It will stop being used in future chats but remain in history.")) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/memories/${memory.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ validUntil: new Date().toISOString() }),
      });
      if (res.ok) await refresh("Memory expired and removed from retrieval.");
      else setNotice((await res.text().catch(() => "")) || "Could not expire memory.");
    } finally {
      setBusy(false);
    }
  }

  const filters: Filter[] = ["all", "current", "pending", "scheduled", "expired", "superseded", "deleted"];

  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-8 sm:py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Manage Memory</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Control what HajiHaz remembers, how strongly it should be prioritized, and when a fact stops being valid.
          </p>
        </div>
        <a href="/memory" className="rounded-lg border px-3 py-2 text-sm hover:bg-accent">Back to memory</a>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <Stat label="Current" value={stats.retrievable} />
        <Stat label="Pending" value={stats.pending} />
        <Stat label="Scheduled" value={stats.scheduled} />
        <Stat label="Expired" value={stats.expired} />
        <Stat label="Replaced" value={stats.superseded} />
        <Stat label="Deleted" value={stats.deleted} />
        <Stat label="Total" value={stats.total} />
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative min-w-0 flex-1 sm:max-w-sm">
          <span className="sr-only">Search memories</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search memory history…"
            className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <a href="/api/memories/export" className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent">
            <Download className="size-4" /> Export
          </a>
          <button type="button" onClick={forgetAll} disabled={busy} className="flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-40">
            <ShieldAlert className="size-4" /> Forget everything
          </button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1" aria-label="Memory lifecycle filters">
        {filters.map((value) => (
          <button
            type="button"
            key={value}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize ${filter === value ? "bg-primary text-primary-foreground" : "border hover:bg-accent"}`}
          >
            {value === "superseded" ? "replaced" : value}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <button type="button" onClick={toggleAllVisible} className="rounded-lg border px-3 py-1.5 hover:bg-accent">
          {visible.length > 0 && visible.every((memory) => selected.has(memory.id)) ? "Clear" : "Select all"}
        </button>
        <span className="text-muted-foreground">{selected.size} selected · {visible.length} shown</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" onClick={() => bulk("approve")} disabled={busy || selected.size === 0} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:bg-accent disabled:opacity-40">
            <ThumbsUp className="size-4" /> Approve
          </button>
          <button type="button" onClick={() => bulk("reject")} disabled={busy || selected.size === 0} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:bg-accent disabled:opacity-40">
            <ThumbsDown className="size-4" /> Reject
          </button>
          <button type="button" onClick={() => bulk("delete")} disabled={busy || selected.size === 0} className="flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-40">
            <Trash2 className="size-4" /> Delete
          </button>
        </div>
      </div>

      {notice ? <p role="status" className="mb-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">{notice}</p> : null}

      {visible.length === 0 ? (
        <p className="rounded-xl border py-12 text-center text-sm text-muted-foreground">No memories match this view.</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((memory) => {
            const lifecycle = lifecycleOf(memory);
            return (
              <li key={memory.id} className="rounded-xl border p-4">
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    aria-label={`Select ${memory.title || memory.content.slice(0, 40)}`}
                    checked={selected.has(memory.id)}
                    onChange={() => toggle(memory.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <LifecycleBadge lifecycle={lifecycle} />
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{memory.type}</span>
                      {memory.importance ? <span className="text-xs text-muted-foreground">Priority {memory.importance}/5</span> : null}
                      {memory.confidence !== null ? <span className="text-xs text-muted-foreground">Confidence {memory.confidence}%</span> : null}
                    </div>
                    {memory.title ? <h2 className="mt-2 text-sm font-semibold">{memory.title}</h2> : null}
                    <p className="mt-1 whitespace-pre-wrap text-sm">{memory.content}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span>Valid from {fmt(memory.validFrom)}</span>
                      <span>{memory.validUntil ? `Valid until ${fmt(memory.validUntil)}` : "No expiry"}</span>
                      <span>Updated {fmt(memory.updatedAt)}</span>
                      {memory.supersededBy ? <span>Replacement {memory.supersededBy.slice(0, 8)}…</span> : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {memory.status === "pending" ? (
                      <>
                        <button type="button" onClick={() => void pendingAction(memory.id, "approve")} aria-label="Approve memory" title="Approve" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-green-600"><ThumbsUp className="size-4" /></button>
                        <button type="button" onClick={() => void pendingAction(memory.id, "reject")} aria-label="Reject memory" title="Reject" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive"><ThumbsDown className="size-4" /></button>
                      </>
                    ) : null}
                    {lifecycle !== "deleted" ? (
                      <button type="button" onClick={() => startEdit(memory)} aria-label="Edit memory" title="Edit" className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><Pencil className="size-4" /></button>
                    ) : null}
                    {lifecycle === "current" || lifecycle === "scheduled" ? (
                      <>
                        <button type="button" onClick={() => startReplace(memory)} aria-label="Replace memory" title="Replace while preserving history" className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><RefreshCcw className="size-4" /></button>
                        <button type="button" onClick={() => expire(memory)} aria-label="Expire memory" title="Expire now" className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><Clock3 className="size-4" /></button>
                      </>
                    ) : null}
                  </div>
                </div>

                {editId === memory.id && editDraft ? (
                  <MemoryEditor
                    title="Edit memory"
                    draft={editDraft}
                    onChange={setEditDraft}
                    onSave={() => void saveEdit(memory.id)}
                    onCancel={() => { setEditId(null); setEditDraft(null); }}
                    busy={busy}
                  />
                ) : null}

                {replaceId === memory.id && replaceDraft ? (
                  <MemoryEditor
                    title="Create replacement"
                    helper="Saving creates a new active memory and closes this version at the same timestamp."
                    draft={replaceDraft}
                    onChange={setReplaceDraft}
                    onSave={() => void saveReplacement(memory.id)}
                    onCancel={() => { setReplaceId(null); setReplaceDraft(null); }}
                    busy={busy}
                    hideValidFrom
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function MemoryEditor({
  title,
  helper,
  draft,
  onChange,
  onSave,
  onCancel,
  busy,
  hideValidFrom = false,
}: {
  title: string;
  helper?: string;
  draft: Draft;
  onChange: (draft: Draft) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
  hideValidFrom?: boolean;
}) {
  return (
    <div className="mt-4 rounded-xl border bg-muted/20 p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Title
          <input value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} maxLength={160} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Type
          <input value={draft.type} onChange={(event) => onChange({ ...draft, type: event.target.value })} maxLength={80} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Priority (1–5)
          <input type="number" min={1} max={5} value={draft.importance} onChange={(event) => onChange({ ...draft, importance: event.target.value })} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Confidence (0–100)
          <input type="number" min={0} max={100} value={draft.confidence} onChange={(event) => onChange({ ...draft, confidence: event.target.value })} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
        {!hideValidFrom ? (
          <label className="text-xs text-muted-foreground">Valid from
            <input type="datetime-local" value={draft.validFrom} onChange={(event) => onChange({ ...draft, validFrom: event.target.value })} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground" />
          </label>
        ) : null}
        <label className="text-xs text-muted-foreground">Valid until (optional)
          <input type="datetime-local" value={draft.validUntil} onChange={(event) => onChange({ ...draft, validUntil: event.target.value })} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground" />
        </label>
      </div>
      <label className="mt-3 block text-xs text-muted-foreground">Memory
        <textarea value={draft.content} onChange={(event) => onChange({ ...draft, content: event.target.value })} rows={3} maxLength={12000} className="mt-1 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm text-foreground" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onSave} disabled={busy || !draft.content.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-40"><Check className="size-4" /> Save</button>
        <button type="button" onClick={onCancel} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-accent disabled:opacity-40"><X className="size-4" /> Cancel</button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border p-3 text-center">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function LifecycleBadge({ lifecycle }: { lifecycle: Lifecycle }) {
  const styles: Record<Lifecycle, string> = {
    current: "bg-green-600/10 text-green-700 dark:text-green-400",
    pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    scheduled: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    expired: "bg-muted text-muted-foreground",
    superseded: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
    deleted: "bg-destructive/10 text-destructive",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[lifecycle]}`}>{lifecycle === "superseded" ? "replaced" : lifecycle}</span>;
}

function fmt(value: string) {
  return new Date(value).toLocaleString();
}
