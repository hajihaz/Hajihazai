"use client";

import { useMemo, useState } from "react";
import { Folder, FolderPlus, Search, Trash2, Pencil, ArrowRight, X } from "lucide-react";

type Project = {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  isSystem?: boolean;
  updatedAt?: string;
};

export default function ProjectsDashboard({ initialProjects }: { initialProjects: Project[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => (p.name + " " + (p.description ?? "")).toLowerCase().includes(q));
  }, [projects, query]);

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setMessage("");
    setCreating(true);
  }

  function openEdit(project: Project) {
    setEditing(project);
    setName(project.name);
    setDescription(project.description ?? "");
    setMessage("");
    setCreating(true);
  }
  async function saveProject() {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage("Project name is required.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const url = editing ? "/api/projects/" + editing.id : "/api/projects";
      const method = editing ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, description }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.project) {
        setMessage(data?.error ?? "Couldn't save the project.");
        return;
      }
      setProjects((prev) => {
        if (editing) return prev.map((p) => (p.id === editing.id ? { ...p, ...data.project } : p));
        return [data.project, ...prev];
      });
      setCreating(false);
    } catch {
      setMessage("Couldn't reach HajiHaz AI.");
    } finally {
      setBusy(false);
    }
  }

  async function removeProject(project: Project) {
    if (project.isSystem) return;
    if (!window.confirm("Delete “" + project.name + "”? Its chats will be moved back to Recent Chats.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/projects/" + project.id, { method: "DELETE" });
      if (!res.ok) {
        setMessage("Couldn't delete the project.");
        return;
      }
      setProjects((prev) => prev.filter((p) => p.id !== project.id));
    } catch {
      setMessage("Couldn't delete the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">HajiHaz AI</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Keep chats, files, memory, instructions, artifacts, and automations together in focused workspaces.
            </p>
          </div>
          <button onClick={openCreate} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
            <FolderPlus className="size-4" /> New project
          </button>
        </header>

        <div className="mt-7 flex items-center gap-2 rounded-xl border bg-muted/20 px-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects…"
            aria-label="Search projects"
            className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
          {query ? <button onClick={() => setQuery("")} aria-label="Clear project search" className="rounded-md p-1.5 hover:bg-accent"><X className="size-4" /></button> : null}
        </div>

        {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((project) => (
            <article key={project.id} className="group flex min-h-48 flex-col rounded-2xl border p-4 transition hover:border-foreground/20 hover:shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <Folder className="size-5 text-muted-foreground" />
                </div>
                {project.isSystem ? <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary">Global</span> : null}
              </div>
              <h2 className="mt-4 truncate font-semibold">{project.name}</h2>
              <p className="mt-1 line-clamp-3 min-h-[3.75rem] text-sm text-muted-foreground">
                {project.description || "No description yet."}
              </p>
              <div className="mt-auto flex items-center gap-1 pt-4">
                <a href={"/projects/" + project.id} className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg bg-muted px-3 text-sm font-medium hover:bg-accent">
                  Open <ArrowRight className="size-4" />
                </a>
                {!project.isSystem ? (
                  <>
                    <button onClick={() => openEdit(project)} aria-label={"Edit " + project.name} title="Edit project" className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
                      <Pencil className="size-4" />
                    </button>
                    <button onClick={() => void removeProject(project)} disabled={busy} aria-label={"Delete " + project.name} title="Delete project" className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive disabled:opacity-40">
                      <Trash2 className="size-4" />
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </section>
        {filtered.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed px-6 py-12 text-center">
            <Folder className="mx-auto size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">{query ? "No matching projects" : "No projects yet"}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {query ? "Try another search." : "Create a project to give a set of chats and context a home."}
            </p>
            {!query ? <button onClick={openCreate} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Create your first project</button> : null}
          </div>
        ) : null}

        {creating ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={editing ? "Edit project" : "Create project"}>
            <div className="w-full max-w-md rounded-2xl border bg-background p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{editing ? "Edit project" : "Create project"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{editing ? "Update the workspace details." : "Give your workspace a clear name and optional description."}</p>
                </div>
                <button onClick={() => setCreating(false)} aria-label="Close" className="rounded-lg p-2 hover:bg-accent"><X className="size-4" /></button>
              </div>
              <label className="mt-5 block text-sm font-medium">Name
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus onKeyDown={(e) => { if (e.key === "Enter") void saveProject(); }} className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring" />
              </label>
              <label className="mt-4 block text-sm font-medium">Description
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} rows={4} placeholder="What is this project about?" className="mt-1.5 w-full resize-y rounded-lg border bg-background px-3 py-2.5 outline-none focus:ring-2 focus:ring-ring" />
              </label>
              {message ? <p className="mt-3 text-sm text-destructive">{message}</p> : null}
              <div className="mt-5 flex justify-end gap-2">
                <button onClick={() => setCreating(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>
                <button onClick={() => void saveProject()} disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
                  {busy ? "Saving…" : editing ? "Save changes" : "Create project"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
