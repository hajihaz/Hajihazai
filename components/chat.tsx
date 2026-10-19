"use client";

import Image from "next/image";

import { memo, useEffect, useLayoutEffect, useRef, useCallback, useState } from "react";
import {
  Copy,
  ImagePlus,
  Plus,
  ArrowUp,
  ChevronDown,
  ExternalLink,
  Paperclip,
  X,
  RotateCw,
  Pencil,
  GitFork,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Msg } from "./chat-app";
import HhcJobStatus from "./hhc-job-status";
import {
  ProfileCard,
  isProfileCardQuery,
  DEFAULT_PROFILE,
} from "./profile-card";
import VoiceInput from "./voice-input";

const MAX_ATTACH_BYTES = 5 * 1024 * 1024; // Match the upload API's 5 MB limit.
const MAX_ATTACH_COUNT = 5;
const SUPPORTED_ATTACHMENT = /\.(pdf|docx|txt|md|jpe?g|png|webp|gif)$/i;

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
  onBranchMessage,
  onStop,
  sending,
  isGenerating,
  loading,
  isAdmin,
  debug,
  onOpenImageGenerator,
  onOpenFileLibrary,
}: {
  messages: Msg[];
  conversationId: string | null;
  input: string;
  setInput: (v: string) => void;
  onSend: (files?: File[]) => boolean;
  onSendPrompt: (text: string) => void;
  onFeedback: (msg: Msg, value: "helpful" | "not_helpful") => void;
  onCopy: (text: string) => void;
  onDelete: (msg: Msg) => void;
  onRetry: (msg: Msg) => void;
  onEdit: (msg: Msg) => void;
  onBranchMessage: (msg: Msg) => void;
  onStop: () => void;
  sending: boolean;
  isGenerating: boolean;
  loading: boolean;
  isAdmin: boolean;
  debug: boolean;
  onOpenImageGenerator: () => void;
  onOpenFileLibrary: () => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [toolMenuOpen, setToolMenuOpen] = useState(false);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
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
    setShowJumpToLatest(dist > 220);
  }, []);

  // Instant, guarded scroll to bottom. Always direct scrollTop (never smooth)
  // so the composer never appears to jump, and the suppress window stays tight.
  const scrollToBottom = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    suppressScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    setShowJumpToLatest(false);
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
    setShowJumpToLatest(false);
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

  const submitComposer = () => {
    if (onSend(attachmentFiles)) setAttachmentFiles([]);
  };

  useEffect(() => {
    if (!toolMenuOpen) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setToolMenuOpen(false); };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [toolMenuOpen]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth"
      >
        <div className="mx-auto w-full max-w-[800px] px-4 py-6 sm:px-8 sm:py-8">
          {loading ? (
            <MessagesSkeleton />
          ) : messages.length === 0 ? (
            <div className="flex min-h-[45vh] flex-col items-center justify-center py-12 text-center sm:py-16">
              <div className="relative mb-4 flex size-14 items-center justify-center overflow-hidden rounded-2xl border border-border/60 bg-black shadow-sm">
                <Image
                  src="/branding/hajihaz-mark.png"
                  alt="HajiHaz AI mark"
                  width={512}
                  height={512}
                  priority
                  className="size-12 object-contain"
                />
              </div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                HajiHaz AI
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Where should we begin?
              </h2>
              <p className="mt-3 max-w-lg text-balance text-sm leading-6 text-muted-foreground sm:text-base">
                Ask, write, explore or build. Your conversations, knowledge,
                and projects are right here when you need them.
              </p>
              <div className="mt-8 grid w-full max-w-lg grid-cols-2 gap-2.5 text-left sm:gap-3">
                {[
                  { label: "Explain a concept", prompt: "Explain a complex topic in simple terms." },
                  { label: "Plan a project", prompt: "Help me break a project into clear actionable steps." },
                  { label: "Improve my writing", prompt: "Help me make my writing clearer and more effective." },
                  { label: "Explore an idea", prompt: "Help me develop an idea from scratch." },
                ].map((suggestion) => (
                  <button type="button" key={suggestion.label} onClick={() => onSendPrompt(suggestion.prompt)} className="rounded-2xl border border-border/70 bg-card px-4 py-3 text-left text-sm font-medium shadow-sm transition hover:border-foreground/20 hover:bg-accent sm:py-4">
                    {suggestion.label}<span className="mt-1 block text-xs font-normal text-muted-foreground">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              className="space-y-7 pb-4"
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
                const research = !isUser ? m.meta?.research ?? null : null;
                const researchSources =
                  m.meta?.sourceLinks?.length
                    ? m.meta.sourceLinks
                    : research?.sources ?? [];

                return (
                  <div
                    key={m.id}
                    className={`group flex flex-col ${isUser ? "items-end" : "items-start"}${m.isNew ? " animate-message" : ""}`}
                  >
                    <div className={`min-w-0 ${isUser ? "max-w-[88%] sm:max-w-[78%]" : "w-full"}`}>
                      <div
                        className={`break-anywhere text-[15px] leading-7 ${
                          isUser
                            ? "rounded-3xl bg-muted/80 px-4 py-2.5 text-foreground"
                            : m.error
                              ? "rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-foreground"
                              : "py-0.5 text-foreground"
                        }`}
                      >
                        {isUser ? (
                          <span className="whitespace-pre-wrap">
                            {m.content}
                          </span>
                        ) : (
                          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-7 prose-pre:rounded-lg prose-pre:border prose-pre:bg-background/60 prose-code:rounded prose-code:bg-background/60 prose-code:px-1 prose-code:text-[0.8em]">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {m.content}
                            </ReactMarkdown>
                            {m.streaming && (
                              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current align-middle opacity-70" />
                            )}
                          </div>
                        )}
                      </div>

                      {!isUser && !m.streaming && m.meta?.hhcCommandId && (
                        <HhcJobStatus
                          commandId={m.meta.hhcCommandId}
                          deviceName={m.meta.hhcDeviceName}
                        />
                      )}

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

                          {m.role === "assistant" && !m.error ? (
                            <ActionButton label="Branch from here" onClick={() => onBranchMessage(m)}>
                              <GitFork className="size-3.5" />
                            </ActionButton>
                          ) : null}

                          {m.role === "assistant" && !m.error ? (
                            <ActionButton label="Read aloud" onClick={() => { if (typeof window !== "undefined" && "speechSynthesis" in window) { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(m.content.replace(/[#*_`]/g, "")); u.lang = "en-US"; window.speechSynthesis.speak(u); } }}>
                              <Volume2 className="size-3.5" />
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

                      {research?.depth === "research" && !m.streaming ? (
                        <details className="mt-2 rounded-xl border bg-background/70 p-2.5" open={false}>
                          <summary className="cursor-pointer list-none text-xs font-semibold">
                            <span className="inline-flex items-center gap-2">
                              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-primary">Research</span>
                              <span>{research.evidenceCount ?? research.sources?.length ?? 0} evidence sources</span>
                            </span>
                          </summary>
                          <div className="mt-3 space-y-3">
                            {research.queries?.length ? (
                              <div>
                                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Research plan</p>
                                <ol className="space-y-1 text-xs text-muted-foreground">
                                  {research.queries.map((query, queryIndex) => (
                                    <li key={`${query}-${queryIndex}`} className="flex gap-2">
                                      <span className="font-semibold text-foreground">{queryIndex + 1}.</span>
                                      <span>{query}</span>
                                    </li>
                                  ))}
                                </ol>
                              </div>
                            ) : null}
                            {research.reason ? (
                              <p className="text-[10px] text-muted-foreground">{research.reason}</p>
                            ) : null}
                            {researchSources.length ? (
                              <div className="space-y-2">
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Evidence collected</p>
                                {researchSources.slice(0, 5).map((source, sourceIndex) => (
                                  <a key={source.url} href={source.url} target="_blank" rel="noreferrer noopener" className="block rounded-lg border bg-background p-2.5 hover:bg-accent">
                                    <div className="flex items-start gap-2">
                                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">{sourceIndex + 1}</span>
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-medium">{source.title}</p>
                                        <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{source.host || source.url}</p>
                                        {"snippet" in source && source.snippet ? <p className="mt-1 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">{source.snippet}</p> : null}
                                      </div>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </details>
                      ) : null}

                      {isAdmin && debug && m.role === "assistant" && m.meta ? (
                        <DebugPanel meta={m.meta} />
                      ) : null}

                      {researchSources.length ? (
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
                            {researchSources
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
                                  "kind" in source && source.kind === "website"
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

      {showJumpToLatest && (
        <button type="button" onClick={scrollToBottom} className="absolute bottom-[160px] left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-background px-3 py-2 text-xs font-medium shadow-lg hover:bg-accent" aria-label="Jump to latest message">
          <ChevronDown className="size-4" /> Latest
        </button>
      )}

      <div className="shrink-0 bg-background/95 px-3 pb-safe pt-2 backdrop-blur-xl sm:px-6">
        <div className="mx-auto w-full max-w-[800px]">
          <div className={`relative rounded-[26px] border border-border/80 bg-card p-2 shadow-[0_5px_30px_-15px_rgba(0,0,0,0.22)] transition focus-within:border-foreground/25 ${isDragOver ? "ring-2 ring-primary/50" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(event) => {
              event.preventDefault(); setIsDragOver(false);
              const dropped = Array.from(event.dataTransfer.files ?? []).filter((file) => SUPPORTED_ATTACHMENT.test(file.name) && file.size <= MAX_ATTACH_BYTES);
              setAttachmentFiles((current) => [...current, ...dropped].slice(0, MAX_ATTACH_COUNT));
              if (dropped.length < event.dataTransfer.files.length) window.alert("Some files were skipped. Max 5 MB each; PDF, DOCX, TXT, MD, or images only.");
            }}>
            {isDragOver && <div className="mb-2 rounded-xl border border-dashed bg-accent p-2 text-center text-xs">Drop to attach files</div>}
            {attachmentFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-2 pt-1 pb-2" aria-label="Attached files">
                {attachmentFiles.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-1.5 rounded-xl border bg-muted/60 py-1.5 pl-3 pr-1 text-xs">
                  <Paperclip className="size-3" /><span className="max-w-36 truncate">{file.name}</span>
                  <button type="button" onClick={() => setAttachmentFiles((files) => files.filter((_, i) => i !== index))} aria-label={`Remove ${file.name}`} className="flex size-6 items-center justify-center rounded-lg hover:bg-accent"><X className="size-3.5" /></button>
                </span>)}
              </div>
            )}
            <input ref={attachmentInputRef} type="file" accept="application/pdf,.pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              const valid = picked.filter((file) => SUPPORTED_ATTACHMENT.test(file.name) && file.size <= MAX_ATTACH_BYTES);
              if (valid.length < picked.length) window.alert("Some files could not be attached. Use PDF, DOCX, TXT, MD, or images up to 5 MB.");
              setAttachmentFiles((current) => [...current, ...valid].slice(0, MAX_ATTACH_COUNT));
              event.currentTarget.value = "";
            }} />
            <textarea ref={textareaRef} value={input} onChange={(event) => setInput(event.target.value)}
              onPaste={(event) => { const images = Array.from(event.clipboardData.files ?? []).filter((file) => /^image\/(jpeg|png|webp|gif)$/i.test(file.type)); if (images.length) setAttachmentFiles((current) => [...current, ...images.filter((file) => file.size <= MAX_ATTACH_BYTES)].slice(0, MAX_ATTACH_COUNT)); }}
              onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submitComposer(); } }}
              rows={1} aria-label="Message" placeholder="Message HajiHaz AI…"
              className="max-h-40 min-h-12 w-full resize-none bg-transparent px-3 py-3 text-base leading-6 outline-none placeholder:text-muted-foreground/85 sm:text-[15px]" />
            <div className="flex min-h-10 items-center justify-between gap-2 px-1 pb-0.5">
              <div className="flex min-w-0 items-center gap-1">
                <div className="relative">
                  <button type="button" onClick={() => setToolMenuOpen((value) => !value)} aria-label="Add attachments or tools" title="Add attachments or tools" aria-haspopup="menu" aria-expanded={toolMenuOpen} className="flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"><Plus className="size-5" /></button>
                  {toolMenuOpen && <>
                    <button type="button" className="fixed inset-0 z-30 cursor-default" tabIndex={-1} aria-label="Close attachment tools" onClick={() => setToolMenuOpen(false)} />
                    <div role="menu" className="absolute bottom-full left-0 z-40 mb-2 w-60 rounded-2xl border bg-popover p-1.5 shadow-xl">
                      <button type="button" role="menuitem" onClick={() => { setToolMenuOpen(false); attachmentInputRef.current?.click(); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm hover:bg-accent"><Paperclip className="size-4" /> Upload files</button>
                      <button type="button" role="menuitem" onClick={() => { setToolMenuOpen(false); onOpenFileLibrary(); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm hover:bg-accent"><Paperclip className="size-4" /> File library</button>
                      <button type="button" role="menuitem" onClick={() => { setToolMenuOpen(false); onOpenImageGenerator(); }} className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-sm hover:bg-accent"><ImagePlus className="size-4" /> Create image</button>
                    </div>
                  </>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <VoiceInput value={input} onChange={setInput} disabled={isGenerating || sending} />
                {isGenerating ? <button type="button" onClick={onStop} aria-label="Stop generation" title="Stop generation" className="flex size-9 items-center justify-center rounded-full bg-foreground text-background"><Square className="size-3.5 fill-current" /></button>
                  : <button type="button" onClick={() => { submitComposer(); }} disabled={!input.trim() && attachmentFiles.length === 0} aria-label="Send message" title="Send message" className="flex size-9 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-85 disabled:bg-muted disabled:text-muted-foreground"><ArrowUp className="size-5" /></button>}
              </div>
            </div>
          </div>
          <p className="hidden py-2 text-center text-[11px] text-muted-foreground/80 sm:block">HajiHaz AI can make mistakes. Verify important information.</p>
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
