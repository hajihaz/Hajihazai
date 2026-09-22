"use client";

import { useState } from "react";

export default function GuestLoginButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueAsGuest() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/guest", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Guest access is temporarily unavailable");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="w-full space-y-2"
      method="post"
      action="/api/auth/guest?redirect=1"
      onSubmit={(event) => {
        // Progressive enhancement: when JavaScript has not hydrated yet, the
        // native POST still creates the guest session and redirects to /.
        // When hydrated, use fetch for the inline loading/error experience.
        event.preventDefault();
        void continueAsGuest();
      }}
    >
      <button
        type="submit"
        disabled={busy}
        className="min-h-11 w-full rounded-lg border bg-background px-5 text-sm font-medium shadow-sm hover:bg-accent disabled:opacity-50"
      >
        {busy ? "Opening guest workspace…" : "Continue as guest"}
      </button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </form>
  );
}
