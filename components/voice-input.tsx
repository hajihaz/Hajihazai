"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";

interface VoiceInputProps {
  /** Current composer value — speech is appended onto this base. */
  value: string;
  /** Replace the composer value with base + live transcript. */
  onChange: (text: string) => void;
  disabled?: boolean;
}

/* Web Speech API types are not in TypeScript's default lib. */
type SRAlternative = { transcript: string };
type SRResult = { 0: SRAlternative; isFinal: boolean };
type SRResultList = { length: number; [i: number]: SRResult };
type SREvent = { resultIndex: number; results: SRResultList };
type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type SRConstructor = { new (): SR };

function getSR(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  return (
    (window as unknown as { SpeechRecognition?: SRConstructor }).SpeechRecognition ??
    (window as unknown as { webkitSpeechRecognition?: SRConstructor }).webkitSpeechRecognition ??
    null
  );
}

export default function VoiceInput({ value, onChange, disabled }: VoiceInputProps) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SR | null>(null);
  // Composer text at the moment recording started — speech is appended to it.
  const baseRef = useRef("");
  // Finalized transcript accumulated across result events this session.
  const finalRef = useRef("");
  // Latest onChange, so recognition callbacks never read a stale closure.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    setSupported(!!getSR());
  }, []);

  // Abort any in-flight recognition if the component unmounts.
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getSR();
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // mobile-Safari-friendly: auto-stops on pause
    recognition.interimResults = true; // live transcription
    recognition.lang = "en-US";

    baseRef.current = value.trim();
    finalRef.current = "";

    // Each event carries the growing result set; accumulate finals and show the
    // current interim live. Replace (not append) so words never duplicate.
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res?.[0]?.transcript ?? "";
        if (res?.isFinal) finalRef.current += text;
        else interim += text;
      }
      const spoken = `${finalRef.current}${interim}`.trim();
      const base = baseRef.current;
      onChangeRef.current(base ? (spoken ? `${base} ${spoken}` : base) : spoken);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws if called while already active — reset cleanly.
      setListening(false);
    }
  }, [value]);

  // Unsupported (e.g. older browsers) → render nothing (graceful fallback).
  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={listening ? stopListening : startListening}
      disabled={disabled}
      aria-label={listening ? "Stop recording" : "Voice input"}
      title={listening ? "Stop recording" : "Voice input"}
      className={`flex size-9 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
        listening
          ? "bg-destructive/10 text-destructive animate-pulse"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {listening ? <Square className="size-4 fill-current" /> : <Mic className="size-4" />}
    </button>
  );
}
