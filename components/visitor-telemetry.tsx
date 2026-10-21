"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const CHOICE = "hhai-usage-consent-v1";
const VISITOR = "hhai-usage-visitor-v1";
const SESSION = "hhai-usage-session-v1";
const SESSION_IDLE = 30 * 60 * 1000;

function safePath(path: string) {
  const clean = path.split(/[?#]/)[0].replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");
  if (!clean.startsWith("/") || clean.length > 300) return null;
  if (/^\/(admin|api|settings|account|billing|payment|vault)(\/|$)/i.test(clean)) return null;
  return clean;
}

function ids() {
  let visitorId = localStorage.getItem(VISITOR);
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(VISITOR, visitorId);
  }
  const now = Date.now();
  let session: { id: string; last: number; counted: boolean } | null = null;
  try { session = JSON.parse(sessionStorage.getItem(SESSION) || "null"); } catch { /* reset */ }
  if (!session || now - session.last > SESSION_IDLE || session.last > now)
    session = { id: crypto.randomUUID(), last: now, counted: false };
  const isNew = !session.counted;
  session.counted = true;
  session.last = now;
  sessionStorage.setItem(SESSION, JSON.stringify(session));
  return { visitorId, sessionId: session.id, isNew };
}

export default function VisitorTelemetry() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<"yes" | "no" | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [privacyBlocked, setPrivacyBlocked] = useState(false);
  const consentRef = useRef<"yes" | "no" | null>(null);
  useEffect(() => { consentRef.current = consent; }, [consent]);

  useEffect(() => {
    try {
      const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl;
      setPrivacyBlocked(Boolean(gpc || navigator.doNotTrack === "1"));
      setConsent(gpc || navigator.doNotTrack === "1" ? "no" :
        localStorage.getItem(CHOICE) === "yes" ? "yes" :
        localStorage.getItem(CHOICE) === "no" ? "no" : null);
    } catch { setConsent("no"); }
    setReady(true);
  }, []);

  useEffect(() => {
    const path = safePath(pathname || "");
    if (!path || consent !== "yes") return;
    let visitorId: string, sessionId: string, isNew: boolean;
    try { ({ visitorId, sessionId, isNew } = ids()); } catch { return; }
    let enabled = true;
    const send = (kind: "visit" | "view" | "tap" | "active_time", target?: string, durationSeconds?: number) => {
      if (!enabled || consentRef.current !== "yes") return;
      void fetch("/api/analytics/visit", {
        method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({consent:true, visitorId, sessionId, path, kind, target, durationSeconds}),
      }).catch(() => undefined);
    };
    if (isNew) send("visit");
    // Prevent duplicate pageviews in React StrictMode during development.
    const stamp = "hhai-last-view";
    let shouldView = true;
    try {
      const last = JSON.parse(sessionStorage.getItem(stamp) || "null");
      if (last?.path === path && Date.now() - last.time < 800) shouldView = false;
      sessionStorage.setItem(stamp, JSON.stringify({path, time:Date.now()}));
    } catch { /* best effort */ }
    if (shouldView) send("view");
    let lastTap = 0;
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const el = event.target.closest("a,button,[data-analytics]");
      if (!el || el.closest("form,[data-analytics-consent]") || Date.now() - lastTap < 400) return;
      lastTap = Date.now();
      let target = el.getAttribute("data-analytics") || "";
      if (!target && el instanceof HTMLAnchorElement) {
        try {
          const url = new URL(el.href);
          target = url.origin === location.origin ? "link:" + (safePath(url.pathname) || "other") : "external-link";
        } catch { target = "link"; }
      }
      target = (target || "button").replace(/[^a-zA-Z0-9/_:-]/g, "_").slice(0, 80);
      send("tap", target);
    };
    document.addEventListener("click", onClick, true);
    let started = document.visibilityState === "visible" ? Date.now() : 0;
    const reportTime = () => {
      if (!started) return;
      const seconds = Math.floor((Date.now() - started) / 1000);
      started = document.visibilityState === "visible" ? Date.now() : 0;
      if (seconds > 0) send("active_time", undefined, Math.min(180, seconds));
    };
    const visibility = () => {
      reportTime();
      if (document.visibilityState === "visible") started = Date.now();
    };
    document.addEventListener("visibilitychange", visibility);
    const interval = window.setInterval(reportTime, 60_000);
    return () => {
      reportTime();
      enabled = false;
      window.clearInterval(interval);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [pathname, consent]);

  if (!ready || privacyBlocked || !safePath(pathname || "")) return null;
  function save(v: "yes" | "no") {
    try {
      localStorage.setItem(CHOICE, v);
      if (v === "no") {
        localStorage.removeItem(VISITOR);
        sessionStorage.removeItem(SESSION);
      }
    } catch { /* no storage available */ }
    consentRef.current = v;
    setOpen(false);
    setConsent(v);
  }
  return (
    <>
    <button type="button" data-analytics-consent="true" aria-label="Change optional product analytics consent" onClick={() => setOpen(true)}
      className="fixed bottom-3 left-3 z-[99] rounded-lg border bg-background px-2 py-1 text-xs text-foreground">Privacy settings</button>
    {(consent === null || open) && <aside data-analytics-consent="true" role="dialog" aria-label="Optional product usage analytics"
      className="fixed bottom-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-2xl border bg-background p-4 text-sm text-foreground shadow-xl">
      <p className="font-semibold">Optional product analytics</p>
      <p className="mt-1 text-xs text-muted-foreground">Can we count anonymous visits, pages opened, button taps and time spent to improve HajiHaz AI? We never record prompts, messages, passwords or form input.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => save("yes")} className="rounded-lg bg-foreground px-3 py-2 text-xs text-background">Allow analytics</button>
        <button type="button" onClick={() => save("no")} className="rounded-lg border px-3 py-2 text-xs">No thanks</button>
      </div>
    </aside>}
    </>
  );
}
