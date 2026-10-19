"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleHelp, Laptop, LockKeyhole, RefreshCw, ShieldCheck, Wifi, WifiOff, XCircle } from "lucide-react";

type Device = { id: string; name: string; online: boolean; revoked: boolean; lastSeenAt: string | null };
type Job = { id: string; deviceId: string; tool: string; args: Record<string, unknown>; status: string; result: Record<string, unknown> | null; createdAt: string; expiresAt: string };

export default function HhcDevicesPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [commands, setCommands] = useState<Job[]>([]);
  const [pilotEnabled, setPilotEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [code, setCode] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [tool, setTool] = useState("system_info");
  const [argument, setArgument] = useState("");

  const refresh = useCallback(async () => {
    const [deviceRes, jobRes] = await Promise.all([
      fetch("/api/hhc/devices", { cache: "no-store" }),
      fetch("/api/hhc/commands", { cache: "no-store" }),
    ]);
    if (deviceRes.ok) {
      const result = await deviceRes.json();
      setDevices(result.devices ?? []);
      setPilotEnabled(result.enabled === true);
    }
    if (jobRes.ok) setCommands((await jobRes.json()).commands ?? []);
    setReady(true);
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [refresh]);

  const active = useMemo(() => devices.filter(d => !d.revoked), [devices]);
  const online = useMemo(() => active.filter(d => d.online), [active]);
  // A returning customer with one online Mac never selects or pairs again.
  const effectiveId = online.length === 1 ? online[0].id :
    online.some(d => d.id === selectedId) ? selectedId : "";
  const connected = online.length > 0 && pilotEnabled;

  async function request(url: string, method: "POST" | "DELETE", payload?: Record<string, unknown>) {
    setWorking(true);
    setNotice("");
    try {
      const response = await fetch(url, {
        method,
        headers: payload ? { "content-type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Request failed");
      await refresh();
      return result;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Request failed");
      return null;
    } finally { setWorking(false); }
  }

  async function createLink() {
    const result = await request("/api/hhc/devices", "POST");
    if (result?.pairingCode) setCode(result.pairingCode);
  }
  async function command() {
    if (!effectiveId) return setNotice("Choose an online computer first");
    const args = tool === "system_info" ? {} : tool === "run_command"
      ? { command: argument } : { [tool === "git_status" ? "repo" : "path"]: argument };
    const result = await request("/api/hhc/commands", "POST", { deviceId: effectiveId, tool, args });
    if (result) setNotice(result.status === "pending_approval"
      ? "Review the operation below. Your Mac will ask for its own approval."
      : "Sent to your connected Mac. The result will appear here.");
  }

  return <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 text-foreground sm:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Link href="/" className="text-xs text-muted-foreground hover:underline">← Back to HajiHaz AI</Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">My Computer</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ask HajiHaz AI to work with your own Mac.</p>
      </div>
      <button onClick={() => void refresh()} aria-label="Refresh connection" className="rounded-full border p-2.5 hover:bg-accent"><RefreshCw className="size-4"/></button>
    </header>

    <section className="rounded-2xl border bg-card p-5" aria-label="Computer connection status">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-muted p-3"><Laptop className="size-6"/></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{!ready ? "Checking your computer…" : connected ? "Your Mac is connected" : active.length ? "Your Mac is offline" : "No computer connected"}</h2>
            {connected ? <CheckCircle2 className="size-4 text-emerald-600"/> : <WifiOff className="size-4 text-muted-foreground"/>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {connected ? "HHC is available automatically whenever this authorized Mac is running."
              : active.length ? "Start the installed HHC connector on your Mac. You do not need to pair it again."
              : "The first connection requires installing and authorizing HHC on your own Mac. After that, it reconnects automatically."}
          </p>
        </div>
      </div>
      {connected && <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Chat with HajiHaz AI <ArrowRight className="size-4"/></Link>
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300"><Wifi className="size-3.5"/> Automatically available</span>
      </div>}
      {active.length > 1 && <div className="mt-4 space-y-1">
        <label htmlFor="customer-mac" className="text-xs">Choose your computer</label>
        <select id="customer-mac" className="w-full rounded-lg border bg-background px-3 py-2 text-sm" value={effectiveId} onChange={e => setSelectedId(e.target.value)}>
          <option value="">Select your Mac</option>{online.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>}
    </section>

    {!active.length && <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center gap-2"><ShieldCheck className="size-5 text-emerald-600"/><h2 className="font-semibold">First-time setup</h2></div>
      <p className="mt-2 text-sm text-muted-foreground">Only once per Mac. Install the HHC companion on that computer, authorize it to use this account, then enable its automatic startup. No pairing again after future logins.</p>
      {!pilotEnabled && <p className="mt-3 rounded-lg bg-muted p-3 text-sm text-muted-foreground" role="status">Customer HHC is being verified in a private Mac pilot. First-time connections are not yet enabled for public accounts.</p>}
      {pilotEnabled && <>
        <button onClick={() => setSetupOpen(v => !v)} className="mt-3 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent">{setupOpen ? "Hide first-time setup" : "Set up HHC on my Mac"}</button>
        {setupOpen && <div className="mt-3 space-y-3 rounded-xl bg-muted p-4">
          <p className="text-sm">On your own Mac, install the HHC companion first. A secure one-time authorization connects it to this account.</p>
          <button disabled={working} onClick={() => void createLink()} className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Create one-time connection key</button>
          {code && <div className="space-y-2"><p className="text-xs">Use this key in HHC on that Mac within five minutes. You will not need it again after successful setup.</p>
            <code className="block break-all rounded-md border bg-background p-3 text-xs">{code}</code>
            <button onClick={() => void navigator.clipboard.writeText(code)} className="text-xs underline">Copy key</button>
          </div>}
        </div>}
      </>}
    </section>}

    {!!active.length && <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold">Your authorized devices</h2>
      <div className="space-y-3">{active.map(d => <div key={d.id} className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">{d.online ? <Wifi className="size-4 text-emerald-600"/> : <WifiOff className="size-4 text-muted-foreground"/>}
          <span>{d.name}</span><span className="text-xs text-muted-foreground">{d.online ? "Online" : "Offline"}</span>
        </div>
        <button disabled={working} onClick={() => { if (window.confirm("Disconnect and revoke this Mac permanently?")) void request("/api/hhc/devices/" + d.id,"DELETE"); }}
          className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-50"><XCircle className="size-3.5"/> Revoke</button>
      </div>)}</div>
    </section>}

    {connected && <section className="rounded-2xl border bg-card p-5">
      <button onClick={() => setAdvanced(v => !v)} aria-expanded={advanced} className="flex w-full items-center justify-between text-left text-sm font-semibold">
        Advanced computer tools <CircleHelp className="size-4 text-muted-foreground"/>
      </button>
      {advanced && <div className="mt-4 space-y-3">
        <p className="text-xs text-muted-foreground">Normally, just ask HajiHaz AI in chat. For direct operations, account and Mac approval still apply.</p>
        <label className="block text-xs">Operation
          <select className="mt-1 w-full rounded-lg border bg-background p-2 text-sm" value={tool} onChange={e => setTool(e.target.value)}>
            <option value="system_info">Mac status</option><option value="git_status">Git status</option>
            <option value="list_directory">List files</option><option value="read_file">Read a file</option>
            <option value="run_command">Terminal command (requires approval)</option>
          </select>
        </label>
        {tool !== "system_info" && <label className="block text-xs">{tool === "run_command" ? "Command" : "Absolute path"}
          <input className="mt-1 w-full rounded-lg border bg-background p-2 text-sm" value={argument} onChange={e=>setArgument(e.target.value)} placeholder={tool==="run_command"?"git status":"/Users/you/Projects"} />
        </label>}
        <button disabled={working || !pilotEnabled || !effectiveId} onClick={() => void command()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">Request operation</button>
      </div>}
    </section>}

    {!!commands.length && <section className="rounded-2xl border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold">Recent requests</h2>
      <div className="space-y-3">{commands.map(c=><div key={c.id} className="rounded-lg border p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{c.tool} <span className="text-xs font-normal text-muted-foreground">· {c.status}</span></span>
          {pilotEnabled && c.status==="pending_approval" && new Date(c.expiresAt)>new Date() &&
          <div className="flex gap-2"><button disabled={working} onClick={()=>void request("/api/hhc/commands/"+c.id,"POST",{action:"approve"})} className="rounded-lg bg-primary px-3 py-1 text-xs text-primary-foreground">Approve</button>
          <button disabled={working} onClick={()=>void request("/api/hhc/commands/"+c.id,"POST",{action:"deny"})} className="rounded-lg border px-3 py-1 text-xs">Deny</button></div>}
        </div>
        <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs" aria-label="Full command arguments">{JSON.stringify(c.args,null,2)}</pre>
        {c.result && <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">{JSON.stringify(c.result,null,2)}</pre>}
      </div>)}</div>
    </section>}

    <div className="flex items-start gap-2 text-xs text-muted-foreground"><LockKeyhole className="mt-0.5 size-4 shrink-0"/>
      Each HHC agent belongs to its own account. Your Mac never becomes another user's computer.
    </div>
    {notice && <p role="alert" className="rounded-xl border p-3 text-sm">{notice}</p>}
  </main>;
}
