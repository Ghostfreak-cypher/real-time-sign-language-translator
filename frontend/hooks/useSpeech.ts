"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { speak as apiSpeak } from "@/lib/api";

/**
 * Browser-side text-to-speech with a backend fallback.
 * Uses the Web Speech API SpeechSynthesis when available; otherwise POSTs to
 * /api/speak for server-side pyttsx3 playback.
 */
export function useSpeech() {
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const utterRef = useRef<SpeechSynthesisUtterance | null>(null);
  // Wall-clock fallback in case the browser never fires `onend`/`onerror`
  // (a known issue with some Chromium builds after the tab is throttled).
  const watchdogRef = useRef<number | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const armWatchdog = useCallback(
    (text: string) => {
      clearWatchdog();
      // Estimate ~80 ms per character, with a sane minimum and maximum.
      const ms = Math.min(60_000, Math.max(1500, text.length * 80));
      watchdogRef.current = window.setTimeout(() => {
        setSpeaking(false);
        watchdogRef.current = null;
      }, ms);
    },
    [clearWatchdog],
  );

  const speak = useCallback(
    async (text: string) => {
      const cleaned = text.trim();
      if (!cleaned || muted) return;

      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        try {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance(cleaned);
          u.rate = 1;
          u.pitch = 1;
          u.volume = 1;
          u.onstart = () => {
            setSpeaking(true);
            armWatchdog(cleaned);
          };
          u.onend = () => {
            setSpeaking(false);
            clearWatchdog();
          };
          u.onerror = () => {
            setSpeaking(false);
            clearWatchdog();
          };
          utterRef.current = u;
          window.speechSynthesis.speak(u);
          return;
        } catch {
          // fall through to backend
        }
      }

      try {
        setSpeaking(true);
        await apiSpeak(cleaned);
      } catch {
        // ignore
      } finally {
        setSpeaking(false);
      }
    },
    [muted, armWatchdog, clearWatchdog],
  );

  const stop = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    clearWatchdog();
  }, [clearWatchdog]);

  const toggleMute = useCallback(() => setMuted((m) => !m), []);

  useEffect(
    () => () => {
      stop();
      clearWatchdog();
    },
    [stop, clearWatchdog],
  );

  return { speak, stop, muted, speaking, toggleMute };
}
