import { addKnowledgeAuditEntry } from "@/lib/admin/queries";

const MIN_CONTENT_LENGTH = 20;
const MAX_CONTENT_BYTES = 5 * 1024 * 1024;
const MAX_URL_DENSITY = 0.3;
const SPAM_PATTERNS = [
  /(.)\1{15,}/,
  /^[\s\W]+$/,
];

export interface SafetyResult {
  ok: true;
}
export interface SafetyError {
  ok: false;
  error: string;
}

export function validateKnowledgeContent(content: string): SafetyResult | SafetyError {
  const trimmed = content.trim();

  if (!trimmed) {
    return { ok: false, error: "Content cannot be empty" };
  }
  if (trimmed.length < MIN_CONTENT_LENGTH) {
    return { ok: false, error: `Content is too short (minimum ${MIN_CONTENT_LENGTH} characters)` };
  }
  if (Buffer.byteLength(trimmed, "utf8") > MAX_CONTENT_BYTES) {
    return { ok: false, error: "Content exceeds the 5 MB limit" };
  }

  // Spam: repeated character flood
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { ok: false, error: "Content appears to be spam" };
    }
  }

  // URL density check
  const urlMatches = trimmed.match(/https?:\/\/\S+/g) ?? [];
  const urlChars = urlMatches.reduce((s, u) => s + u.length, 0);
  if (urlChars / trimmed.length > MAX_URL_DENSITY && urlMatches.length > 5) {
    return { ok: false, error: "Content contains too many URLs and may be spam" };
  }

  return { ok: true };
}

export async function logKnowledgeAction(params: {
  userId: string | null;
  email: string;
  action: "create" | "update" | "delete" | "create_content" | "update_content" | "delete_content";
  documentId?: string | null;
  documentTitle: string;
  contentBefore?: string | null;
  contentAfter?: string | null;
}): Promise<void> {
  try {
    await addKnowledgeAuditEntry(params);
  } catch (err) {
    console.error("[knowledge-safety] audit log failed (non-fatal):", err);
  }
}
