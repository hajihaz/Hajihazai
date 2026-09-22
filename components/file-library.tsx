"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Image as ImageIcon, Paperclip, Search, Trash2, X } from "lucide-react";

type Doc = { id:string; title:string; sourceType:string; status:string; originalName?:string|null; mimeType?:string|null; byteSize?:number|null; createdAt?:string; updatedAt?:string };
export default function FileLibrary({ open, conversationId, onClose, onAttached }: { open:boolean; conversationId:string|null; onClose:()=>void; onAttached?:(doc:Doc)=>void }) {
  const [docs,setDocs]=useState<Doc[]>([]); const [q,setQ]=useState(""); const [busy,setBusy]=useState(false); const [preview,setPreview]=useState<{doc:Doc;content?:string|null;dataUrl?:string|null}|null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  async function load(query="") { const r=await fetch(`/api/knowledge${query?`?q=${encodeURIComponent(query)}`:""}`); if(r.ok) setDocs((await r.json()).documents??[]); }
  useEffect(()=>{
    if(!open) return;
    void load();
    const onKey=(e:KeyboardEvent)=>{ if(e.key==="Escape"){e.preventDefault(); if(preview) setPreview(null); else onClose();} };
    document.addEventListener("keydown",onKey);
    window.setTimeout(()=>searchRef.current?.focus(),0);
    return ()=>document.removeEventListener("keydown",onKey);
  },[open]);
  if(!open) return null;
  async function attach(doc:Doc) { if(!conversationId) return; setBusy(true); try { const r=await fetch(`/api/conversations/${conversationId}/attachments`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({documentId:doc.id})}); if(r.ok) onAttached?.(doc); } finally {setBusy(false);} }
  async function remove(doc:Doc) { if(!confirm(`Delete “${doc.title}”? This removes it from your library and conversations.`)) return; const r=await fetch(`/api/knowledge/${doc.id}`,{method:"DELETE"}); if(r.ok){setDocs(d=>d.filter(x=>x.id!==doc.id)); if(preview?.doc.id===doc.id)setPreview(null);} }
  async function openPreview(doc:Doc){const r=await fetch(`/api/knowledge/${doc.id}`);if(r.ok){const d=await r.json();setPreview({doc,...d.preview});}}
  const size=(n?:number|null)=>n==null?"—":n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(1)} MB`;
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-6" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section role="dialog" aria-modal="true" aria-labelledby="file-library-title" className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
      <header className="flex items-center gap-3 border-b px-4 py-3"><Paperclip className="size-5"/><div className="min-w-0 flex-1"><h2 id="file-library-title" className="font-semibold">File Library</h2><p className="text-xs text-muted-foreground">Your server-backed files · reuse across conversations</p></div><button onClick={onClose} aria-label="Close file library" className="rounded-lg p-2 hover:bg-accent"><X className="size-4"/></button></header>
      <div className="border-b p-3"><form onSubmit={e=>{e.preventDefault();void load(q)}} className="flex gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground"/><input ref={searchRef} aria-label="Search files" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search files…" className="w-full rounded-lg border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"/></div><button className="rounded-lg border px-3 text-sm hover:bg-accent">Search</button></form></div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{docs.length===0?<p className="py-12 text-center text-sm text-muted-foreground">No files found.</p>:<div className="space-y-2">{docs.map(d=><div key={d.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">{d.sourceType==="image"?<ImageIcon className="size-4"/>:<FileText className="size-4"/>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{d.title}</p><p className="text-xs text-muted-foreground">{d.originalName??d.sourceType} · {size(d.byteSize)} · {d.status}</p></div><button onClick={()=>void openPreview(d)} className="rounded-lg border px-2.5 py-1.5 text-xs hover:bg-accent">Preview</button>{conversationId?<button disabled={busy} onClick={()=>void attach(d)} className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Attach</button>:null}<button onClick={()=>void remove(d)} aria-label={`Delete ${d.title}`} className="rounded-lg p-2 text-muted-foreground hover:text-destructive"><Trash2 className="size-4"/></button></div>)}</div>}</div>
      {preview?<div className="border-t bg-muted/20 p-3"><div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Preview · {preview.doc.title}</span><button onClick={()=>setPreview(null)} aria-label="Close preview"><X className="size-4"/></button></div>{preview.dataUrl?<img src={preview.dataUrl} alt={preview.doc.title} className="max-h-64 max-w-full rounded-lg border object-contain"/>:<pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border bg-background p-3 text-xs">{preview.content||"No text preview available."}</pre>}</div>:null}
    </section>
  </div>;
}
