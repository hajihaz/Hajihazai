/**
 * Hard anti-hallucination gate (Rule #4).
 *
 * A single PURE decision function that the chat route obeys. It encodes the
 * invariant the whole fix exists for:
 *
 *   There is NO branch where a query that requires live verification, whose
 *   verification did not succeed, resolves to an action that lets the model
 *   answer the live/external part from memory.
 *
 * The route calls decideGate() AFTER running the live lookup(s) and knowledge
 * retrieval, then:
 *   - answer_*        → build the prompt and stream a model answer
 *   - refuse_*        → stream a deterministic refusal, NEVER calling the model
 *
 * Because it is pure (no I/O, no env), it is exhaustively unit-tested — see
 * tests/web-verification-gate.test.ts.
 */
import type { WebIntent } from "./classify";

export interface GateInput {
  intent: WebIntent;
  /** Admin toggle is on AND a search provider is attemptable (keyless DDG counts). */
  searchEnabled: boolean;
  /** A live web search was actually performed for this query. */
  searchAttempted: boolean;
  /** Number of usable results the search returned. */
  searchResultCount: number;
  /** A website fetch was actually performed for this query. */
  fetchAttempted: boolean;
  /** The website fetch succeeded and produced readable content. */
  fetchOk: boolean;
  /** How many internal knowledge chunks were retrieved (authoritative facts). */
  internalKnowledgeCount: number;
}

export type GateDecision =
  | { action: "answer_internal" }
  | { action: "answer_web" }
  | { action: "answer_website" }
  | { action: "answer_hybrid"; liveVerified: boolean }
  | { action: "refuse_unverified"; reason: string }
  | { action: "refuse_fetch"; reason: string };

/** Actions that let the model produce an answer (used by tests as the invariant). */
export const ANSWER_ACTIONS = ["answer_internal", "answer_web", "answer_website", "answer_hybrid"] as const;

export function isRefusal(d: GateDecision): d is Extract<GateDecision, { reason: string }> {
  return d.action === "refuse_unverified" || d.action === "refuse_fetch";
}

export function decideGate(i: GateInput): GateDecision {
  // Internal queries are unchanged — existing knowledge/memory path.
  if (i.intent === "internal") return { action: "answer_internal" };

  // Website summary: answer ONLY if we actually fetched readable content.
  if (i.intent === "website") {
    return i.fetchAttempted && i.fetchOk
      ? { action: "answer_website" }
      : { action: "refuse_fetch", reason: "the page could not be fetched or contained no readable content" };
  }

  // Pure live / current-event query — MUST be verified from a live source.
  if (i.intent === "web") {
    if (!i.searchEnabled)
      return { action: "refuse_unverified", reason: "live web search is turned off or no search provider is configured" };
    if (!i.searchAttempted)
      return { action: "refuse_unverified", reason: "a live search was not performed" };
    return i.searchResultCount > 0
      ? { action: "answer_web" }
      : { action: "refuse_unverified", reason: "no live source returned a usable result" };
  }

  // Hybrid — internal entity plus a live/external facet. Internal facts are
  // authoritative and may be answered even if the web part failed, but we NEVER
  // fabricate the live facet:
  //   - live verified            → answer with internal + web
  //   - live failed, have internal → answer internal, disclaim the live part
  //   - live failed, no internal   → nothing to stand on → refuse
  if (i.searchAttempted && i.searchResultCount > 0) return { action: "answer_hybrid", liveVerified: true };
  if (i.internalKnowledgeCount > 0) return { action: "answer_hybrid", liveVerified: false };
  return { action: "refuse_unverified", reason: "no internal knowledge and no live source were available to verify this" };
}
