"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ui] unhandled route error:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        HajiHaz hit an unexpected error. Your data is safe; try the page again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
      >
        Try again
      </button>
    </main>
  );
}
