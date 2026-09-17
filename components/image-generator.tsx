"use client";

import { useEffect, useState } from "react";
import { Download, ImagePlus, Loader2, Sparkles, X } from "lucide-react";

const RATIOS = [
  ["1:1", "Square"],
  ["4:3", "Landscape"],
  ["3:4", "Portrait"],
  ["16:9", "Wide"],
  ["9:16", "Story"],
  ["3:2", "Photo"],
] as const;

const PRESETS = [
  [
    "Photoreal",
    "Photorealistic, natural light, premium photography, authentic materials",
  ],
  [
    "Cinematic",
    "Cinematic composition, dramatic lighting, rich depth, film still quality",
  ],
  [
    "Editorial",
    "Editorial art direction, sophisticated composition, refined visual hierarchy",
  ],
  [
    "Product",
    "Premium commercial product photography, clean studio lighting, precise details",
  ],
  [
    "Illustration",
    "Highly polished digital illustration, expressive shapes, beautiful color harmony",
  ],
  [
    "Brand",
    "Minimal luxury brand identity, precise geometry, elegant negative space",
  ],
] as const;

export default function ImageGenerator({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [ratio, setRatio] = useState<string>("1:1");
  const [size, setSize] = useState<string>("2K");
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const generate = async () => {
    const clean = prompt.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    setImage(null);
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: clean,
          aspectRatio: ratio,
          imageSize: size,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.image) {
        setError(
          data?.error || "Couldn't generate the image. Please try again.",
        );
        return;
      }
      setImage(data.image);
    } catch {
      setError("Couldn't reach the image generator. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    if (!image) return;
    const link = document.createElement("a");
    link.href = image;
    link.download = `hajihaz-${Date.now()}.png`;
    link.click();
  };

  const applyPreset = (name: string, guidance: string) => {
    setPreset(name);
    setPrompt((current) =>
      current.trim()
        ? `${current.trim()}\n\nStyle direction: ${guidance}.`
        : guidance,
    );
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Create image"
    >
      <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border bg-background shadow-2xl">
        <div className="flex items-center gap-3 border-b px-4 py-3 sm:px-5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Create an image</h2>
            <p className="text-xs text-muted-foreground">
              Describe it naturally. HajiHaz handles the visual direction.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close image generator"
            className="flex size-9 items-center justify-center rounded-xl hover:bg-accent disabled:opacity-40"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(320px,0.85fr)_minmax(420px,1.15fr)]">
          <div className="border-b p-4 sm:p-5 lg:border-b-0 lg:border-r">
            <label
              htmlFor="image-prompt"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Prompt
            </label>
            <textarea
              id="image-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value.slice(0, 4000))}
              placeholder="A cinematic portrait of a young architect in a sunlit brutalist studio, editorial photography..."
              className="mt-2 min-h-40 w-full resize-none rounded-2xl border bg-background px-4 py-3 text-sm leading-6 outline-none focus:ring-2 focus:ring-ring"
              disabled={busy}
              autoFocus
            />
            <div className="mt-1 text-right text-[10px] text-muted-foreground">
              {prompt.length}/4000
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Style direction
                </span>
                <span className="text-[10px] text-muted-foreground">
                  Optional
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map(([name, guidance]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => applyPreset(name, guidance)}
                    disabled={busy}
                    aria-pressed={preset === name}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${preset === name ? "border-foreground bg-foreground text-background" : "bg-background hover:bg-accent"}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="image-ratio"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Aspect ratio
                </label>
                <select
                  id="image-ratio"
                  value={ratio}
                  onChange={(event) => setRatio(event.target.value)}
                  disabled={busy}
                  className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  {RATIOS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {value} · {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="image-size"
                  className="text-xs font-semibold text-muted-foreground"
                >
                  Quality
                </label>
                <select
                  id="image-size"
                  value={size}
                  onChange={(event) => setSize(event.target.value)}
                  disabled={busy}
                  className="mt-1.5 w-full rounded-xl border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="1K">1K · Fast</option>
                  <option value="2K">2K · High</option>
                  <option value="4K">4K · Ultra</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void generate()}
              disabled={!prompt.trim() || busy}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
            >
              {busy ? (
                <>
                  <Loader2 className="size-4 animate-spin" /> Creating your
                  image…
                </>
              ) : (
                <>
                  <ImagePlus className="size-4" /> Generate image
                </>
              )}
            </button>
            {error ? (
              <p
                role="alert"
                className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex min-h-[340px] items-center justify-center bg-muted/20 p-4 sm:p-6">
            {image ? (
              <div className="w-full max-w-2xl">
                <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                  {/* Generated output is a controlled data URL from our authenticated API. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt={prompt || "Generated image"}
                    className="mx-auto max-h-[62dvh] w-full object-contain"
                  />
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={download}
                    className="flex h-10 items-center gap-2 rounded-xl border bg-background px-3 text-xs font-semibold hover:bg-accent"
                  >
                    <Download className="size-3.5" /> Download PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => void generate()}
                    disabled={busy}
                    className="flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-40"
                  >
                    <Sparkles className="size-3.5" /> Regenerate
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-sm text-center">
                <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border bg-background shadow-sm">
                  <ImagePlus className="size-7 text-muted-foreground" />
                </div>
                <p className="mt-4 text-sm font-medium">
                  Your image will appear here
                </p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Use a clear subject, setting and mood. Add a style preset when
                  you want a stronger art direction.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
