"use client";

import { isValidElement, memo, useState, type ComponentProps, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

function getContent(children: ReactNode) {
  if (!isValidElement<{ children?: ReactNode; className?: string }>(children)) {
    return { text: typeof children === "string" ? children : "", language: "" };
  }
  const language = children.props.className?.match(/language-([A-Za-z0-9+#_-]+)/)?.[1] ?? "";
  const raw = children.props.children;
  const text = typeof raw === "string" ? raw : Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === "string").join("") : "";
  return { text, language };
}

const ChatCodeBlock = memo(function ChatCodeBlock({ children, ...props }: ComponentProps<"pre">) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const { text, language } = getContent(children);
  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setError(false);
    } catch {
      setCopied(false);
      setError(true);
    }
  };
  return (
    <div className="not-prose my-3 min-w-0 overflow-hidden rounded-xl border border-border/80 bg-muted/35">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-border/70 bg-muted/65 px-3">
        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{language || "Code"}</span>
        <button type="button" onClick={() => void copy()} disabled={!text}
          title={error ? "Clipboard unavailable" : "Copy code"}
          aria-label={error ? "Clipboard unavailable" : copied ? "Code copied" : "Copy code"}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline focus-visible:outline-2 disabled:opacity-40">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {error ? "Unavailable" : copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre {...props} className="max-w-full overflow-x-auto bg-transparent p-3 text-[13px] leading-6 text-foreground">{children}</pre>
    </div>
  );
});
export default ChatCodeBlock;
