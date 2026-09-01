"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ui] global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600 }}>HajiHaz is temporarily unavailable</h1>
            <p style={{ marginTop: 12, opacity: 0.7 }}>Please try again.</p>
            <button
              type="button"
              onClick={() => reset()}
              style={{ marginTop: 20, padding: "10px 16px", border: "1px solid currentColor", borderRadius: 8, cursor: "pointer" }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
