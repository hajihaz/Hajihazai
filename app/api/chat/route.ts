import { auth } from "@/auth";
import {
  addMessage,
  getConversation,
  listRecentMessages,
  setConversationTitle,
} from "@/lib/db/queries";
import { HAJI_PERSONA } from "@/lib/ai/persona";
import { routeChatStream } from "@/lib/ai/router";
import { getProject } from "@/lib/db/project-queries";
import { resolveLevel, isLevel, isLevelEnabled } from "@/lib/ai/levels";
import { isModelUsable } from "@/lib/ai/health";
import { isAdmin } from "@/lib/auth/admin";
import { rateLimitResponse } from "@/lib/ratelimit";
import { isMaintenanceMode, isWebSearchEnabled } from "@/lib/system-settings";
import { classifyQuery } from "@/lib/web/classify";
import { webSearch, isWebProviderReady } from "@/lib/web/search";
import { renderWebContext, WEB_UNAVAILABLE_NOTE } from "@/lib/web/render";
import { isKnowledgeWritePermitted } from "@/lib/admin/queries";
import { routeToBrain, type BrainMode } from "@/lib/ai/brain-router";
import { getBrainBySlug } from "@/lib/db/brain-queries";
import {
  buildMemoryContext,
  buildKnowledgeContext,
  buildKnowledgeBlock,
  mergeBrainChunks,
} from "@/lib/memory/context";
import {
  selectAndRunTool,
  type ToolExecution,
} from "@/lib/tools/tool-calling";
import { shouldCheckTools } from "@/lib/tools/should-check-tools";
import { shouldRetrieve } from "@/lib/ai/should-retrieve";
import { wrapToolOutput } from "@/lib/tools/output-guard";
import type { ChatMessage } from "@/lib/ai/types";
import { buildConversationTurns } from "@/lib/ai/conversation-turns";
import { needsResolution, resolveReference } from "@/lib/ai/reference-resolution";
import { detectMultiBrainScope } from "@/lib/ai/multi-brain";
import { splitForDigest, renderConversationDigest } from "@/lib/ai/conversation-summary";
import { sanitizeQueryForLog } from "@/lib/admin/analytics";

const CHAT_RATE_LIMIT = 30;
const CHAT_RATE_WINDOW_MS = 60_000;
const MESSAGE_MAX_CHARS = 10_000;
const TOOL_RESULT_MAX_CHARS = 10_000;

