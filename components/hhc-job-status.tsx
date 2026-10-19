"use client";
import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, LoaderCircle, XCircle } from "lucide-react";

type HhcCommand = {
  id: string; deviceId: string; tool: string;
  args: Record<string, unknown>; status: string;
  result: Record<string, unknown> | null; expiresAt: string; finishedAt: string | null;
};
const terminalStates = new Set(["succeeded", "failed", "denied", "cancelled", "expired"]);
function describeStatus(status: string) {
  switch(status) {
    case "pending_approval": return "Waiting for your approval";
    case "queued": return "Queued on your Mac";
    case "running": return "Waiting for Mac approval or execution";
    case "succeeded": return "Completed on your Mac";
    case "failed": return "Mac reported failure";
    case "denied": return "Request denied";
    case "cancelled": return "Cancelled before execution";
    case "expired": return "Request expired";
    default: return "Checking HHC status";
  }
}
export default function HhcJobStatus({ commandId, deviceName }: { commandId: string; deviceName?: string | null }) {
  const [command, setCommand] = useState<HhcCommand | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshCount, setRefreshCount] = useState(0);
  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(commandId)) return;
    let live = true;
    let handle: ReturnType<typeof setTimeout> | null = null;
    const load = async () => {
      try {
        const response = await fetch("/api/hhc/commands/" + encodeURIComponent(commandId), {cache:"no-store"});
        if (!response.ok) {
          if (response.status === 401 || response.status === 403 || response.status === 404) {
            if (live) setError("Command unavailable or access denied for this account");
            return; // Permanent denial; never keep polling a forbidden ID.
          }
          throw Error("Connection temporarily unavailable");
        }
        const data = await response.json();
        if (!live) return;
        const item = data.command as HhcCommand;
        if (item.id !== commandId) throw Error("Command identity mismatch");
        setCommand(item); setError("");
        if (!terminalStates.has(item.status)) handle = setTimeout(load, 3500);
      } catch (e) {
        if (!live) return;
        setError(e instanceof Error ? e.message : "Unable to read Mac status");
        handle = setTimeout(load, 8000);
      }
    };
    void load();
    return () => { live = false; if (handle) clearTimeout(handle); };
  }, [commandId, refreshCount]);

  async function action(choice: "approve" | "deny" | "cancel") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/hhc/commands/" + encodeURIComponent(commandId), {
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({action:choice}),
      });
      if (!response.ok) {
        const body = await response.json().catch(()=>({}));
        throw Error(body.error || "Action unavailable");
      }
      setRefreshCount(c => c + 1);
    } catch(e) { setError(e instanceof Error ? e.message : "Action denied"); }
    finally { setBusy(false); }
  }

  const status = command?.status || "loading";
  const resultString = command?.result ? JSON.stringify(command.result, null, 2) : null;
  const bounded = resultString && resultString.length > 18000
    ? resultString.slice(0,18000) + "\n[Visible output limited to 18,000 characters]"
    : resultString;
  const canCancel = status === "pending_approval" || status === "queued";
  return <section className="mt-3 max-w-2xl rounded-xl border bg-card p-3 text-sm" aria-label="HHC computer execution">
    <div className="flex flex-wrap items-center gap-2">
      {status === "succeeded" ? <CheckCircle2 className="size-4 text-emerald-600"/> :
        ["failed","denied","cancelled","expired"].includes(status) ? <XCircle className="size-4 text-red-500"/> :
        status === "loading" ? <LoaderCircle className="size-4 animate-spin"/> : <Clock3 className="size-4 text-amber-600"/>}
      <strong>{describeStatus(status)}</strong>
      <span className="text-xs text-muted-foreground">{deviceName || "Your Mac"}</span>
    </div>
    {command && <p className="mt-2 text-xs text-muted-foreground">Tool: {command.tool} · Request: {command.id.slice(0,8)}</p>}
    {command && status === "pending_approval" && <>
      <p className="mt-2 text-xs">Review the exact arguments. After approval here, your Mac will ask again locally.</p>
      <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">{JSON.stringify(command.args,null,2)}</pre>
    </>}
    {(status === "queued" || status === "running") && <p className="mt-2 text-xs text-muted-foreground">
      {status === "queued" ? "Waiting for the paired Mac to pick up this request." : "Waiting for a verified response from the paired Mac."} Never assume completion until the device confirms it.
    </p>}
    {(status === "failed" || status === "expired") && <p className="mt-2 text-xs text-muted-foreground">Failed or expired requests are never silently replayed. Send a fresh instruction to try again.</p>}
    {bounded && <details className="mt-2" open>
      <summary className="cursor-pointer text-xs font-semibold">Verified device result</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted p-2 text-xs">{bounded}</pre>
    </details>}
    {(canCancel || status === "pending_approval") && <div className="mt-3 flex flex-wrap gap-2">
      {status === "pending_approval" && <>
        <button disabled={busy} onClick={() => void action("approve")} className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50">Approve request</button>
        <button disabled={busy} onClick={() => void action("deny")} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50">Deny</button>
      </>}
      {canCancel && <button disabled={busy} onClick={() => void action("cancel")} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50">Cancel before execution</button>}
    </div>}
    {error && <p role="alert" className="mt-2 flex items-center gap-1 text-xs text-destructive"><AlertCircle className="size-3.5"/>{error}</p>}
  </section>;
}
