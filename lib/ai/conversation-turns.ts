import type { ChatMessage, ChatRole } from "./types";

/** A persisted message row, as returned by listRecentMessages(). */
export interface HistoryRow {
  id: string;
  role: ChatRole;
  content: string;
}

/**
 * Build the ordered conversation turns for the LLM prompt.
 *
 * Guarantees the CURRENT user message is the final user turn. This fixes the
 * off-by-one bug where listRecentMessages() (read) raced addMessage() (write of
 * the current message) and the prompt's last turn was the PREVIOUS message, so
 * the model answered the previous request.
 *
 * Rules:
 *  - Drop the just-added current user message if the read race already included
 *    it (so it is never duplicated).
 *  - Always append the current message as the final user turn …
 *  - … EXCEPT on regenerate, where addMessage() was not called and the target
 *    user message is already in history. In that case we make the target the
 *    FINAL turn by dropping any turns that come after it (e.g. when conversation
 *    summarization kept later turns in the window, or the user regenerated a
 *    message that is not the most recent one). If the target is not present at
 *    all (scrolled out of the fetched window) we append it, so the invariant
 *    "the request being answered is the last turn" always holds.
 *
 * Note: there is intentionally no `debug` branch — debug and non-debug now
 * assemble turns identically (debug only differs in whether addMessage() ran,
 * i.e. whether currentUserMessageId is set).
 */
export function buildConversationTurns(
  history: HistoryRow[],
  currentMessage: string,
  opts: {
    regenerate?: boolean;
    currentUserMessageId?: string | null;
    regenerateUserMessageId?: string | null;
  } = {},
): ChatMessage[] {
  const trimmed = currentMessage.trim();
  const turns: ChatMessage[] = history
    .filter((m) => m.id !== opts.currentUserMessageId)
    .map((m) => ({ role: m.role, content: m.content }));

  if (!opts.regenerate) {
    turns.push({ role: "user", content: trimmed });
    return turns;
  }

  // Regenerate: the target user message already exists in history. Guarantee it
  // is the final turn even if later turns remain in the window.
  if (opts.regenerateUserMessageId) {
    const target = history.findIndex((m) => m.id === opts.regenerateUserMessageId);
    if (target >= 0) return turns.slice(0, target + 1);
  }
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].role === "user" && turns[i].content.trim() === trimmed) {
      return turns.slice(0, i + 1);
    }
  }
  // Target scrolled out of the window — append it so it is still answered.
  turns.push({ role: "user", content: trimmed });
  return turns;
}
