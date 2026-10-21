"use client";

import { useEffect, useState } from "react";

type Report = {
  generatedAt: string;
  scope: string;
  summary: Record<string, number>;
  daily: Array<{date:string; views:number; visits:number; taps:number; visitors:number; activeMinutes:number}>;
  topPages: Array<{path:string;views:number}>;
  topTaps: Array<{target:string;taps:number}>;
  customerDaily: Array<{date:string; userId:string; customer:string; visits:number;views:number}>;
};

const CARDS: Array<[string,string]> = [
  ["Visits today (24h)","visits24h"],
  ["Visits · 7 days","visits7d"],
  ["Visits · 30 days","visits30d"],
  ["Page views · 7 days","views7d"],
  ["Page views · 30 days","views30d"],
  ["Unique visitors · 7 days","visitors7d"],
  ["Taps · 7 days","taps7d"],
  ["Active minutes · 7 days","activeMinutes7d"],
];

export default function VisitorTrafficPanel() {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  async function refresh() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/visitor-analytics",{cache:"no-store"});
      if (!res.ok) throw new Error(res.status===401?"Admin session expired":"Analytics unavailable");
      const body = await res.json();
      setData(body);
      setError("");
    } catch(e) {
      setError(e instanceof Error ? e.message : "Unable to load activity");
    } finally { setBusy(false); }
  }
  useEffect(() => {
    void refresh();
    const interval = window.setInterval(()=>{ if (document.visibilityState==="visible") void refresh(); },60_000);
    return () => clearInterval(interval);
  }, []);

  const max = Math.max(1,...(data?.daily || []).map(d=>d.views));
  return (
    <section className="mt-4 space-y-5" aria-label="Customer activity analytics">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">Customer activity</h3>
          <p className="text-xs text-muted-foreground">Consenting visitors only · Page views, repeat sessions, navigation and active time</p>
        </div>
        <button type="button" onClick={()=>void refresh()} disabled={busy}
          className="rounded-lg border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50">
          {busy?"Refreshing…":"Refresh"}
        </button>
      </div>
      {error && <p role="alert" className="rounded-lg border border-amber-500/30 p-3 text-sm">{error}{!data?" — No data is displayed until the backend is verified.":""}</p>}
      {!data ? (busy?<p className="text-sm text-muted-foreground">Loading customer analytics…</p>:null) : <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {CARDS.map(([title,key])=><article className="rounded-2xl border bg-card p-4" key={key}>
            <p className="text-xs text-muted-foreground">{title}</p>
            <b className="mt-2 block text-2xl tabular-nums">{(data.summary[key]??0).toLocaleString("en-IN")}</b>
          </article>)}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="min-w-0 rounded-2xl border bg-card p-4">
            <h4 className="font-semibold">Daily traffic · last 30 days</h4>
            <div className="mt-4 flex min-h-40 items-end gap-1 overflow-x-auto pb-5" role="img" aria-label="Daily page view bars">
              {data.daily.length===0?<p className="text-sm text-muted-foreground">No consenting visits yet.</p>:
              data.daily.map(d=><div key={d.date} className="flex min-w-4 flex-1 flex-col items-center justify-end gap-1"
                title={d.date+": "+d.views+" page views / "+d.visits+" sessions"}>
                <span className="w-full rounded-t bg-foreground/70" style={{height:Math.max(3,140*d.views/max)}} />
                <small className="rotate-[-60deg] whitespace-nowrap text-[9px] text-muted-foreground">{d.date.slice(5)}</small>
              </div>)}
            </div>
          </article>
          <article className="min-w-0 rounded-2xl border bg-card p-4">
            <h4 className="font-semibold">Popular pages · 7 days</h4>
            <div className="mt-3 space-y-2">{data.topPages.length===0?<p className="text-sm text-muted-foreground">No page data yet.</p>:
              data.topPages.map(x=><div key={x.path} className="flex justify-between gap-4 border-b py-1 text-sm">
                <span className="truncate" title={x.path}>{x.path}</span><b className="tabular-nums">{x.views}</b>
              </div>)}</div>
          </article>
          <article className="min-w-0 rounded-2xl border bg-card p-4">
            <h4 className="font-semibold">Customer taps / clicks · 7 days</h4>
            <div className="mt-3 space-y-2">{data.topTaps.length===0?<p className="text-sm text-muted-foreground">No interactions yet.</p>:
              data.topTaps.map(x=><div key={x.target} className="flex justify-between gap-4 border-b py-1 text-sm">
                <span className="truncate" title={x.target}>{x.target}</span><b>{x.taps}</b>
              </div>)}</div>
          </article>
          <article className="min-w-0 rounded-2xl border bg-card p-4">
            <h4 className="font-semibold">Visits and repeat use per day</h4>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-muted-foreground">
                <th className="py-2">Day</th><th>Visits</th><th>Visitors</th><th>Views</th><th>Taps</th>
              </tr></thead><tbody>{[...data.daily].reverse().map(d=><tr key={d.date} className="border-b">
                <td className="py-2">{d.date}</td><td>{d.visits}</td><td>{d.visitors}</td><td>{d.views}</td><td>{d.taps}</td>
              </tr>)}</tbody></table>
            </div>
          </article>
        </div>
        <article className="min-w-0 rounded-2xl border bg-card p-4">
          <h4 className="font-semibold">Signed-in customer visits · last 7 days</h4>
          <p className="mt-1 text-xs text-muted-foreground">Only customers who opted into analytics appear. Anonymous guests are included only in the aggregate counters.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[430px] text-left text-sm">
              <thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2">Day</th><th>Customer</th><th>Visits</th><th>Views</th></tr></thead>
              <tbody>{data.customerDaily.map((x,i)=><tr key={x.date+x.userId+i} className="border-b">
                <td className="py-2">{x.date}</td><td className="max-w-[220px] truncate">{x.customer}</td><td>{x.visits}</td><td>{x.views}</td>
              </tr>)}</tbody>
            </table>
            {!data.customerDaily.length && <p className="py-3 text-sm text-muted-foreground">No consenting signed-in customer visits yet.</p>}
          </div>
        </article>
        <p className="text-xs text-muted-foreground">Visits are 30-minute-inactivity sessions, not unique people. Consent and browser privacy settings can reduce counts. No chats, prompts, private text, passwords, IP addresses or payment content are collected.</p>
      </>}
    </section>
  );
}
