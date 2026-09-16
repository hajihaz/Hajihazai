"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

export default function DeleteAccountButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function removeAccount() {
    if (!window.confirm("Delete your HajiHaz AI account and associated user data? This cannot be undone.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) throw new Error((await res.text()) || "Account deletion failed.");
      await signOut({ callbackUrl: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Account deletion failed.");
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-red-500/30 p-5">
      <h2 className="text-lg font-semibold">Permanently delete account</h2>
      <p className="mt-2 text-sm text-muted-foreground">This removes your profile, conversations, messages, memories, projects, knowledge, sessions, credentials, and other user-owned records.</p>
      <button disabled={busy} onClick={removeAccount} className="mt-5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {busy ? "Deleting…" : "Delete my account"}
      </button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
