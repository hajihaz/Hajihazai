"use client";

import { useRef, useState } from "react";
import {
  ArrowLeft,
  Brain,
  Check,
  Clock,
  FileText,
  History,
  Link2,
  Loader2,
  MessageSquarePlus,
  Pencil,
  Pause,
  Play,
  Plus,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";

type Chat = { id: string; title: string };
type Doc = { id: string; title: string; status: string };
type Artifact = {
  id: string;
  title: string;
  conversationId: string | null;
  updatedAt: string;
};
type Memory = {
  id: string;
  type: string;
  title: string | null;
  content: string;
  status: string;
};
type Automation = {
  id: string;
  name: string;
  prompt: string;
  schedule: string;
  timezone: string;
  status: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
};
type Run = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  output: string | null;
  error: string | null;
  modelId: string | null;
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusClass(status: string) {
  if (status === "active" || status === "success") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  }
  if (status === "failed" || status === "error") {
    return "bg-destructive/10 text-destructive";
  }
  return "bg-muted text-muted-foreground";
}

export default function ProjectWorkspace({
  project,
  initialChats,
  initialDocs,
  initialArtifacts,
  initialMemories,
  initialAutomations,
}: {
  project: {
    id: string;
    name: string;
    description: string | null;
    instructions: string | null;
    isSystem?: boolean;
  };
  initialChats: Chat[];
  initialDocs: Doc[];
  initialArtifacts: Artifact[];
  initialMemories: Memory[];
  initialAutomations: Automation[];
}) {
  const [chats] = useState(initialChats);
  const [docs, setDocs] = useState(initialDocs);
  const [artifacts] = useState(initialArtifacts);
  const [memories, setMemories] = useState(initialMemories);
  const [automations, setAutomations] = useState(initialAutomations);
  const [availableMemories, setAvailableMemories] = useState<Memory[]>([]);
  const [showMemoryPicker, setShowMemoryPicker] = useState(false);
  const [memorySearch, setMemorySearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [searchResults, setSearchResults] = useState<
    { title: string; kind: string; id: string }[]
  >([]);
  const [instructions, setInstructions] = useState(project.instructions ?? "");
  const [projectName, setProjectName] = useState(project.name);
  const [projectDescription, setProjectDescription] = useState(project.description ?? "");
  const [editingProject, setEditingProject] = useState(false);
  const [projectMsg, setProjectMsg] = useState<string | null>(null);
  const [instrMsg, setInstrMsg] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [memoryBusy, setMemoryBusy] = useState<string | null>(null);
  const [automationBusy, setAutomationBusy] = useState<string | null>(null);
  const [automationMsg, setAutomationMsg] = useState<string | null>(null);
  const [editingAutomation, setEditingAutomation] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, Run[]>>({});
  const [form, setForm] = useState({
    name: "",
    prompt: "",
    schedule: "0 9 * * *",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  });
  const [editForm, setEditForm] = useState(form);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveProjectDetails() {
    setProjectMsg(null);
    const name = projectName.trim();
    if (!name) { setProjectMsg("Name is required"); return; }
    const res = await fetch("/api/projects/" + project.id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: projectDescription }),
    });
    if (res.ok) { setProjectName(name); setEditingProject(false); setProjectMsg("Saved"); }
    else { setProjectMsg((await res.text().catch(() => "")) || "Could not save"); }
  }

  async function deleteProject() {
    if (project.isSystem) return;
    if (!window.confirm("Delete this project? Chats will return to Recent Chats; project memories and automations will be removed.")) return;
    const res = await fetch("/api/projects/" + project.id, { method: "DELETE" });
    if (res.ok) window.location.href = "/";
    else setProjectMsg("Could not delete project");
  }

  async function saveInstructions() {
    setInstrMsg(null);
    const res = await fetch("/api/projects/" + project.id, {
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
      setUploadMsg("Added “" + file.name + "” (" + data.chunks + " chunks)");
      const refreshed = await fetch("/api/projects/" + project.id);
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
    window.location.href = "/?c=" + data.id;
  }

  async function openMemoryPicker() {
    setShowMemoryPicker(true);
    const res = await fetch("/api/memories?status=visible");
    if (res.ok) setAvailableMemories((await res.json()).memories ?? []);
  }

  async function attachMemory(memoryId: string) {
    setMemoryBusy(memoryId);
    try {
      const res = await fetch("/api/projects/" + project.id + "/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId }),
      });
      if (res.ok) {
        const data = await res.json();
        const memory = data.memory;
        if (memory) setMemories((p) => [...p, memory]);
        else {
          const refreshed = await fetch("/api/projects/" + project.id);
          if (refreshed.ok) setMemories((await refreshed.json()).memories ?? []);
        }
        setShowMemoryPicker(false);
      }
    } finally {
      setMemoryBusy(null);
    }
  }

  async function detachMemory(memoryId: string) {
    setMemoryBusy(memoryId);
    try {
      const res = await fetch(
        "/api/projects/" + project.id + "/memories?memoryId=" + encodeURIComponent(memoryId),
        { method: "DELETE" },
      );
      if (res.ok) setMemories((p) => p.filter((m) => m.id !== memoryId));
    } finally {
      setMemoryBusy(null);
    }
  }

  async function createAutomation(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.prompt.trim() || !form.schedule.trim()) return;
    setAutomationBusy("create");
    setAutomationMsg(null);
    try {
      const res = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, projectId: project.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAutomationMsg(data.error ?? "Could not create automation");
        return;
      }
      setAutomations((p) => [data.automation, ...p]);
      setForm({
        name: "",
        prompt: "",
        schedule: "0 9 * * *",
        timezone: form.timezone,
      });
      setAutomationMsg("Automation created");
    } finally {
      setAutomationBusy(null);
    }
  }

  function startAutomationEdit(a: Automation) {
    setEditingAutomation(a.id);
    setEditForm({
      name: a.name,
      prompt: a.prompt,
      schedule: a.schedule,
      timezone: a.timezone,
    });
  }

  async function saveAutomation(id: string) {
    setAutomationBusy(id);
    try {
      const res = await fetch("/api/automations/" + id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAutomations((p) => p.map((a) => (a.id === id ? data.automation : a)));
        setEditingAutomation(null);
      } else setAutomationMsg(data.error ?? "Could not save automation");
    } finally {
      setAutomationBusy(null);
    }
  }

  async function setAutomationStatus(a: Automation, status: "active" | "paused") {
    setAutomationBusy(a.id);
    try {
      const res = await fetch("/api/automations/" + a.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setAutomations((p) => p.map((x) => (x.id === a.id ? data.automation : x)));
      }
    } finally {
      setAutomationBusy(null);
    }
  }

  async function runNow(a: Automation) {
    setAutomationBusy(a.id);
    setAutomationMsg(null);
    try {
      const res = await fetch("/api/automations/" + a.id + "/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAutomationMsg("“" + a.name + "” finished a manual run.");
        await refreshAutomation(a.id);
        await loadRuns(a.id);
      } else setAutomationMsg(data.error ?? "Run failed");
    } finally {
      setAutomationBusy(null);
    }
  }

  async function deleteAutomation(id: string) {
    if (!window.confirm("Delete this automation and its run history?")) return;
    setAutomationBusy(id);
    try {
      const res = await fetch("/api/automations/" + id, { method: "DELETE" });
      if (res.ok) {
        setAutomations((p) => p.filter((a) => a.id !== id));
        setRuns((p) => {
          const next = { ...p };
          delete next[id];
          return next;
        });
      }
    } finally {
      setAutomationBusy(null);
    }
  }

  async function refreshAutomation(id: string) {
    const res = await fetch("/api/automations/" + id);
    if (res.ok) {
      const data = await res.json();
      setAutomations((p) => p.map((a) => (a.id === id ? data.automation : a)));
    }
  }

  async function loadRuns(id: string) {
    if (expandedRuns === id) {
      setExpandedRuns(null);
      return;
    }
    const res = await fetch("/api/automations/" + id + "/runs");
    if (res.ok) {
      const data = await res.json();
      setRuns((p) => ({ ...p, [id]: data.runs ?? [] }));
      setExpandedRuns(id);
    }
  }

  const filteredAvailable = availableMemories.filter((m) => {
    const q = memorySearch.trim().toLowerCase();
    return (
      !memories.some((linked) => linked.id === m.id) &&
      (!q ||
        m.content.toLowerCase().includes(q) ||
        m.type.toLowerCase().includes(q) ||
        (m.title ?? "").toLowerCase().includes(q))
    );
  });

  return (
    <main className="mx-auto min-h-dvh w-full max-w-4xl px-4 py-8">
      <a
        href="/"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to chat
      </a>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editingProject ? (
            <div className="space-y-2">
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} maxLength={100} autoFocus className="w-full rounded-lg border bg-background px-3 py-2 text-xl font-semibold outline-none focus:ring-2 focus:ring-ring" />
              <input value={projectDescription} onChange={(e) => setProjectDescription(e.target.value)} maxLength={4000} placeholder="Short project description" className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={saveProjectDetails} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Save</button>
                <button onClick={() => { setProjectName(project.name); setProjectDescription(project.description ?? ""); setEditingProject(false); }} className="rounded-lg border px-3 py-1.5 text-sm">Cancel</button>
                {projectMsg ? <span className="text-xs text-muted-foreground">{projectMsg}</span> : null}
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-semibold">{projectName}</h1>
              {projectDescription ? <p className="mt-1 text-sm text-muted-foreground">{projectDescription}</p> : null}
              {projectMsg ? <p className="mt-1 text-xs text-muted-foreground">{projectMsg}</p> : null}
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {project.isSystem ? (
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Global project</span>
          ) : (
            <>
              <button onClick={() => setEditingProject(true)} aria-label="Edit project" title="Edit project" className="rounded-lg border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"><Pencil className="size-4" /></button>
              <button onClick={deleteProject} aria-label="Delete project" title="Delete project" className="rounded-lg border p-2 text-muted-foreground hover:bg-accent hover:text-destructive"><Trash2 className="size-4" /></button>
            </>
          )}
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">Project workspace</span>
        </div>
      </div>

      <section className="mt-8 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Project Chats</h2>
          <button onClick={newChat} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90">
            <MessageSquarePlus className="size-4" /> New chat
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border">
          {chats.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No chats in this project yet.</p>
          ) : chats.map((c) => (
            <a key={c.id} href={"/?c=" + c.id} className="block border-b px-3 py-2.5 text-sm last:border-0 hover:bg-accent">
              {c.title}
            </a>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Project Knowledge &amp; Files</h2>
        </div>
        <form onSubmit={upload} className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".txt,.md,.pdf,.docx" className="text-sm" />
          <button disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
            <Upload className="size-4" /> Upload
          </button>
        </form>
        <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, and MD supported. Max 5MB.</p>
        {uploadMsg ? <p className="text-xs text-muted-foreground">{uploadMsg}</p> : null}
        <div className="overflow-hidden rounded-lg border">
          {docs.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No documents yet.</p>
          ) : docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2 border-b px-3 py-2.5 text-sm last:border-0">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{d.title}</span>
              <span className="text-xs text-muted-foreground">{d.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold"><Brain className="size-4" /> Project Memory</h2>
            <p className="mt-1 text-xs text-muted-foreground">Only linked memories and unscoped memories are used in project chats.</p>
          </div>
          <button onClick={openMemoryPicker} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">
            <Link2 className="size-4" /> Attach memory
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border">
          {memories.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">No memories are explicitly attached to this project.</p>
          ) : memories.map((m) => (
            <div key={m.id} className="flex items-start gap-3 border-b px-3 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{m.type}</span>
                  {m.title ? <span className="text-xs font-medium">{m.title}</span> : null}
                  <span className={"rounded-full px-2 py-0.5 text-xs " + statusClass(m.status)}>{m.status}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-sm">{m.content}</p>
              </div>
              <button onClick={() => detachMemory(m.id)} disabled={memoryBusy === m.id} aria-label="Detach memory" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-40">
                {memoryBusy === m.id ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
              </button>
            </div>
          ))}
        </div>
        {showMemoryPicker ? (
          <div className="rounded-xl border bg-background p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold">Attach an existing memory</p><p className="text-xs text-muted-foreground">Choose from your active and pending memories.</p></div>
              <button onClick={() => setShowMemoryPicker(false)} aria-label="Close memory picker" className="rounded-lg p-2 hover:bg-accent"><X className="size-4" /></button>
            </div>
            <input value={memorySearch} onChange={(e) => setMemorySearch(e.target.value)} placeholder="Filter memories…" className="mb-3 w-full rounded-lg border bg-background px-3 py-2 text-sm" />
            <div className="max-h-72 overflow-y-auto rounded-lg border">
              {filteredAvailable.length === 0 ? (
                <p className="px-3 py-5 text-center text-sm text-muted-foreground">No attachable memories found.</p>
              ) : filteredAvailable.map((m) => (
                <button key={m.id} onClick={() => attachMemory(m.id)} disabled={memoryBusy === m.id} className="block w-full border-b px-3 py-3 text-left last:border-0 hover:bg-accent disabled:opacity-50">
                  <div className="flex items-center gap-2"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{m.type}</span><span className="text-xs text-muted-foreground">{m.status}</span></div>
                  <p className="mt-1 line-clamp-2 text-sm">{m.title ? m.title + " — " : ""}{m.content}</p>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="mt-8 space-y-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Zap className="size-4" /> Automations</h2>
          <p className="mt-1 text-xs text-muted-foreground">Scheduled prompts run with this project’s instructions and memory context. Hobby hosting checks scheduled jobs daily; use “Run now” for an immediate execution.</p>
        </div>

        <form onSubmit={createAutomation} className="rounded-xl border p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Automation name" className="rounded-lg border bg-background px-3 py-2 text-sm" />
            <input value={form.schedule} onChange={(e) => setForm({ ...form, schedule: e.target.value })} placeholder="Cron, e.g. 0 9 * * *" className="rounded-lg border bg-background px-3 py-2 font-mono text-sm" />
            <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} placeholder="Timezone, e.g. Asia/Kolkata" className="rounded-lg border bg-background px-3 py-2 text-sm" />
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="size-4" /> Next run is calculated server-side.</div>
          </div>
          <textarea value={form.prompt} onChange={(e) => setForm({ ...form, prompt: e.target.value })} rows={3} placeholder="What should HajiHaz AI do on each run?" className="mt-3 w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button disabled={automationBusy === "create"} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {automationBusy === "create" ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Create automation
            </button>
            {automationMsg ? <span className="text-xs text-muted-foreground">{automationMsg}</span> : null}
          </div>
        </form>

        <div className="space-y-3">
          {automations.length === 0 ? (
            <div className="rounded-lg border px-3 py-5 text-center text-sm text-muted-foreground">No automations yet.</div>
          ) : automations.map((a) => (
            <div key={a.id} className="rounded-xl border p-4">
              {editingAutomation === a.id ? (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="rounded-lg border bg-background px-3 py-2 text-sm" />
                    <input value={editForm.schedule} onChange={(e) => setEditForm({ ...editForm, schedule: e.target.value })} className="rounded-lg border bg-background px-3 py-2 font-mono text-sm" />
                    <input value={editForm.timezone} onChange={(e) => setEditForm({ ...editForm, timezone: e.target.value })} className="rounded-lg border bg-background px-3 py-2 text-sm" />
                  </div>
                  <textarea value={editForm.prompt} onChange={(e) => setEditForm({ ...editForm, prompt: e.target.value })} rows={3} className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => saveAutomation(a.id)} disabled={automationBusy === a.id} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"><Check className="size-4" /> Save</button>
                    <button onClick={() => setEditingAutomation(null)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm"><X className="size-4" /> Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{a.name}</h3>
                        <span className={"rounded-full px-2 py-0.5 text-xs " + statusClass(a.status)}>{a.status}</span>
                        {a.lastStatus ? <span className={"rounded-full px-2 py-0.5 text-xs " + statusClass(a.lastStatus)}>{a.lastStatus}</span> : null}
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{a.schedule} · {a.timezone}</p>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {a.status === "active" ? (
                        <button onClick={() => setAutomationStatus(a, "paused")} disabled={automationBusy === a.id} title="Pause" className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><Pause className="size-4" /></button>
                      ) : (
                        <button onClick={() => setAutomationStatus(a, "active")} disabled={automationBusy === a.id} title="Resume" className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><Play className="size-4" /></button>
                      )}
                      <button onClick={() => runNow(a)} disabled={automationBusy === a.id || a.status !== "active"} title="Run now" className="rounded-lg p-2 text-muted-foreground hover:bg-accent disabled:opacity-40"><Zap className="size-4" /></button>
                      <button onClick={() => loadRuns(a.id)} title="Run history" className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><History className="size-4" /></button>
                      <button onClick={() => startAutomationEdit(a)} title="Edit" className="rounded-lg p-2 text-muted-foreground hover:bg-accent"><Pencil className="size-4" /></button>
                      <button onClick={() => deleteAutomation(a.id)} disabled={automationBusy === a.id} title="Delete" className="rounded-lg p-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{a.prompt}</p>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <span>Next: {fmtDate(a.nextRunAt)}</span>
                    <span>Last: {fmtDate(a.lastRunAt)}</span>
                    <span>Timezone: {a.timezone}</span>
                  </div>
                  {a.lastError ? <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{a.lastError}</p> : null}
                </>
              )}
              {expandedRuns === a.id ? (
                <div className="mt-4 border-t pt-3">
                  <p className="mb-2 text-xs font-semibold">Recent runs</p>
                  {(runs[a.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No runs yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {runs[a.id].map((run) => (
                        <details key={run.id} className="rounded-lg border px-3 py-2">
                          <summary className="cursor-pointer text-xs">
                            <span className={"mr-2 rounded-full px-2 py-0.5 " + statusClass(run.status)}>{run.status}</span>
                            {fmtDate(run.startedAt)}
                            {run.modelId ? " · " + run.modelId : ""}
                          </summary>
                          {run.error ? <p className="mt-2 text-xs text-destructive">{run.error}</p> : null}
                          {run.output ? <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{run.output}</pre> : null}
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Project Artifacts</h2>
          <span className="text-xs text-muted-foreground">{artifacts.length}</span>
        </div>
        <div className="overflow-hidden rounded-lg border">
          {artifacts.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">Artifacts created in project chats appear here.</p>
          ) : artifacts.map((a) => (
            <a key={a.id} href={a.conversationId ? "/?c=" + a.conversationId : "/"} className="block border-b px-3 py-2 text-sm last:border-0 hover:bg-accent">
              <span className="font-medium">{a.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">{new Date(a.updatedAt).toLocaleString()}</span>
            </a>
          ))}
        </div>
        <form onSubmit={async (e) => {
          e.preventDefault();
          const q = projectSearch.trim();
          if (!q) { setSearchResults([]); return; }
          const r = await fetch("/api/projects/" + project.id + "/search?q=" + encodeURIComponent(q));
          if (r.ok) setSearchResults((await r.json()).results ?? []);
        }} className="flex gap-2">
          <input value={projectSearch} onChange={(e) => setProjectSearch(e.target.value)} placeholder="Search this project…" className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm" />
          <button className="rounded-lg border px-3 text-sm hover:bg-accent">Search</button>
        </form>
        {searchResults.length > 0 ? <div className="rounded-lg border p-2">{searchResults.map((r) => <div key={r.kind + "-" + r.id} className="px-2 py-1.5 text-xs"><span className="mr-2 rounded bg-muted px-1.5 py-0.5">{r.kind}</span>{r.title}</div>)}</div> : null}
      </section>

      <section className="mt-8 space-y-2 pb-10">
        <h2 className="text-sm font-semibold">Project Instructions</h2>
        <p className="text-xs text-muted-foreground">Added to the system prompt for every chat in this project and automation.</p>
        <textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={5} placeholder="e.g. Always answer as a legal assistant; cite the relevant act." className="w-full resize-y rounded-lg border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm" />
        <div className="flex items-center gap-3">
          <button onClick={saveInstructions} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">Save instructions</button>
          {instrMsg ? <span className="text-xs text-muted-foreground">{instrMsg}</span> : null}
        </div>
      </section>
    </main>
  );
}
