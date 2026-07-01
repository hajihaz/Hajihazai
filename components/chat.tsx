"use client";

import { memo, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { Copy, RotateCw, Send, Square, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Msg } from "./chat-app";
import BrainSelector, { type BrainOption, type BrainMode } from "./brain-selector";
import { ProfileCard, isProfileCardQuery, DEFAULT_PROFILE } from "./profile-card";
import VoiceInput from "./voice-input";

const NEAR_BOTTOM_PX = 80; // px from bottom to trigger auto-scroll

// Memoized: prevents re-render when only sidebar state changes in ChatApp.
const Chat = memo(function Chat({
  messages,
  conversationId,
  input,
  setInput,
  onSend,
  onSendPrompt,
  onFeedback,
  onCopy,
  onDelete,
  onRetry,
  onStop,
  sending,
  isGenerating,
  loading,
  isAdmin,
  debug,
  brains,
  selectedBrainId,
  brainMode,
  onSelectBrain,
  onSetBrainMode,
}: {
  messages: Msg[];
  conversationId: string | null;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  onSendPrompt: (text: string) => void;
  onFeedback: (msg: Msg, value: "helpful" | "not_helpful") => void;
  onCopy: (text: string) => void;
  onDelete: (msg: Msg) => void;
  onRetry: (msg: Msg) => void;
  onStop: () => void;
  sending: boolean;
  isGenerating: boolean;
  loading: boolean;
  isAdmin: boolean;
  debug: boolean;
  brains: BrainOption[];
  selectedBrainId: string | null;
  brainMode: BrainMode;
  onSelectBrain: (id: string | null) => void;
  onSetBrainMode: (mode: BrainMode) => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // True while WE are programmatically scrolling, so the scroll handler doesn't
  // mistake our own auto-scroll for the user scrolling away from the bottom.
  const suppressScrollRef = useRef(false);
  // When set, the next render jumps straight to the bottom (initial load and
  // conversation switches), regardless of near-bottom state.
  const needsJumpRef = useRef(true);

  // Track whether the user is near the bottom — but ignore scroll events that
  // our own auto-scroll generates (those would otherwise flip this false
  // mid-scroll and strand the user above the composer after sending).
  const handleScroll = useCallback(() => {
    if (suppressScrollRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = dist < NEAR_BOTTOM_PX;
  }, []);

  // Instant, guarded scroll to bottom. Always direct scrollTop (never smooth)
  // so the composer never appears to jump, and the suppress window stays tight.
  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    suppressScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        suppressScrollRef.current = false;
      }),
    );
  }, []);

  // Switching conversations (or first load) → jump to the newest message.
  useEffect(() => {
    needsJumpRef.current = true;
    isNearBottomRef.current = true;
  }, [conversationId]);

  // Auto-scroll, before paint so the view follows new content with no visible
  // jump. Jumps to bottom once a conversation finishes loading; otherwise only
  // follows when the user is already near the bottom (never fights a scroll up).
  useLayoutEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (needsJumpRef.current) {
      if (!loading) {
        scrollToBottom();
        needsJumpRef.current = false;
      }
      return;
    }
    if (isNearBottomRef.current) scrollToBottom();
  }, [messages, sending, loading, scrollToBottom]);

  // Auto-resize the textarea before paint, so sending (which clears the input)
  // never flashes a tall box that then collapses — a source of the input jump.
  useLayoutEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
      >
        <div className="mx-auto max-w-3xl px-3 py-5 sm:px-4 sm:py-6">
          {loading ? (
            <MessagesSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center sm:py-20">
              <h2 className="text-2xl font-semibold">HajiHaz AI</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground sm:text-base">
                Ask anything — your conversations are saved automatically. Try one of these:
              </p>
              <div className="mt-6 grid w-full max-w-2xl gap-4 text-left sm:grid-cols-2">
                {[
                  { area: "Personal", prompts: ["Who is Haji?", "What are Haji's goals?"] },
                  { area: "AllBee", prompts: ["Who founded AllBee?", "What services does AllBee provide?"] },
                  { area: "Legal", prompts: ["Explain Article 21.", "What is negligence?"] },
                  { area: "Suplaykart", prompts: ["What is Suplaykart?", "Who founded Suplaykart?"] },
                ].map(({ area, prompts }) => (
                  <div key={area} className="rounded-xl border p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{area}</p>
                    <div className="flex flex-col gap-2">
                      {prompts.map((p) => (
                        <button
                          key={p}
                          onClick={() => onSendPrompt(p)}
                          className="rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="space-y-5"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              {messages.map((m, idx) => {
                const isUser = m.role === "user";
                const prevMsg = messages[idx - 1];
                const showProfileCard =
                  !isUser &&
                  prevMsg?.role === "user" &&
                  isProfileCardQuery(prevMsg.content);

                return (
                  <div
                    key={m.id}
                    className={`group flex flex-col ${isUser ? "items-end" : "items-start"}${m.isNew ? " animate-message" : ""}`}
                  >
                    <div className="max-w-[85%] sm:max-w-[80%]">
                      <div
                        className={`break-anywhere rounded-2xl px-4 py-2.5 text-sm ${
                          isUser
                            ? "bg-primary text-primary-foreground"
                            : m.error
                              ? "border border-destructive/30 bg-destructive/10 text-foreground"
                              : "bg-muted"
                        }`}
                      >
                        {isUser ? (
                          <span className="whitespace-pre-wrap">{m.content}</span>
                        ) : (
                          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:rounded-lg prose-pre:border prose-pre:bg-background/60 prose-code:rounded prose-code:bg-background/60 prose-code:px-1 prose-code:text-[0.8em]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {m.content}
                            </ReactMarkdown>
                            {m.streaming && (
                              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle opacity-70" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Clarification quick actions (Phase 7) — pick an area to disambiguate. */}
                      {!isUser && !m.streaming && m.clarify && m.clarify.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {m.clarify.map((opt) => (
                            <button
                              key={opt}
                              onClick={() => onSendPrompt(prevMsg?.role === "user" ? `${prevMsg.content} ${opt}` : opt)}
                              className="rounded-full border bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-accent"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Action bar — hover on desktop, always shown on mobile. */}
                      {!m.streaming && (
                        <div
                          className={`mt-1 flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 ${
                            isUser ? "justify-end" : "justify-start"
                          }`}
                        >
                          <ActionButton label="Copy" onClick={() => onCopy(m.content)}>
                            <Copy className="size-3.5" />
                          </ActionButton>

                          {m.role === "assistant" ? (
                            <ActionButton
                              label={m.error ? "Retry" : "Regenerate"}
                              onClick={() => onRetry(m)}
                            >
                              <RotateCw className="size-3.5" />
                            </ActionButton>
                          ) : null}

                          {/* Feedback (Phase 5) — assistant replies only. */}
                          {m.role === "assistant" && !m.error ? (
                            <>
                              <ActionButton label="Helpful" active={m.feedback === "helpful"} onClick={() => onFeedback(m, "helpful")}>
                                <ThumbsUp className="size-3.5" />
                              </ActionButton>
                              <ActionButton label="Not helpful" active={m.feedback === "not_helpful"} onClick={() => onFeedback(m, "not_helpful")}>
                                <ThumbsDown className="size-3.5" />
                              </ActionButton>
                            </>
                          ) : null}

                          <ActionButton label="Delete" onClick={() => onDelete(m)} danger>
                            <Trash2 className="size-3.5" />
                          </ActionButton>
                        </div>
                      )}

                      {isAdmin && debug && m.role === "assistant" && m.meta ? (
                        <DebugPanel meta={m.meta} />
                      ) : null}

                      {showProfileCard && <ProfileCard data={DEFAULT_PROFILE} />}
                    </div>
                  </div>
                );
              })}

              {/* Loading dots — only while pre-processing (before first token arrives) */}
              {sending && (
                <div className="flex justify-start" aria-live="polite">
                  <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-3">
                    <span className="sr-only">HajiHaz is responding…</span>
                    <Dot delay="0ms" />
                    <Dot delay="150ms" />
                    <Dot delay="300ms" />
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <div className="border-t">
        {brains.length > 0 && (
          <div className="border-b px-1">
            <BrainSelector
              brains={brains}
              selectedBrainId={selectedBrainId}
              brainMode={brainMode}
              onSelectBrain={onSelectBrain}
              onSetMode={onSetBrainMode}
            />
          </div>
        )}

        <div className="p-3 pb-safe sm:p-4">
          <div className="mx-auto flex max-w-3xl items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
                }
              }}
              rows={1}
              aria-label="Message"
              placeholder="Message HajiHaz AI…"
              className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border bg-background px-4 py-3 text-base outline-none focus:ring-2 focus:ring-ring sm:text-sm"
            />
            <VoiceInput
              value={input}
              onChange={setInput}
              disabled={isGenerating || sending}
            />
            {isGenerating ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generation"
                title="Stop generation"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-foreground hover:bg-accent"
              >
                <Square className="size-4 fill-current" />
              </button>
            ) : (
              <button
                onClick={onSend}
                disabled={!input.trim()}
                aria-label="Send message"
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

export default Chat;

function ActionButton({
  label,
  onClick,
  danger,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`flex size-11 items-center justify-center rounded-md hover:bg-accent md:size-7 ${
        active ? "text-primary" : "text-muted-foreground"
      } ${danger ? "hover:text-destructive" : "hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

function DebugPanel({ meta }: { meta: NonNullable<Msg["meta"]> }) {
  const u = meta.usage;
  return (
    <div className="mt-1.5 rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-muted-foreground">
      <div>provider: {meta.provider ?? "—"} · model: {meta.model ?? "—"}</div>
      <div>
        latency: {meta.latencyMs ?? "—"}ms · tokens{u?.approx ? "≈" : ":"} {u?.totalTokens ?? "—"} (p
        {u?.promptTokens ?? "—"}/c{u?.completionTokens ?? "—"})
      </div>
      {meta.fallbackFrom ? (
        <div className="text-amber-600">
          fallback: {meta.fallbackFrom} → {meta.model} (attempts {meta.attempts ?? "—"})
        </div>
      ) : null}
      {meta.brainMode || meta.brainSlug || meta.brainId ? (
        <div className="mt-1 border-t border-border/40 pt-1 text-violet-500">
          <div>
            brain: {meta.brainSlug ?? "none"} · mode: {meta.brainMode ?? "manual"}
            {typeof meta.brainConfidence === "number" ? ` · confidence: ${meta.brainConfidence}%` : ""}
          </div>
          {meta.brainMatched && meta.brainMatched.length ? (
            <div>matched: {meta.brainMatched.join(", ")}</div>
          ) : null}
          {meta.brainReason ? <div>reason: {meta.brainReason}</div> : null}
          <div>
            retrieved → docs: {meta.knowledgeCount ?? 0} · memories: {meta.memoryCount ?? 0}
            {meta.retrievalMethod ? ` · method: ${meta.retrievalMethod}` : ""}
          </div>
          {meta.sources && meta.sources.length ? (
            <div>sources: {meta.sources.join(", ")}</div>
          ) : null}
          {meta.referenceEntity ? (
            <div>reference → {meta.referenceEntity}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  );
}

function MessagesSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <div className="flex justify-end">
        <div className="h-10 w-40 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="flex justify-start">
        <div className="h-20 w-64 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="flex justify-end">
        <div className="h-10 w-28 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="flex justify-start">
        <div className="h-16 w-56 animate-pulse rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
