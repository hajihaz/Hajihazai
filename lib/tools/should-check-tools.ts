/**
 * Fast path: decide whether a message is worth running tool detection on.
 * Pure heuristic (no imports). Returns false for obvious small talk so we
 * avoid an extra model call on conversational turns.
 *
 * Conservative by design: returns true only when the message shows a
 * tool-relevant signal (math, time, memory, knowledge, or "search").
 */

const SMALL_TALK: RegExp[] = [
  /^h(i|ey|ello)\b/,
  /^yo\b/,
  /^sup\b/,
  /^good (morning|afternoon|evening|night)\b/,
  /^how are you\b/,
  /^how's it going\b/,
  /^what'?s up\b/,
  /\bthank(s| you)\b/,
  /^who are you\b/,
  /\btell me a joke\b/,
  /^(bye|goodbye)\b/,
  /^good night\b/,
];

const TOOL_SIGNALS: RegExp[] = [
  // arithmetic
  /\d\s*[+\-*/x×]\s*\d/,
  /[+\-*/]\s*\d/,
  /\b(calculate|compute|how much is|times|multiplied|divided|plus|minus|percent|sum of|product of)\b/,
  /\d+\s*%/,
  // time
  /\b(what time|current time|what'?s the time|time is it|today'?s date|date today|timezone)\b/,
  // memory
  /\b(remember|recall|my memory|what do you know about me|do i have|did i)\b/,
  // knowledge base
  /\b(document|handbook|policy|knowledge base|in my (docs|files|notes)|according to (my|the) )\b/,
  // HajiHaz Commander / Mac execution intent
  /\bhajihaz\s+commander\b/,
  /\b(?:run|execute|open|create|delete|move|read|write|check|inspect|control)\b.{0,80}\b(?:my|the)\s+mac\b/i,
  // explicit search intent
  /\bsearch\b/,
];

export function shouldCheckTools(message: string): boolean {
  if (typeof message !== "string") return false;
  const m = message.toLowerCase().trim();
  if (!m) return false;
  if (SMALL_TALK.some((r) => r.test(m))) return false;
  return TOOL_SIGNALS.some((r) => r.test(m));
}
