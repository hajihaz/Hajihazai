"use client";

import { useEffect, useRef, useState } from "react";
import { Download, FilePenLine, FileText, Loader2, Sparkles, Upload, X } from "lucide-react";

export default function PdfStudio({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [source, setSource] = useState<File | null>(null);
  const [reference, setReference] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"edit" | "reference">("edit");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const sourceRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!open) return; setError(null); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);
  if (!open) return null;

  const choose = (file: File | null, kind: "source" | "reference") => {
    if (!file) return;
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) { setError("Please upload a PDF file."); return; }
    if (file.size > 12 * 1024 * 1024) { setError("Each PDF must be 12MB or smaller."); return; }
    kind === "source" ? setSource(file) : setReference(file);
  };

  const generate = async () => {
    if (!source || !prompt.trim() || busy) return;
    if (mode === "reference" && !reference) { setError("Add a reference PDF for reference mode."); return; }
    setBusy(true); setReady(false); setError(null);
    try {
      const form = new FormData();
      form.append("source", source);
      if (reference) form.append("reference", reference);
      form.append("prompt", prompt.trim());
      const res = await fetch("/api/pdf/edit", { method: "POST", body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "PDF generation failed. Please try again.");
      }
      const blob = await res.blob();
      if (!blob.size) throw new Error("The generated PDF was empty.");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = source.name.replace(/\.pdf$/i, "") + "-hajihaz-edited.pdf"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setReady(true);
    } catch (e) { setError(e instanceof Error ? e.message : "PDF generation failed."); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label="PDF Studio">
      <div className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl">
        <header className="flex items-center gap-3 border-b px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><FilePenLine className="size-5" /></div>
          <div className="min-w-0 flex-1"><h2 className="text-base font-semibold">PDF Studio</h2><p className="text-xs text-muted-foreground">Edit a PDF or use another PDF as the visual and structural reference.</p></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="Close PDF Studio" className="flex size-9 items-center justify-center rounded-xl hover:bg-accent disabled:opacity-40"><X className="size-4" /></button>
        </header>
        <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
          <div className="mb-5 grid grid-cols-2 rounded-xl border p-1">
            <button type="button" onClick={() => setMode("edit")} aria-pressed={mode === "edit"} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "edit" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>Edit / transform</button>
            <button type="button" onClick={() => setMode("reference")} aria-pressed={mode === "reference"} className={`rounded-lg px-3 py-2 text-sm font-medium ${mode === "reference" ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>Use reference PDF</button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <FileDrop label="Source PDF" file={source} onClick={() => sourceRef.current?.click()} onChange={(f) => choose(f, "source")} inputRef={sourceRef} />
            <FileDrop label={mode === "reference" ? "Reference PDF" : "Reference PDF (optional)"} file={reference} onClick={() => referenceRef.current?.click()} onChange={(f) => choose(f, "reference")} inputRef={referenceRef} />
          </div>
          <div className="mt-6">
            <label htmlFor="pdf-studio-prompt" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What should HajiHaz do?</label>
            <textarea id="pdf-studio-prompt" value={prompt} onChange={e => setPrompt(e.target.value.slice(0,8000))} disabled={busy} className="mt-2 min-h-36 w-full resize-y rounded-2xl border bg-background px-4 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring" placeholder={mode === "reference" ? "Create a new PDF using the reference's layout, hierarchy and styling. Replace its topic with: ... Keep the same page structure and professional formatting." : "Change only the topic line to ... Keep the rest unchanged. Or rewrite section 3, add a conclusion, fix the name, remove page 4, and keep the original structure."} />
            <div className="mt-1 text-right text-[10px] text-muted-foreground">{prompt.length}/8000</div>
          </div>
          <div className="mt-5 rounded-2xl border bg-muted/30 p-4">
            <div className="flex gap-3"><Sparkles className="mt-0.5 size-4 shrink-0" /><div className="text-xs leading-5 text-muted-foreground"><strong className="text-foreground">Prompt-driven document editing.</strong> HajiHaz reads the supplied PDF, follows your exact instruction, and rebuilds a clean downloadable PDF. With a reference, it uses the reference's hierarchy, density, page size and document architecture for the new content.</div></div>
          </div>
          {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">{error}</p>}
          {ready && <div className="mt-4 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm"><FileText className="size-4" /><span className="flex-1">PDF generated and downloaded.</span><Download className="size-4 text-muted-foreground" /></div>}
        </div>
        <footer className="flex flex-col-reverse gap-2 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-muted-foreground">PDFs up to 12MB each · 20MB combined</p>
          <button type="button" onClick={generate} disabled={busy || !source || !prompt.trim()} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">{busy ? <><Loader2 className="size-4 animate-spin" />Building PDF…</> : <><Upload className="size-4" />Generate & download PDF</>}</button>
        </footer>
      </div>
    </div>
  );
}

function FileDrop({ label, file, onClick, onChange, inputRef }: { label: string; file: File | null; onClick: () => void; onChange: (f: File | null) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
  return <div><div className="mb-2 text-xs font-semibold text-muted-foreground">{label}</div><button type="button" onClick={onClick} className="flex min-h-28 w-full flex-col items-center justify-center rounded-2xl border border-dashed px-4 py-4 text-center hover:bg-accent">{file ? <><FileText className="mb-2 size-7" /><span className="max-w-full truncate text-sm font-medium">{file.name}</span><span className="mt-1 text-[10px] text-muted-foreground">{(file.size/1024/1024).toFixed(1)} MB · click to replace</span></> : <><Upload className="mb-2 size-6 text-muted-foreground" /><span className="text-sm font-medium">Upload PDF</span><span className="mt-1 text-[10px] text-muted-foreground">Click to choose a PDF</span></>}</button><input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { onChange(e.target.files?.[0] ?? null); e.currentTarget.value=""; }} /></div>;
}
