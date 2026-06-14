"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { WebcamPanel } from "@/components/WebcamPanel";
import { SignDisplay } from "@/components/SignDisplay";
import { SentenceBar } from "@/components/SentenceBar";
import { FeatureGrid, WelcomeBanner } from "@/components/FeatureGrid";
import { HistoryList } from "@/components/HistoryList";
import { useHandRecognition } from "@/hooks/useHandRecognition";
import { useSentenceBuilder } from "@/hooks/useSentenceBuilder";
import { useSpeech } from "@/hooks/useSpeech";
import { checkHealth } from "@/lib/api";

export default function HomePage() {
  const {
    webcamRef,
    detection,
    prediction,
    sequencePrediction,
    error,
    ready,
    cameraReady,
    videoConstraints,
    onUserMedia,
    onUserMediaError,
  } = useHandRecognition();

  const {
    sentence,
    text,
    history,
    handlePrediction,
    clear,
    backspace,
    saveToHistory,
    refreshHistory,
    removeFromHistory,
  } = useSentenceBuilder();

  const { speak, stop: stopSpeech, muted, speaking, toggleMute } = useSpeech();
  const [enabled, setEnabled] = useState(true);
  const [health, setHealth] = useState<{
    status: string;
    model_loaded: boolean;
    database: string;
  } | null>(null);

  // Health check
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const h = await checkHealth();
        if (!cancelled) setHealth(h);
      } catch {
        if (!cancelled)
          setHealth({
            status: "offline",
            model_loaded: false,
            database: "offline",
          });
      }
    };
    tick();
    const id = window.setInterval(tick, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // Auto-add stable predictions to the sentence
  useEffect(() => {
    if (!prediction) return;
    handlePrediction(prediction);
  }, [prediction, handlePrediction]);

  const handleSave = useCallback(
    async (conf: number) => {
      // saveToHistory already updates the local history state optimistically.
      // A separate refreshHistory() call would cause a visible flicker by
      // overwriting the optimistic update with an identical server response.
      await saveToHistory(conf);
    },
    [saveToHistory],
  );

  const handleToggle = useCallback(() => setEnabled((e) => !e), []);

  const status = error
    ? "error"
    : !ready || !cameraReady
      ? "starting"
      : health
        ? health.status === "ok"
          ? "online"
          : "offline"
        : "starting";

  return (
    <div className="relative min-h-screen">
      {/* Warm backdrop: dot grid + drifting terracotta/sand aurora */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="dot-grid absolute inset-0 opacity-60" />
        <div className="aurora absolute -top-1/4 left-1/4 h-[60vh] w-[60vw] rounded-full bg-brand/6 blur-[140px]" />
        <div
          className="aurora absolute -bottom-1/4 right-1/4 h-[50vh] w-[50vw] rounded-full bg-stone-400/8 blur-[120px]"
          style={{ animationDelay: "-9s" }}
        />
      </div>

      <Header
        status={status}
        modelLoaded={health?.model_loaded ?? false}
        fps={detection.fps}
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-6">
        <WelcomeBanner />
        <FeatureGrid />

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="grid grid-cols-1 gap-4 lg:grid-cols-5"
        >
          <div className="lg:col-span-3">
            <WebcamPanel
              webcamRef={webcamRef}
              videoConstraints={videoConstraints}
              onUserMedia={onUserMedia}
              onUserMediaError={onUserMediaError}
              detection={detection}
              prediction={prediction}
              enabled={enabled}
              ready={ready}
              cameraReady={cameraReady}
              error={error}
              onToggle={handleToggle}
            />
          </div>
          <div className="lg:col-span-2">
            <SignDisplay
              prediction={prediction}
              sequencePrediction={sequencePrediction}
              landmarkCount={detection.present ? 21 : 0}
              fps={detection.fps}
              latencyMs={prediction?.latency_ms ?? null}
            />
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          <SentenceBar
            words={sentence}
            text={text}
            onClear={clear}
            onBackspace={backspace}
            onSave={handleSave}
            onSpeak={speak}
            muted={muted}
            speaking={speaking}
            onToggleMute={toggleMute}
            onStopSpeech={stopSpeech}
            lastConfidence={prediction?.confidence ?? 0}
          />
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <HistoryList
            items={history}
            onSearch={refreshHistory}
            onDelete={removeFromHistory}
          />
        </motion.section>

        <footer className="pt-2 text-center text-[11px] text-zinc-600">
          Sign Bridge · MediaPipe Hands · scikit-learn · FastAPI · Next.js
        </footer>
      </main>
    </div>
  );
}
