/** Google Sheets sync via Service Account REST API (no googleapis package). */

async function base64url(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function encodeJsonBase64(obj: unknown): string {
  const json = JSON.stringify(obj);
  let str = "";
  for (let i = 0; i < json.length; i++) str += String.fromCharCode(json.charCodeAt(i) & 0xff);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function createServiceAccountJwt(
  serviceEmail: string,
  privateKeyPem: string,
  scopes: string[],
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodeJsonBase64({ alg: "RS256", typ: "JWT" });
  const payload = encodeJsonBase64({
    iss: serviceEmail,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const signingInput = `${header}.${payload}`;
  const pemBody = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const binaryDer = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${await base64url(signature)}`;
}

async function getAccessToken(serviceEmail: string, privateKeyPem: string): Promise<string> {
  const jwt = await createServiceAccountJwt(serviceEmail, privateKeyPem, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed ${res.status}: ${body}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function appendRow(
  spreadsheetId: string,
  values: string[],
  token: string,
  sheet = "Users",
): Promise<void> {
  const range = encodeURIComponent(`${sheet}!A:Z`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values: [values] }),
    signal: AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Sheets append failed ${res.status}: ${body}`);
  }
}

/** Fire-and-forget: sync a new user registration to Google Sheets. Never throws. */
export function syncUserToSheets(user: {
  email: string;
  name?: string | null;
  source: "google" | "credentials";
  createdAt: Date;
}): void {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");

  if (!spreadsheetId || !serviceEmail || !privateKey) {
    console.warn("[sheets] config missing — skipping sync");
    return;
  }

  const row = [
    user.email,
    user.name ?? "",
    user.source,
    user.createdAt.toISOString(),
    new Date().toISOString(),
  ];

  // Retry up to 3 times, non-blocking
  void (async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const token = await getAccessToken(serviceEmail, privateKey);
        await appendRow(spreadsheetId, row, token);
        return;
      } catch (err) {
        if (attempt === 3) {
          console.warn("[sheets] sync failed after 3 attempts:", err);
          return;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  })();
}

/** Fire-and-forget: sync any event (login, status change, etc.) to the Events sheet. Never throws. */
export function syncEventToSheets(event: {
  email: string;
  eventType: string;
  detail?: string;
}): void {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");

  if (!spreadsheetId || !serviceEmail || !privateKey) return;

  const row = [
    new Date().toISOString(),
    event.email,
    event.eventType,
    event.detail ?? "",
  ];

  void (async () => {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const token = await getAccessToken(serviceEmail, privateKey);
        await appendRow(spreadsheetId, row, token, "Events");
        return;
      } catch {
        if (attempt === 3) return;
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  })();
}