function sse(obj: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

/**
 * Multi-brain retrieval (Phase 4): retrieve from several brains and merge.
 *
 * A brain's retrieval scope is "docs in that brain PLUS docs with no brain
 * assigned" (see brainScope). So documents with a NULL brain_id — the default
 * for user uploads and any unbranded ingest — appear in EVERY brain's result
 * set. Naively concatenating per-brain blocks therefore duplicates those docs
 * once per brain and triples the char budget. We instead collect the hits from
 * every brain, dedup by chunkId, and render ONCE under a single budget. Legal is
 * excluded by the detector, preserving legal isolation.
 */
async function retrieveMultiBrain(
  userId: string,
  query: string,
  projectId: string | null,
  slugs: string[],
) {
  const brains = (
    await Promise.all(slugs.map((s) => getBrainBySlug(s).catch(() => null)))
  ).filter((b): b is NonNullable<typeof b> => b !== null);
  const results = (
    await Promise.all(
      brains.map((b) =>
        buildKnowledgeContext(userId, { query, projectId, brainId: b.id }).catch(() => null),
      ),
    )
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  // Dedup across brains by chunkId (null-brain/global docs land in every brain's
  // scope), preserving first-seen order, then render once under one budget.
  const { block, used, count } = buildKnowledgeBlock(mergeBrainChunks(results));
  return { block, chunks: used, count };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = isAdmin(session.user.email);

  // Maintenance mode — block non-admins
  if (!admin) {
    const maintenance = await isMaintenanceMode().catch(() => false);
    if (maintenance) {
      const body = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(sse({ t: "error", message: "System is currently under maintenance. Please try again later." }));
          ctrl.close();
        },
      });
      return new Response(body, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }
  }

  const debug =
    admin &&
    ["1", "true"].includes(new URL(req.url).searchParams.get("debug") ?? "");

  const limited = rateLimitResponse(
    `chat:${session.user.id}`,
    CHAT_RATE_LIMIT,
    CHAT_RATE_WINDOW_MS,
  );
  if (limited) return limited;

  const { conversationId, message, modelId, level, regenerate, brainId: clientBrainId, brainMode } = await req.json();
  if (!conversationId || typeof message !== "string" || !message.trim()) {
    return new Response("Bad request", { status: 400 });
  }

  let preferredModelId: string | undefined;
  if (isLevel(level)) {
    const effective = isLevelEnabled(level) ? level : "medium";
    preferredModelId = resolveLevel(effective) ?? undefined;
  } else if (typeof modelId === "string" && isModelUsable(modelId)) {
    preferredModelId = modelId;
  }
  if (message.length > MESSAGE_MAX_CHARS) {
    return new Response(`message exceeds ${MESSAGE_MAX_CHARS} characters`, { status: 413 });
  }

  // Reference resolution (Phase 3): if the message uses a pronoun with no named
  // entity ("where does he study?"), resolve it to the most recent conversation
  // entity so routing + retrieval target the intended subject. History is only
  // fetched when a pronoun is present (no cost otherwise). The user-facing message
  // and stored history are unchanged — only the routing/retrieval query is enriched.
  let retrievalQuery = message;
  let refInfo: ReturnType<typeof resolveReference> | null = null;
  if (needsResolution(message)) {
    const prior = await listRecentMessages(conversationId, 8).catch(() => []);
    refInfo = resolveReference(message, prior.filter((m) => m.role === "user").map((m) => m.content));
    retrievalQuery = refInfo.resolved;
  }

  // ── Phase 1: all independent lookups run in parallel ─────────────────────
  // None of these depend on each other; they only need userId + retrievalQuery.
  const effectiveBrainMode: BrainMode = brainMode === "smart" ? "smart" : "manual";
  // Smart routing → { brain, confidence, matchedKeywords, reason }. brain may be
  // null (no match / low confidence) — we then clarify / answer without a brain.
  const route = effectiveBrainMode === "smart" ? routeToBrain(retrievalQuery) : null;
  const resolvedBrainSlug = route?.brain ?? null;

  // Greetings / low-information acknowledgements ("hi", "thanks", "ok") must not
  // trigger RAG — otherwise memory + knowledge get injected into small talk.
  const wantRetrieval = shouldRetrieve(message);
  const EMPTY_MEMORY = { block: "", memories: [] as Awaited<ReturnType<typeof buildMemoryContext>>["memories"], count: 0, fallbackUsed: false };
  const EMPTY_KNOWLEDGE = { block: "", chunks: [] as Awaited<ReturnType<typeof buildKnowledgeContext>>["chunks"], count: 0 };

  const WRITE_INTENT_RE =
    /\b(remember|save|update|store|add|don'?t forget)\b.{0,40}\b(this|that|it|knowledge|memory|information|info)\b/i;
  const hasWriteIntent = !admin && WRITE_INTENT_RE.test(message) && !!session.user.email;

  const [convo, memory, tool, brainForSmart, writePermitted, webEnabled] = await Promise.all([
    getConversation(session.user.id, conversationId),
    wantRetrieval
      ? buildMemoryContext(session.user.id, { query: retrievalQuery }).catch((err) => {
          console.warn("[chat] memory context failed:", err);
          return EMPTY_MEMORY;
        })
      : Promise.resolve(EMPTY_MEMORY),
    shouldCheckTools(message)
      ? selectAndRunTool(session.user.id, message, { audit: true })
      : Promise.resolve<ToolExecution>({ toolRequested: null, toolExecuted: false, toolResult: null, run: null }),
    resolvedBrainSlug ? getBrainBySlug(resolvedBrainSlug).catch(() => null) : Promise.resolve(null),
    hasWriteIntent
      ? isKnowledgeWritePermitted(session.user.email!).catch(() => false)
      : Promise.resolve(true),
    isWebSearchEnabled().catch(() => true),
  ]);

  // Live-web layer (additive) — classify intent. "internal" leaves every existing
  // path untouched; "web"/"hybrid" also fetch live results (Phase 2 below).
  // isWebProviderReady(): production requires a real search API key (Tavily /
  // Brave / Serper); the keyless DuckDuckGo scraper is dev-only. Without a key
  // in production the layer is inert and every query stays internal.
  const webIntent =
    webEnabled && isWebProviderReady() && wantRetrieval ? classifyQuery(retrievalQuery) : "internal";

  if (!convo) {
    return new Response("Not found", { status: 404 });
  }

  const projectId = convo.projectId ?? null;
  const resolvedBrainId: string | null =
    effectiveBrainMode === "smart"
      ? (brainForSmart?.id ?? null)
      : typeof clientBrainId === "string"
      ? clientBrainId
      : null;

  // Smart mode that produced no confident brain → skip brain-scoped knowledge
  // retrieval (never fall through to an unscoped "search everything"), and hint
  // the model to ask which area the user means when the question looks domain-
  // specific (Phase D — no silent routing).
  const smartUnrouted = effectiveBrainMode === "smart" && resolvedBrainId === null;
  // Multi-brain (Phase 4): queries spanning brains ("compare AllBee and Suplaykart",
  // "what businesses does Haji own") retrieve from several brains and merge. Empty
  // = normal single-brain retrieval. Legal is excluded (isolation).
  const multiBrains = effectiveBrainMode === "smart" ? detectMultiBrainScope(retrievalQuery) : [];
  const isMulti = multiBrains.length >= 2;
  const wantKnowledge = wantRetrieval && (isMulti || !smartUnrouted);
  const clarifyBlock = smartUnrouted && !isMulti && wantRetrieval
    ? "SYSTEM: The smart router could not confidently pick a knowledge brain for this message. If the message is an ambiguous role or entity reference — e.g. \"founder\", \"CEO\", \"ownership\", \"owner\" — without naming a company, ask which company or organization they mean (for example: \"Founder of what?\", \"CEO of which company?\", \"Ownership of which organization?\"). If it clearly refers to the user's specific businesses (AllBee, Suplaykart), personal/family life, or law, ask which area they mean. Otherwise answer normally from general knowledge."
    : "";

  // ── Phase 2: parallel lookups that depend on convo.projectId + brainId ──
  // addMessage also runs here — ownership is confirmed above, and Phase 2
  // completes before streaming starts so userMsg is available for the SSE event.
  const [project, knowledge, history, userMsgResult, web] = await Promise.all([
    projectId ? getProject(session.user.id, projectId) : Promise.resolve(null),
    wantKnowledge
      ? (isMulti
          ? retrieveMultiBrain(session.user.id, retrievalQuery, projectId, multiBrains)
          : buildKnowledgeContext(session.user.id, {
              query: retrievalQuery,
              projectId,
              brainId: resolvedBrainId ?? undefined,
            })
        ).catch((err) => {
          console.warn("[chat] knowledge context failed:", err);
          return EMPTY_KNOWLEDGE;
        })
      : Promise.resolve(EMPTY_KNOWLEDGE),
    // Fetch a wider window so long conversations can be digested (older turns
    // condensed) while the recent turns stay verbatim — see buildConversationTurns
    // + renderConversationDigest below.
    listRecentMessages(conversationId, 40),
    !debug && !regenerate
      ? addMessage({ conversationId, role: "user", content: message })
      : Promise.resolve(null),
    // Live-web fetch (Phase 2) — runs in parallel with knowledge retrieval, only
    // for web/hybrid intents. Never throws (Phase 8 fallback on empty/error).
    webIntent !== "internal"
      ? webSearch(retrievalQuery, 5).catch((err) => {
          console.warn("[chat] web search failed:", err);
          return { results: [], provider: "none", cached: false };
        })
      : Promise.resolve(null),
  ]);

  const userMsg = userMsgResult;
  const projectInstructions = project?.instructions?.trim() ?? "";

  // Retrieval analytics (admin) — a compact provenance record persisted on the
  // assistant message's metadata column and later aggregated by the admin
  // dashboard (brain usage, clarifications, zero-result/failed retrievals, top
  // docs, top queries). Non-PII beyond a truncated echo of the user's own query.
  const retrievalMeta = {
    kind: "retrieval" as const,
    brainSlug: resolvedBrainSlug,
    brainMode: effectiveBrainMode,
    multiBrains: isMulti ? multiBrains : null,
    confidence: route?.confidence ?? null,
    knowledgeCount: knowledge.count,
    memoryCount: memory.count,
    retrievalMethod: !wantKnowledge
      ? "none"
      : memory.fallbackUsed
      ? "keyword-fallback"
      : "semantic",
    wasClarify: !!clarifyBlock,
    wasZeroResult: wantKnowledge && knowledge.count === 0,
    sources: [...new Set(knowledge.chunks.map((c) => c.title))],
    query: sanitizeQueryForLog(message),
  };

  let toolBlock = "";
  if (tool.toolExecuted && tool.toolResult != null) {
    let serialized = JSON.stringify(tool.toolResult);
    if (serialized.length > TOOL_RESULT_MAX_CHARS) {
      serialized = serialized.slice(0, TOOL_RESULT_MAX_CHARS) + "…[truncated]";
    }
    toolBlock = wrapToolOutput(tool.toolRequested?.tool ?? "tool", serialized);
  }

  const writeIntentBlock = hasWriteIntent && !writePermitted
    ? "SYSTEM NOTICE: This user does NOT have permission to update system knowledge. If they ask you to save, remember, update, or store any information to your knowledge base or memory, respond with: \"You do not have permission to update system knowledge. Please contact an admin.\" Do not pretend to save anything."
    : "";

  // Live-web context (Phases 4/5/8). "web" → answer from the web (suppress the
  // internal knowledge/clarify blocks below); "hybrid" → include both, with the
  // internal knowledge authoritative. Empty results → fallback disclaimer.
  const isPureWeb = webIntent === "web";
  const webBlock =
    webIntent !== "internal"
      ? web && web.results.length > 0
        ? renderWebContext(web.results, webIntent)
        : WEB_UNAVAILABLE_NOTE
      : "";

  // Build the conversation turns so the CURRENT message is always the final user
  // turn. Previously this relied on listRecentMessages() (which races the parallel
  // addMessage write) and only appended the current message in debug mode, so in
  // production the model answered the PREVIOUS turn. See lib/ai/conversation-turns.
  // Long-conversation summarization (Phase B): keep the recent turns verbatim and
  // condense everything older into a compact recap that preserves entities, goals,
  // and topics — bounding prompt size without losing continuity.
  // On regenerate, the reply being re-answered is for a specific past user
  // message; exclude anything after it so BOTH the recap and the turns reflect
  // context only up to that message (not later turns).
  let effectiveHistory = history;
  if (regenerate) {
    const target = message.trim();
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user" && history[i].content.trim() === target) {
        effectiveHistory = history.slice(0, i + 1);
        break;
      }
    }
  }
  const { older, recent } = splitForDigest(effectiveHistory, 14);
  // Summarization must never break chat — fall back to no recap on any error.
  let digestBlock: string | null = null;
  try {
    digestBlock = older.length ? renderConversationDigest(older) : null;
  } catch (err) {
    console.warn("[chat] conversation digest failed:", err);
  }
  const historyMessages: ChatMessage[] = buildConversationTurns(recent, message, {
    regenerate,
    currentUserMessageId: userMsg?.id,
  });

  const chatMessages: ChatMessage[] = [
    { role: "system", content: HAJI_PERSONA.system },
    ...(projectInstructions
      ? [{ role: "system" as const, content: `Project instructions:\n${projectInstructions}` }]
      : []),
    ...(memory.block ? [{ role: "system" as const, content: memory.block }] : []),
    // Pure-web queries suppress internal knowledge + the clarify hint (the query
    // is a live/external one the router can't place); hybrid keeps both.
    ...(knowledge.block && !isPureWeb ? [{ role: "system" as const, content: knowledge.block }] : []),
    ...(toolBlock ? [{ role: "system" as const, content: toolBlock }] : []),
    ...(writeIntentBlock ? [{ role: "system" as const, content: writeIntentBlock }] : []),
    ...(clarifyBlock && !isPureWeb ? [{ role: "system" as const, content: clarifyBlock }] : []),
    ...(webBlock ? [{ role: "system" as const, content: webBlock }] : []),
    ...(digestBlock ? [{ role: "system" as const, content: digestBlock }] : []),
    ...historyMessages,
  ];

  // Stream the response via SSE.
  const streamResult = await routeChatStream(chatMessages, { preferredModelId });
  const startMs = Date.now();

  const CHUNK_TIMEOUT_MS = 30_000;

  const body = new ReadableStream({
    async start(controller) {
      let fullText = "";
      const iter = streamResult.stream[Symbol.asyncIterator]();
      try {
        while (true) {
          const next = await Promise.race([
            iter.next(),
            new Promise<"timeout">((resolve) =>
              setTimeout(() => resolve("timeout"), CHUNK_TIMEOUT_MS),
            ),
          ]);
          if (next === "timeout") {
            throw Object.assign(new Error("provider timeout"), { timedOut: true });
          }
          if (next.done) break;
          fullText += next.value;
          controller.enqueue(sse({ t: "chunk", text: next.value }));
        }
      } catch (err) {
        if (!debug && fullText.trim()) {
          await addMessage({
            conversationId,
            role: "assistant",
            content: fullText.trimEnd() + "\n\n*[Response interrupted]*",
            modelId: streamResult.modelId,
            metadata: { ...retrievalMeta, errorReason: (err as { timedOut?: boolean }).timedOut ? "timeout" : "stream_error", latencyMs: Date.now() - startMs },
          }).catch(() => {});
        }
        const isTimeout = (err as { timedOut?: boolean }).timedOut === true;
        console.error("[chat] stream error:", isTimeout ? "provider timeout" : err);
        controller.enqueue(sse({ t: "error", message: isTimeout ? "Request timed out" : "Stream interrupted" }));
        controller.close();
        return;
      }

      // Persist assistant reply + auto-title after streaming completes.
      let assistantMsgId: string | null = null;
      let title = convo.title;
      const latencyMs = Date.now() - startMs;
      if (!debug) {
        // Persistence must never crash the stream — the reply already streamed to
        // the client. On DB failure, log and still send the "done" event below.
        try {
          const assistantMsg = await addMessage({
            conversationId,
            role: "assistant",
            content: fullText,
            modelId: streamResult.modelId,
            metadata: { ...retrievalMeta, latencyMs },
          });
          assistantMsgId = assistantMsg.id;
          if (convo.title === "New chat") {
            title = message.trim().slice(0, 60);
            await setConversationTitle(session.user.id, conversationId, title);
          }
        } catch (err) {
          console.error("[chat] post-stream persistence failed:", err);
        }
      }

      controller.enqueue(
        sse({
          t: "done",
          conversationId,
          userMessageId: userMsg?.id ?? null,
          assistantMessageId: assistantMsgId,
          title,
          modelId: streamResult.modelId,
          requestedModelId: preferredModelId ?? null,
          // Phase 7 — clarification quick-action options (non-admin safe). Business
          // roles ("CEO", "ownership") apply only to the companies; "founder" and
          // generic prompts also include Haji.
          clarify: clarifyBlock
            ? { options: /\b(ceo|ownership|owner)\b/i.test(message) ? ["AllBee", "Suplaykart"] : ["AllBee", "Suplaykart", "Haji"] }
            : null,
          ...(admin
            ? {
                meta: {
                  provider: streamResult.provider,
                  model: streamResult.modelId,
                  requestedModelId: streamResult.requestedModelId,
                  latencyMs,
                  brainId: resolvedBrainId,
                  brainSlug: resolvedBrainSlug,
                  brainMode: effectiveBrainMode,
                  multiBrains: isMulti ? multiBrains : null,
                  brainConfidence: route?.confidence ?? null,
                  brainMatched: route?.matchedKeywords ?? null,
                  brainReason: route?.reason ?? (clarifyBlock ? "clarification requested" : null),
                  knowledgeCount: knowledge.count,
                  memoryCount: memory.count,
                  // Reuse the single source-of-truth provenance computed above.
                  retrievalMethod: retrievalMeta.retrievalMethod,
                  // Phase 5 — real retrieved source documents (never hallucinated).
                  sources: retrievalMeta.sources,
                  // Phase 3 — reference resolution outcome.
                  referenceEntity: refInfo?.entity ?? null,
                  referenceReason: refInfo?.reason ?? null,
                },
              }
            : {}),
          ...(debug
            ? {
                debug: {
                  memories: memory.memories,
                  memoryCount: memory.count,
                  knowledge: knowledge.chunks,
                  knowledgeCount: knowledge.count,
                  memoryBlock: memory.block,
                  knowledgeBlock: knowledge.block,
                  toolRequested: tool.toolRequested,
                  toolExecuted: tool.toolExecuted,
                  toolResult: tool.toolResult,
                  toolRun: tool.run,
                },
              }
            : {}),
        }),
      );
      controller.close();
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
