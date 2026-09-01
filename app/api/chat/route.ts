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
import {
  resolveLevel,
  isLevel,
  isLevelEnabled,
  levelForIntelligenceDepth,
} from "@/lib/ai/levels";
import { isModelUsable } from "@/lib/ai/health";
import { isAdmin } from "@/lib/auth/admin";
import { rateLimitResponse } from "@/lib/ratelimit";
import { isMaintenanceMode, isWebSearchEnabled } from "@/lib/system-settings";
import { classifyQuery, extractUrl, type WebIntent } from "@/lib/web/classify";
import { webSearchMany } from "@/lib/web/search";
import { fetchWebsite, type WebsiteFetchResult } from "@/lib/web/fetch-url";
import { decideGate } from "@/lib/web/verify";
import {
  renderWebContext,
  WEB_UNAVAILABLE_NOTE,
  renderWebsiteContent,
  verificationFailedMessage,
  websiteFetchFailedMessage,
} from "@/lib/web/render";
import { isKnowledgeWritePermitted } from "@/lib/admin/queries";
import { routeToBrain, type BrainMode } from "@/lib/ai/brain-router";
import { getBrainBySlug } from "@/lib/db/brain-queries";
import {
  buildMemoryContext,
  buildKnowledgeContext,
  buildKnowledgeBlock,
  mergeBrainChunks,
} from "@/lib/memory/context";
import { selectAndRunTool, type ToolExecution } from "@/lib/tools/tool-calling";
import { shouldCheckTools } from "@/lib/tools/should-check-tools";
import { shouldRetrieve } from "@/lib/ai/should-retrieve";
import { wrapToolOutput } from "@/lib/tools/output-guard";
import type { ChatMessage } from "@/lib/ai/types";
import { buildConversationTurns } from "@/lib/ai/conversation-turns";
import {
  needsResolution,
  resolveReference,
} from "@/lib/ai/reference-resolution";
import { detectMultiBrainScope } from "@/lib/ai/multi-brain";
import {
  splitForDigest,
  renderConversationDigest,
} from "@/lib/ai/conversation-summary";
import { sanitizeQueryForLog } from "@/lib/admin/analytics";
import { planIntelligence } from "@/lib/ai/intelligence-planner";

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
        buildKnowledgeContext(userId, {
          query,
          projectId,
          brainId: b.id,
        }).catch(() => null),
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
          ctrl.enqueue(
            sse({
              t: "error",
              message:
                "System is currently under maintenance. Please try again later.",
            }),
          );
          ctrl.close();
        },
      });
      return new Response(body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
      });
    }
  }

  const debug =
    admin &&
    ["1", "true"].includes(new URL(req.url).searchParams.get("debug") ?? "");

  const limited = await rateLimitResponse(
    `chat:${session.user.id}`,
    CHAT_RATE_LIMIT,
    CHAT_RATE_WINDOW_MS,
  );
  if (limited) return limited;

  const {
    conversationId,
    message,
    modelId,
    level,
    regenerate,
    brainId: clientBrainId,
    brainMode,
  } = await req.json();
  if (!conversationId || typeof message !== "string" || !message.trim()) {
    return new Response("Bad request", { status: 400 });
  }

  let preferredModelId: string | undefined;
  const hasExplicitModelChoice =
    isLevel(level) || (typeof modelId === "string" && modelId.length > 0);
  if (isLevel(level)) {
    const effective = isLevelEnabled(level) ? level : "medium";
    preferredModelId = resolveLevel(effective) ?? undefined;
  } else if (typeof modelId === "string" && isModelUsable(modelId)) {
    preferredModelId = modelId;
  }
  if (message.length > MESSAGE_MAX_CHARS) {
    return new Response(`message exceeds ${MESSAGE_MAX_CHARS} characters`, {
      status: 413,
    });
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
    refInfo = resolveReference(
      message,
      prior.filter((m) => m.role === "user").map((m) => m.content),
    );
    retrievalQuery = refInfo.resolved;
  }

  // ── Phase 1: all independent lookups run in parallel ─────────────────────
  // None of these depend on each other; they only need userId + retrievalQuery.
  const effectiveBrainMode: BrainMode =
    brainMode === "smart" ? "smart" : "manual";
  const intelligencePlan = planIntelligence(
    message,
    retrievalQuery,
    effectiveBrainMode,
  );
  const route = intelligencePlan.route;
  const resolvedBrainSlug = intelligencePlan.brainSlug;

  // Adaptive model selection: explicit user choices always win. Otherwise
  // small talk uses the low-cost/fast tier while substantive and research
  // turns use the stronger reasoning tier. Provider health/fallback remains
  // centralized in routeChatStream().
  if (!hasExplicitModelChoice) {
    const adaptiveLevel = levelForIntelligenceDepth(intelligencePlan.depth);
    preferredModelId = resolveLevel(adaptiveLevel) ?? preferredModelId;
  }

  // Greetings / low-information acknowledgements must not trigger RAG.
  const wantRetrieval = intelligencePlan.retrieveMemory;
  const EMPTY_MEMORY = {
    block: "",
    memories: [] as Awaited<ReturnType<typeof buildMemoryContext>>["memories"],
    count: 0,
    fallbackUsed: false,
  };
  const EMPTY_KNOWLEDGE = {
    block: "",
    chunks: [] as Awaited<ReturnType<typeof buildKnowledgeContext>>["chunks"],
    count: 0,
  };

  const WRITE_INTENT_RE =
    /\b(remember|save|update|store|add|don'?t forget)\b.{0,40}\b(this|that|it|knowledge|memory|information|info)\b/i;
  const hasWriteIntent =
    !admin && WRITE_INTENT_RE.test(message) && !!session.user.email;

  const [convo, memory, tool, brainForSmart, writePermitted, webEnabled] =
    await Promise.all([
      getConversation(session.user.id, conversationId),
      wantRetrieval
        ? buildMemoryContext(session.user.id, { query: retrievalQuery }).catch(
            (err) => {
              console.warn("[chat] memory context failed:", err);
              return EMPTY_MEMORY;
            },
          )
        : Promise.resolve(EMPTY_MEMORY),
      shouldCheckTools(message)
        ? selectAndRunTool(session.user.id, message, { audit: true })
        : Promise.resolve<ToolExecution>({
            toolRequested: null,
            toolExecuted: false,
            toolResult: null,
            run: null,
          }),
      resolvedBrainSlug
        ? getBrainBySlug(resolvedBrainSlug).catch(() => null)
        : Promise.resolve(null),
      hasWriteIntent
        ? isKnowledgeWritePermitted(session.user.email!).catch(() => false)
        : Promise.resolve(true),
      isWebSearchEnabled().catch(() => true),
    ]);

  // Live-web layer — classify intent. "internal" leaves every existing path
  // untouched; "web"/"hybrid" fetch live results and "website" fetches a page
  // (Phase 2 below), after which the verification gate decides answer-vs-refuse.
  //
  // IMPORTANT: classification is intentionally NOT gated by provider readiness OR
  // the admin web-search toggle. We must still RECOGNISE a live/current-event or
  // website query even when no provider is configured or web search is disabled,
  // so the gate can REFUSE it (Rule #1/#4) instead of silently answering current
  // events from stale model memory (the original critical bug). The toggle only
  // controls whether the live SEARCH is attempted (see the live lookup below).
  const webIntent: WebIntent = wantRetrieval
    ? classifyQuery(retrievalQuery)
    : "internal";

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
  const smartUnrouted =
    effectiveBrainMode === "smart" && resolvedBrainId === null;
  // Multi-brain queries are planned once and reused by retrieval + telemetry.
  const multiBrains = intelligencePlan.multiBrains;
  const isMulti = multiBrains.length >= 2;
  const wantKnowledge = intelligencePlan.retrieveKnowledge;
  const clarifyBlock =
    smartUnrouted && !isMulti && wantRetrieval
      ? 'SYSTEM: The smart router could not confidently pick a knowledge brain for this message. If the message is an ambiguous role or entity reference — e.g. "founder", "CEO", "ownership", "owner" — without naming a company, ask which company or organization they mean (for example: "Founder of what?", "CEO of which company?", "Ownership of which organization?"). If it clearly refers to the user\'s specific businesses (AllBee, Suplaykart), personal/family life, or law, ask which area they mean. Otherwise answer normally from general knowledge.'
      : "";

  // ── Phase 2: parallel lookups that depend on convo.projectId + brainId ──
  // addMessage also runs here — ownership is confirmed above, and Phase 2
  // completes before streaming starts so userMsg is available for the SSE event.
  const [project, knowledge, history, userMsgResult, live] = await Promise.all([
    projectId ? getProject(session.user.id, projectId) : Promise.resolve(null),
    wantKnowledge
      ? (isMulti
          ? retrieveMultiBrain(
              session.user.id,
              retrievalQuery,
              projectId,
              multiBrains,
            )
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
    // Live lookup (Phase 2) — parallel with knowledge retrieval. Never throws;
    // any failure becomes a not-ok / empty result that the verification gate then
    // refuses on (so a failed lookup can never fall through to a guessed answer).
    //   website intent → fetch the actual page (no search key/toggle needed)
    //   web / hybrid   → live web search (only when the admin toggle is on)
    webIntent === "website"
      ? // Website fetch needs no provider and only ever answers from the fetched
        // page, so it is always safe to attempt (not gated on the toggle).
        (async (): Promise<{ kind: "website"; fetch: WebsiteFetchResult }> => {
          const u = extractUrl(retrievalQuery);
          if (!u)
            return {
              kind: "website",
              fetch: {
                ok: false,
                reason: "no valid website address was found in the message",
              },
            };
          return { kind: "website", fetch: await fetchWebsite(u) };
        })()
      : webEnabled && (webIntent === "web" || webIntent === "hybrid")
        ? // Attempted only when web search is enabled. When off, the gate sees
          // searchEnabled=false and refuses live queries (never guesses from memory).
          webSearchMany(
            intelligencePlan.researchQueries.length
              ? intelligencePlan.researchQueries
              : [retrievalQuery],
            5,
          )
            .then((r) => ({ kind: "search" as const, search: r }))
            .catch((err) => {
              console.warn("[chat] web search failed:", err);
              return {
                kind: "search" as const,
                search: { results: [], provider: "none", cached: false },
              };
            })
        : Promise.resolve(null),
  ]);

  const userMsg = userMsgResult;
  const searchRes = live?.kind === "search" ? live.search : null;
  const websiteRes = live?.kind === "website" ? live.fetch : null;
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
    webIntent,
  };

  // ── Hard verification gate (Rule #4) ──────────────────────────────────────
  // Decide, from the live-lookup outcome + retrieved knowledge, whether the model
  // may answer at all. A "refuse_*" decision short-circuits BEFORE any model call,
  // so a failed live verification or website fetch can never fall through to a
  // guessed answer. See lib/web/verify.ts for the (pure, unit-tested) policy.
  const gate = decideGate({
    intent: webIntent,
    searchEnabled: webEnabled,
    searchAttempted: !!searchRes,
    searchResultCount: searchRes?.results.length ?? 0,
    trustedResultCount:
      searchRes?.results.filter((r) => (r.tier ?? 5) <= 3).length ?? 0,
    fetchAttempted: !!websiteRes,
    fetchOk: !!websiteRes?.ok,
    internalKnowledgeCount: knowledge.count,
  });

  if (gate.action === "refuse_unverified" || gate.action === "refuse_fetch") {
    const refusalText =
      gate.action === "refuse_fetch"
        ? websiteFetchFailedMessage(
            (websiteRes && !websiteRes.ok
              ? extractUrl(retrievalQuery)
              : null) ?? "",
            gate.reason,
          )
        : verificationFailedMessage(gate.reason);
    const verification = {
      intent: webIntent,
      decision: gate.action,
      reason: gate.reason,
    };

    const body = new ReadableStream({
      async start(controller) {
        // Stream the refusal deterministically — the model is never invoked.
        controller.enqueue(sse({ t: "chunk", text: refusalText }));
        let assistantMsgId: string | null = null;
        let title = convo.title;
        if (!debug) {
          try {
            const m = await addMessage({
              conversationId,
              role: "assistant",
              content: refusalText,
              modelId: "verification-gate",
              metadata: { ...retrievalMeta, verification, latencyMs: 0 },
            });
            assistantMsgId = m.id;
            if (convo.title === "New chat") {
              title = message.trim().slice(0, 60);
              await setConversationTitle(
                session.user.id,
                conversationId,
                title,
              );
            }
          } catch (err) {
            console.error("[chat] refusal persistence failed:", err);
          }
        }
        controller.enqueue(
          sse({
            t: "done",
            conversationId,
            userMessageId: userMsg?.id ?? null,
            assistantMessageId: assistantMsgId,
            title,
            modelId: "verification-gate",
            requestedModelId: preferredModelId ?? null,
            clarify: null,
            ...(admin
              ? {
                  meta: {
                    provider: "verification-gate",
                    model: "verification-gate",
                    latencyMs: 0,
                    verification,
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

  let toolBlock = "";
  if (tool.toolExecuted && tool.toolResult != null) {
    let serialized = JSON.stringify(tool.toolResult);
    if (serialized.length > TOOL_RESULT_MAX_CHARS) {
      serialized = serialized.slice(0, TOOL_RESULT_MAX_CHARS) + "…[truncated]";
    }
    toolBlock = wrapToolOutput(tool.toolRequested?.tool ?? "tool", serialized);
  }

  const writeIntentBlock =
    hasWriteIntent && !writePermitted
      ? 'SYSTEM NOTICE: This user does NOT have permission to update system knowledge. If they ask you to save, remember, update, or store any information to your knowledge base or memory, respond with: "You do not have permission to update system knowledge. Please contact an admin." Do not pretend to save anything.'
      : "";

  // Live-web / website context, driven by the verification gate above. We only
  // reach here on an "answer_*" decision:
  //   answer_website → summarize ONLY the fetched page (suppress internal blocks)
  //   answer_web     → answer from verified live results (suppress internal blocks)
  //   answer_hybrid  → internal is authoritative; add live results, else a disclaimer
  const suppressInternal =
    gate.action === "answer_web" || gate.action === "answer_website";
  let webBlock = "";
  if (gate.action === "answer_website" && websiteRes?.ok) {
    webBlock = renderWebsiteContent(websiteRes);
  } else if (gate.action === "answer_web" && searchRes) {
    webBlock = renderWebContext(searchRes.results, "web");
  } else if (gate.action === "answer_hybrid") {
    webBlock =
      gate.liveVerified && searchRes && searchRes.results.length > 0
        ? renderWebContext(searchRes.results, "hybrid")
        : WEB_UNAVAILABLE_NOTE;
  }

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
  const historyMessages: ChatMessage[] = buildConversationTurns(
    recent,
    message,
    {
      regenerate,
      currentUserMessageId: userMsg?.id,
    },
  );

  const chatMessages: ChatMessage[] = [
    { role: "system", content: HAJI_PERSONA.system },
    ...(projectInstructions
      ? [
          {
            role: "system" as const,
            content: `Project instructions:\n${projectInstructions}`,
          },
        ]
      : []),
    ...(memory.block
      ? [{ role: "system" as const, content: memory.block }]
      : []),
    // Pure-web / website queries suppress internal knowledge + the clarify hint
    // (the query is a live/external one the router can't place); hybrid keeps both.
    ...(knowledge.block && !suppressInternal
      ? [{ role: "system" as const, content: knowledge.block }]
      : []),
    ...(toolBlock ? [{ role: "system" as const, content: toolBlock }] : []),
    ...(writeIntentBlock
      ? [{ role: "system" as const, content: writeIntentBlock }]
      : []),
    ...(clarifyBlock && !suppressInternal
      ? [{ role: "system" as const, content: clarifyBlock }]
      : []),
    ...(webBlock ? [{ role: "system" as const, content: webBlock }] : []),
    {
      role: "system" as const,
      content: intelligencePlan.reasoningInstructions,
    },
    ...(digestBlock ? [{ role: "system" as const, content: digestBlock }] : []),
    ...historyMessages,
  ];

  // Stream the response via SSE.
  const streamResult = await routeChatStream(chatMessages, {
    preferredModelId,
  });
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
            throw Object.assign(new Error("provider timeout"), {
              timedOut: true,
            });
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
            metadata: {
              ...retrievalMeta,
              errorReason: (err as { timedOut?: boolean }).timedOut
                ? "timeout"
                : "stream_error",
              latencyMs: Date.now() - startMs,
            },
          }).catch(() => {});
        }
        const isTimeout = (err as { timedOut?: boolean }).timedOut === true;
        console.error(
          "[chat] stream error:",
          isTimeout ? "provider timeout" : err,
        );
        controller.enqueue(
          sse({
            t: "error",
            message: isTimeout ? "Request timed out" : "Stream interrupted",
          }),
        );
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
            ? {
                options: /\b(ceo|ownership|owner)\b/i.test(message)
                  ? ["AllBee", "Suplaykart"]
                  : ["AllBee", "Suplaykart", "Haji"],
              }
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
                  brainReason:
                    route?.reason ??
                    (clarifyBlock ? "clarification requested" : null),
                  knowledgeCount: knowledge.count,
                  memoryCount: memory.count,
                  // Reuse the single source-of-truth provenance computed above.
                  retrievalMethod: retrievalMeta.retrievalMethod,
                  // Phase 5 — real retrieved source documents (never hallucinated).
                  sources: retrievalMeta.sources,
                  // Phase 3 — reference resolution outcome.
                  referenceEntity: refInfo?.entity ?? null,
                  referenceReason: refInfo?.reason ?? null,
                  // Verification gate — intent + which live source (if any) grounded this answer.
                  intelligence: {
                    depth: intelligencePlan.depth,
                    retrieveMemory: intelligencePlan.retrieveMemory,
                    retrieveKnowledge: intelligencePlan.retrieveKnowledge,
                    searchWeb: intelligencePlan.searchWeb,
                    fetchWebsite: intelligencePlan.fetchWebsite,
                    checkTools: intelligencePlan.checkTools,
                    researchQueries: intelligencePlan.researchQueries,
                    researchReason: intelligencePlan.researchReason,
                  },
                  verification: {
                    intent: webIntent,
                    decision: gate.action,
                    liveVerified:
                      gate.action === "answer_web" ||
                      gate.action === "answer_website" ||
                      (gate.action === "answer_hybrid" && gate.liveVerified),
                    provider:
                      searchRes?.provider ??
                      (websiteRes?.ok ? "website-fetch" : null),
                  },
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
