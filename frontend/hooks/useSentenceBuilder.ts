"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HistoryItem, PredictionResponse } from "@/types";
import { fetchHistory, pushHistory, deleteHistory } from "@/lib/api";

const COOLDOWN_MS = 900;
const SENTINEL = "—";

export function useSentenceBuilder() {
  const [sentence, setSentence] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const lastAddedRef = useRef<{ label: string; ts: number }>({
    label: "",
    ts: 0,
  });

  const handlePrediction = useCallback((p: PredictionResponse | null) => {
    if (!p) return;
    const label = p.prediction.trim();
    if (
      !label ||
      label === SENTINEL ||
      label === "Unknown" ||
      label === "Model not trained"
    ) {
      return;
    }
    const now = Date.now();
    if (
      lastAddedRef.current.label === label &&
      now - lastAddedRef.current.ts < COOLDOWN_MS
    ) {
      return;
    }
    lastAddedRef.current = { label, ts: now };
    setSentence((prev) => {
      // Avoid back-to-back duplicates.
      // Use .at(-1) instead of [length-1] to satisfy noUncheckedIndexedAccess.
      if (
        prev.length > 0 &&
        prev.at(-1)?.toLowerCase() === label.toLowerCase()
      ) {
        return prev;
      }
      return [...prev, label];
    });
  }, []);

  const clear = useCallback(() => {
    setSentence([]);
    lastAddedRef.current = { label: "", ts: 0 };
  }, []);

  const backspace = useCallback(() => {
    setSentence((prev) => prev.slice(0, -1));
  }, []);

  const text = sentence.join(" ");

  const saveToHistory = useCallback(
    async (confidence: number) => {
      if (!text) return;
      try {
        const item = await pushHistory({
          text,
          confidence,
          prediction: sentence[sentence.length - 1] ?? text,
        });
        setHistory((prev) => [item, ...prev].slice(0, 200));
      } catch {
        // Offline fallback
        setHistory((prev) =>
          [
            {
              text,
              prediction: sentence[sentence.length - 1] ?? text,
              confidence,
              timestamp: new Date().toISOString(),
            },
            ...prev,
          ].slice(0, 200),
        );
      }
    },
    [sentence, text],
  );

  const refreshHistory = useCallback(async (q?: string) => {
    try {
      const items = await fetchHistory(q);
      setHistory(items);
    } catch {
      // ignore
    }
  }, []);

  const removeFromHistory = useCallback(async (id: string) => {
    setHistory((prev) => prev.filter((h) => h._id !== id));
    try {
      await deleteHistory(id);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  return {
    sentence,
    text,
    history,
    handlePrediction,
    clear,
    backspace,
    saveToHistory,
    refreshHistory,
    removeFromHistory,
  };
}
