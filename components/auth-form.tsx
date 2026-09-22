"use client";

import { useState } from "react";

/** Username/email + password sign-in and registration (alongside Google). */
export default function AuthForm() {
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const url = mode === "signin" ? "/api/auth/login" : "/api/auth/register";
      const payload =
        mode === "signin"
          ? { identifier, password }
          : { username, email, password };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Something went wrong");
        return;
      }
      // Session cookie is set — reload to enter the app.
      window.location.href = "/";
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-lg border bg-background px-3 py-2.5 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm";

  return (
    <form onSubmit={submit} className="flex w-full flex-col gap-2.5 text-left">
      {mode === "signin" ? (
        <input
          className={input}
          placeholder="Username or email"
          aria-label="Username or email"
          autoComplete="username"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />
      ) : (
        <>
          <input
            className={input}
            placeholder="Username"
            aria-label="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className={input}
            placeholder="Email"
            aria-label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </>
      )}
      <input
        className={input}
        placeholder="Password"
        aria-label="Password"
        type="password"
        autoComplete={mode === "signin" ? "current-password" : "new-password"}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}

      <button
        disabled={busy}
        className="min-h-11 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {mode === "signin" ? "Sign in" : "Create account"}
      </button>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "register" : "signin");
            setError(null);
          }}
          className="hover:text-foreground"
        >
          {mode === "signin" ? "Create an account" : "Have an account? Sign in"}
        </button>
        <a href="/forgot-password" className="hover:text-foreground">
          Forgot password?
        </a>
      </div>
    </form>
  );
}
