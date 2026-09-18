"use client";

import Image from "next/image";

import { memo, useEffect, useLayoutEffect, useRef, useCallback, useState } from "react";
import {
  Copy,
  ImagePlus,
  ExternalLink,
  Paperclip,
  X,
  RotateCw,
  Pencil,
  Send,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Msg } from "./chat-app";
import BrainSelector, {
  type BrainOption,
  type BrainMode,
} from "./brain-selector";
import {
  ProfileCard,
  isProfileCardQuery,
  DEFAULT_PROFILE,
} from "./profile-card";
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
  onEdit,
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
  onOpenImageGenerator,
}: {
  messages: Msg[];
  conversationId: string | null;
  input: string;
  setInput: (v: string) => void;
  onSend: (files?: File[]) => void;
  onSendPrompt: (text: string) => void;
  onFeedback: (msg: Msg, value: "helpful" | "not_helpful") => void;
  onCopy: (text: string) => void;
  onDelete: (msg: Msg) => void;
  onRetry: (msg: Msg) => void;
  onEdit: (msg: Msg) => void;
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
  onOpenImageGenerator: () => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
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
            <div className="flex flex-col items-center py-12 text-center sm:py-16">
              <div className="relative mb-5 flex size-16 items-center justify-center overflow-hidden rounded-2xl border bg-black shadow-sm">
                <Image
                  src="/branding/hajihaz-mark.png"
                  alt="HajiHaz AI mark"
                  width={512}
                  height={512}
                  priority
                  className="size-14 object-contain"
                />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                HajiHaz AI
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                What are we building today?
              </h2>
              <p className="mt-3 max-w-lg text-balance text-sm leading-6 text-muted-foreground sm:text-base">
                Ask a question, bring a problem, or start with one of your
                workspaces. HajiHaz can use memory, knowledge and live evidence
                when the task calls for it.
              </p>
              <div className="mt-7 grid w-full max-w-2xl gap-3 text-left sm:grid-cols-2">
                {[
                  {
                    area: "Personal",
                    prompts: ["Who is Haji?", "What are Haji's goals?"],
                  },
                  {
                    area: "AllBee",
                    prompts: [
                      "Who founded AllBee?",
                      "What services does AllBee provide?",
                    ],
                  },
                  {
                    area: "Legal",
                    prompts: ["Explain Article 21.", "What is negligence?"],
                  },
                  {
                    area: "Suplaykart",
                    prompts: ["What is Suplaykart?", "Who founded Suplaykart?"],
                  },
                ].map(({ area, prompts }) => (
                  <div
                    key={area}
                    className="rounded-2xl border bg-background/60 p-3 shadow-sm transition-colors hover:border-foreground/20"
                  >
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {area}
                    </p>
                    <div className="flex flex-col gap-2">
                      {prompts.map((p) => (
                        <button
                          key={p}
                          onClick={() => onSendPrompt(p)}
                          className="rounded-xl border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent"
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
                          <span className="whitespace-pre-wrap">
                            {m.content}
                          </span>
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
                      {!isUser &&
                        !m.streaming &&
                        m.clarify &&
                        m.clarify.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.clarify.map((opt) => (
                              <button
                                key={opt}
                                onClick={() =>
                                  onSendPrompt(
                                    prevMsg?.role === "user"
                                      ? `${prevMsg.content} ${opt}`
                                      : opt,
                                  )
                                }
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
                          <ActionButton
                            label="Copy"
                            onClick={() => onCopy(m.content)}
                          >
                            <Copy className="size-3.5" />
                          </ActionButton>

                          {m.role === "user" ? (
                            <ActionButton label="Edit" onClick={() => onEdit(m)}>
                              <Pencil className="size-3.5" />
                            </ActionButton>
                          ) : null}

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
                              <ActionButton
                                label="Helpful"
                                active={m.feedback === "helpful"}
                                onClick={() => onFeedback(m, "helpful")}
                              >
                                <ThumbsUp className="size-3.5" />
                              </ActionButton>
                              <ActionButton
                                label="Not helpful"
                                active={m.feedback === "not_helpful"}
                                onClick={() => onFeedback(m, "not_helpful")}
                              >
                                <ThumbsDown className="size-3.5" />
                              </ActionButton>
                            </>
                          ) : null}

                          <ActionButton
                            label="Delete"
                            onClick={() => onDelete(m)}
                            danger
                          >
                            <Trash2 className="size-3.5" />
                          </ActionButton>
                        </div>
                      )}

                      {isAdmin && debug && m.role === "assistant" && m.meta ? (
                        <DebugPanel meta={m.meta} />
                      ) : null}

                      {m.meta?.sourceLinks?.length ? (
                        <div className="mt-2 rounded-xl border bg-background/70 p-2.5">
                          <div className="mb-1.5 flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              Verified sources
                            </p>
                            <span className="text-[10px] text-muted-foreground">
                              Live evidence
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {m.meta.sourceLinks
                              .slice(0, 5)
                              .map((source, index) => {
                                const quality =
                                  source.tier === 0
                                    ? "Official"
                                    : source.tier === 1
                                      ? "Primary"
                                      : source.tier === 2
                                        ? "Established"
                                        : source.tier === 3
                                          ? "Reference"
                                          : "Verified";
                                const kind =
                                  source.kind === "website"
                                    ? "Website"
                                    : "Web search";
                                const label =
                                  source.title || source.host || source.url;
                                return (
                                  <a
                                    key={source.url}
                                    href={source.url}
                                    target="_blank"
                                    rel="noreferrer noopener"
                                    className="group flex min-w-0 items-center gap-2 rounded-lg border bg-background px-2.5 py-2 transition-colors hover:bg-accent"
                                    title={source.url}
                                  >
                                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                                      {index + 1}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-xs font-medium">
                                        {label}
                                      </span>
                                      <span className="block truncate text-[10px] text-muted-foreground">
                                        {source.host || source.url} · {kind} ·{" "}
                                        {quality}
                                      </span>
                                    </span>
                                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                                  </a>
                                );
                              })}
                          </div>
                        </div>
                      ) : null}

                      {showProfileCard && (
                        <ProfileCard data={DEFAULT_PROFILE} />
                      )}
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
          <div
            className={`mx-auto max-w-3xl rounded-2xl transition ${isDragOver ? "ring-2 ring-primary/50" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault(); setIsDragOver(false);
              const dropped = Array.from(e.dataTransfer.files ?? []).filter((f) => /\.(pdf|docx|txt|md|jpe?g|png|webp|gif)$/i.test(f.name));
              setAttachmentFiles((current) => [...current, ...dropped].slice(0, 5));
            }}
          >
            {isDragOver ? <div className="mb-2 rounded-xl border border-dashed bg-accent/60 px-3 py-2 text-center text-xs font-medium text-muted-foreground">Drop files to attach</div> : null}
            {attachmentFiles.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2" aria-label="Attached files">
                {attachmentFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="flex max-w-full items-center gap-2 rounded-xl border bg-muted/50 px-2.5 py-1.5 text-xs">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-background font-semibold">{file.name.toLowerCase().endsWith(".pdf") ? "PDF" : file.name.split(".").pop()?.toUpperCase()}</span>
                    <span className="max-w-56 truncate">{file.name}</span>
                    {index === 1 ? <span className="hidden rounded-md bg-background px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline">Reference</span> : null}
                    <button type="button" onClick={() => setAttachmentFiles((files) => files.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`} title={`Remove ${file.name}`} className="flex size-6 shrink-0 items-center justify-center rounded-md hover:bg-accent"><X className="size-3.5" /></button>
                  </div>
                ))}
              </div>
            ) : null}
            <input ref={attachmentInputRef} type="file" accept="application/pdf,.pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              const valid = picked.filter((f) => /\.(pdf|docx|txt|md|jpe?g|png|webp|gif)$/i.test(f.name));
              const tooLarge = valid.find((f) => f.size > 12 * 1024 * 1024);
              if (tooLarge) window.alert(`${tooLarge.name} is larger than 12MB.`);
              setAttachmentFiles((current) => [...current, ...valid.filter((f) => f.size <= 12 * 1024 * 1024)].slice(0, 5));
              e.currentTarget.value = "";
            }} />
            <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const images = Array.from(e.clipboardData.files ?? []).filter((f) => /^image\/(jpeg|png|webp|gif)$/i.test(f.type));
                if (images.length) setAttachmentFiles((current) => [...current, ...images].slice(0, 5));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  const files = attachmentFiles;
                  setAttachmentFiles([]);
                  onSend(files);
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
            <button
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              aria-label="Attach files"
              title="Attach files"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Paperclip className="size-4" />
            </button>
            <button
              type="button"
              onClick={onOpenImageGenerator}
              aria-label="Create image"
              title="Create image"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ImagePlus className="size-4" />
            </button>
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
                onClick={() => { const files = attachmentFiles; setAttachmentFiles([]); onSend(files); }}
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
      <div>
        provider: {meta.provider ?? "—"} · model: {meta.model ?? "—"}
      </div>
      <div>
        latency: {meta.latencyMs ?? "—"}ms · tokens{u?.approx ? "≈" : ":"}{" "}
        {u?.totalTokens ?? "—"} (p
        {u?.promptTokens ?? "—"}/c{u?.completionTokens ?? "—"})
      </div>
      {meta.fallbackFrom ? (
        <div className="text-amber-600">
          fallback: {meta.fallbackFrom} → {meta.model} (attempts{" "}
          {meta.attempts ?? "—"})
        </div>
      ) : null}
      {meta.brainMode || meta.brainSlug || meta.brainId ? (
        <div className="mt-1 border-t border-border/40 pt-1 text-violet-500">
          <div>
            brain: {meta.brainSlug ?? "none"} · mode:{" "}
            {meta.brainMode ?? "manual"}
            {typeof meta.brainConfidence === "number"
              ? ` · confidence: ${meta.brainConfidence}%`
              : ""}
          </div>
          {meta.brainMatched && meta.brainMatched.length ? (
            <div>matched: {meta.brainMatched.join(", ")}</div>
          ) : null}
          {meta.brainReason ? <div>reason: {meta.brainReason}</div> : null}
          <div>
            retrieved → docs: {meta.knowledgeCount ?? 0} · memories:{" "}
            {meta.memoryCount ?? 0}
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
