"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Laptop, ShieldCheck, PlugZap, RefreshCcw, Trash2 } from "lucide-react";
type Device = { id: string; name: string; online: boolean; revoked: boolean; lastSeenAt: string | null };
type Job = { id: string; deviceId: string; tool: string; args: Record<string, unknown>; status: string; result: Record<string, unknown> | null; createdAt: string; expiresAt: string };
export default function HhcDevicesPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [commands, setCommands] = useState<Job[]>([]);
  const [code, setCode] = useState("");
  const [pilotEnabled, setPilotEnabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [working, setWorking] = useState(false);
  const [tool, setTool] = useState("system_info");
  const [deviceId, setDeviceId] = useState("");
  const [path, setPath] = useState("");
  const refresh = useCallback(async () => {
    const [d, c] = await Promise.all([
      fetch("/api/hhc/devices", { cache: "no-store" }), fetch("/api/hhc/commands", { cache: "no-store" }),
    ]);
    if (d.ok) { const data = await d.json(); setDevices(data.devices ?? []); setPilotEnabled(data.enabled === true); }
    if (c.ok) setCommands((await c.json()).commands ?? []);
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 7000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function call(url: string, method: "POST" | "DELETE", body?: Record<string, unknown>) {
    setWorking(true); setNotice("");
    try {
      const response = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const value = await response.json();
      if (!response.ok) throw Error(value.error || "Request failed");
      await refresh();
      return value;
    } catch (e) { setNotice(e instanceof Error ? e.message : "Request failed"); return null; }
    finally { setWorking(false); }
  }
  async function pair() {
    const result = await call("/api/hhc/devices", "POST");
    if (result) setCode(result.pairingCode);
  }
  async function submitCommand() {
    if (!deviceId) return setNotice("Select your connected computer");
    const args = tool === "system_info" ? {} : tool === "run_command" ? { command: path } : { [tool === "git_status" ? "repo" : "path"]: path };
    const result = await call("/api/hhc/commands", "POST", { deviceId, tool, args });
    if (result) setNotice(result.status === "pending_approval" ? "Command needs your approval below, followed by local Mac approval." : "Command queued to your computer.");
  }
  return <main className="mx-auto max-w-4xl space-y-7 px-4 py-8 text-foreground sm:px-8">
    <header className="flex items-center justify-between gap-3">
      <div><Link href="/" className="text-xs text-muted-foreground hover:underline">← HajiHaz AI</Link>
      <h1 className="mt-2 text-3xl font-semibold">My computers</h1>
      <p className="mt-1 text-sm text-muted-foreground">Control only computers paired to your own account.</p></div>
      <Laptop className="size-9 text-primary" />
    </header>
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-start gap-3"><ShieldCheck className="mt-1 size-5 text-green-600"/>
      <div><h2 className="font-semibold">Connect a Mac</h2><p className="text-sm text-muted-foreground">Install HajiHaz Commander on your own Mac, then pair it with a one-time code. Never share your code with another person.</p></div></div>
      {!pilotEnabled && <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">Customer HHC is in a controlled pilot. Pairing is disabled until security and physical-device acceptance are complete.</p>}
      <button disabled={working || !pilotEnabled} onClick={pair} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Generate pairing code</button>
      {code && <div className="mt-4 rounded-xl border bg-muted p-4">
        <p className="text-sm font-medium">One-time code · valid for 5 minutes</p>
        <code className="mt-2 block break-all rounded-md bg-background p-3 text-xs">{code}</code>
        <button className="mt-3 text-sm underline" onClick={() => void navigator.clipboard.writeText(code)}>Copy pairing code</button>
        <p className="mt-3 text-xs text-muted-foreground">On the Mac with HHC installed, run the customer connector using this code and your HajiHaz AI server URL. Pairing creates a device-specific credential stored locally in macOS Keychain.</p>
      </div>}
    </section>
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Paired devices</h2><button className="text-sm underline" onClick={() => void refresh()}><RefreshCcw className="inline size-4"/> Refresh</button></div>
      {!devices.length && <p className="text-sm text-muted-foreground">No Mac paired yet. Your account cannot run computer commands until you pair one.</p>}
      <div className="space-y-3">{devices.map(d => <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border p-3">
        <div><p className="font-medium">{d.name}</p><p className="text-xs text-muted-foreground">{d.revoked ? "Revoked" : d.online ? "Online" : "Offline"} · {d.id.slice(0, 8)}</p></div>
        {!d.revoked && <button disabled={working} onClick={async () => { if (window.confirm("Revoke this Mac and immediately block new commands?")) await call("/api/hhc/devices/"+d.id, "DELETE"); }} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-xs text-red-600"><Trash2 className="size-4" /> Revoke</button>}
      </div>)}</div>
    </section>
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><PlugZap className="size-4"/> Run an authorized tool</h2>
      <p className="mb-4 text-xs text-muted-foreground">Account approval is required for file and terminal commands. Your Mac asks again before executing them locally.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs">Computer<select className="w-full rounded-lg border bg-background p-2 text-sm" value={deviceId} onChange={e => setDeviceId(e.target.value)}><option value="">Select paired Mac</option>{devices.filter(x=>x.online&&!x.revoked).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label className="space-y-1 text-xs">Tool<select className="w-full rounded-lg border bg-background p-2 text-sm" value={tool} onChange={e => setTool(e.target.value)}><option value="system_info">System information</option><option value="git_status">Git status</option><option value="list_directory">List files</option><option value="read_file">Read a file</option><option value="run_command">Terminal command (approval required)</option></select></label>
      </div>
      {tool !== "system_info" && <label className="mt-3 block space-y-1 text-xs">{tool === "run_command" ? "Command" : "Absolute path"}<input className="w-full rounded-lg border bg-background p-2 text-sm" value={path} onChange={e=>setPath(e.target.value)} placeholder={tool === "run_command" ? "git status" : "/Users/you/projects"} /></label>}
      <button disabled={working || !pilotEnabled} onClick={() => void submitCommand()} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Request operation</button>
    </section>
    <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-3 font-semibold">Execution requests</h2>
      {!commands.length && <p className="text-sm text-muted-foreground">No commands yet.</p>}
      <div className="space-y-3">{commands.map(c => <div key={c.id} className="rounded-lg border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">{c.tool} <span className="ml-2 text-xs font-normal text-muted-foreground">· {c.status}</span></p>
        {c.status === "pending_approval" && new Date(c.expiresAt) > new Date() && <div className="flex gap-2"><button disabled={working} onClick={() => void call("/api/hhc/commands/"+c.id, "POST", {action:"approve"})} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">Approve</button><button disabled={working} onClick={() => void call("/api/hhc/commands/"+c.id, "POST", {action:"deny"})} className="rounded-md border px-2 py-1 text-xs">Deny</button></div>}</div>
        <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs" aria-label="Exact command arguments">{JSON.stringify(c.args, null, 2)}</pre>
        {c.status === "pending_approval" && <p className="mt-2 text-xs text-muted-foreground">Review every argument before approving. Your Mac will ask again locally.</p>}
        {c.result && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">{JSON.stringify(c.result, null, 2)}</pre>}
      </div>)}</div>
    </section>
    {notice && <p role="alert" className="rounded-lg border p-3 text-sm">{notice}</p>}
  </main>;
}