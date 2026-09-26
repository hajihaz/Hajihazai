"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Share, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "hh-pwa-install-dismissed-at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

function recentlyDismissed() {
  try {
    const value = Number(localStorage.getItem(DISMISS_KEY));
    return Number.isFinite(value) && Date.now() - value < DISMISS_MS;
  } catch {
    return false;
  }
}

export default function PwaRuntime() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [online, setOnline] = useState(true);
  const ios = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }, []);

  useEffect(() => {
    setDismissed(recentlyDismissed());
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    if ("serviceWorker" in navigator) {
      const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      if (document.readyState === "complete") void register();
      else window.addEventListener("load", register, { once: true });
    }

    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setShowIosHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const showInstall = !isStandalone() && !dismissed && Boolean(promptEvent || ios);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* no-op */ }
    setDismissed(true);
  };

  const install = async () => {
    if (!promptEvent) {
      setShowIosHelp(true);
      return;
    }
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setPromptEvent(null);
  };

  return (
    <>
      {!online ? (
        <div role="status" aria-live="polite" className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[110] mx-auto w-fit rounded-full border bg-background/95 px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur">
          You’re offline · reconnect to send messages
        </div>
      ) : null}
      {showInstall ? (
        <aside
          aria-label="Install HajiHaz AI"
          className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[100] mx-auto max-w-md rounded-2xl border bg-background/95 p-3 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-4 sm:mx-0 sm:w-96"
        >
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/branding/hajihaz-mark.png" alt="" className="size-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Install HajiHaz AI</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Open faster from your home screen with a full-screen app experience.
              </p>
            </div>
            <button type="button" onClick={dismiss} aria-label="Dismiss install prompt" className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-accent">
              <X className="size-4" />
            </button>
          </div>
          {showIosHelp ? (
            <p className="mt-3 rounded-xl bg-muted px-3 py-2 text-xs leading-5">
              On iPhone or iPad, tap <Share className="mx-1 inline size-3.5" aria-hidden="true" /> Share, then choose <strong>Add to Home Screen</strong>.
            </p>
          ) : null}
          <button type="button" onClick={() => void install()} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground">
            {ios && !promptEvent ? <Share className="size-4" /> : <Download className="size-4" />}
            {ios && !promptEvent ? "How to install" : "Install app"}
          </button>
        </aside>
      ) : null}
    </>
  );
}
