import { createHmac, timingSafeEqual } from "node:crypto";

function secret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

export function createShareToken(conversationId: string) {
  const s = secret();
  if (!s) throw new Error("AUTH_SECRET is required for sharing");
  const sig = createHmac("sha256", s).update(conversationId).digest("base64url");
  return `${Buffer.from(conversationId).toString("base64url")}.${sig}`;
}

export function verifyShareToken(token: string) {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const s = secret();
  if (!s) return null;
  let conversationId: string;
  try { conversationId = Buffer.from(encoded, "base64url").toString("utf8"); } catch { return null; }
  if (!conversationId || conversationId.length > 128) return null;
  const expected = createHmac("sha256", s).update(conversationId).digest("base64url");
  const a = Buffer.from(signature); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return conversationId;
}
