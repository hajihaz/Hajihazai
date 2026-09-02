/**
 * Google Apps Script (Sheets) submission — best-effort.
 * NEVER blocks the user: failures are logged, not thrown.
 */
export interface SheetPayload {
  username: string;
  email: string;
  mobile: string;
  countryCode: string;
  googleName: string;
  googleId: string;
  picture: string;
}

export async function submitToSheet(
  payload: SheetPayload,
): Promise<{ ok: boolean; skipped?: boolean }> {
  const url = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  if (!url) {
    console.warn("[sheets] GOOGLE_SHEETS_WEBHOOK_URL not set — skipping submission");
    return { ok: false, skipped: true };
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[sheets] submission failed: HTTP ${res.status}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[sheets] submission error (non-fatal):", err);
    return { ok: false };
  }
}
