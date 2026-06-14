"use client";

import { motion } from "framer-motion";
import { Sparkles, TrendingUp, Zap } from "lucide-react";
import type { PredictionResponse, SequencePredictionResponse } from "@/types";
import { cn, formatPercent } from "@/lib/utils";

type Props = {
  prediction: PredictionResponse | null;
  sequencePrediction: SequencePredictionResponse | null;
  landmarkCount: number;
  fps: number;
  latencyMs: number | null;
};

export function SignDisplay({
  prediction,
  sequencePrediction,
  landmarkCount,
  fps,
  latencyMs,
}: Props) {
  const staticConf = prediction?.confidence ?? 0;
  const seqConf = sequencePrediction?.confidence ?? 0;
  const showMotion =
    sequencePrediction !== null &&
    sequencePrediction.prediction !== "—" &&
    seqConf > 0 &&
    seqConf > staticConf;

  const activePrediction = showMotion ? sequencePrediction : prediction;
  const label = activePrediction?.prediction ?? "—";
  const confidence = activePrediction?.confidence ?? 0;
  const activeLatency = showMotion ? (sequencePrediction?.latency_ms ?? null) : latencyMs;

  const isPlaceholder = !activePrediction || label === "—" || label === "Model not trained";

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-card">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <Sparkles className="h-4 w-4 text-brand" />
          Detected Sign
        </div>
        <span className="font-mono text-[10px] text-stone-400">
          {activeLatency !== null ? `${activeLatency.toFixed(0)} ms` : "—"}
        </span>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">

        {/* Big letter */}
        <motion.div
          key={label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, type: "spring", stiffness: 260, damping: 22 }}
          className={cn(
            "text-7xl font-bold tracking-tight md:text-8xl",
            isPlaceholder ? "text-stone-200" : "text-gradient",
          )}
        >
          {label}
        </motion.div>

        {/* Motion badge */}
        {showMotion && (
          <span className="rounded-full border border-brand-muted/50 bg-brand-light px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-brand">
            motion
          </span>
        )}

        {/* Sub-label */}
        <p className="max-w-xs text-xs text-stone-400">
          {isPlaceholder
            ? "Show a sign to your webcam to begin translation."
            : showMotion
              ? "Motion sign detected via LSTM sequence model."
              : "Stable prediction. Speak, save, or compose a sentence."}
        </p>

        {/* Confidence + FPS pills */}
        <div className="grid w-full grid-cols-2 gap-2 pt-1">
          <Metric
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            label="Confidence"
            value={formatPercent(Math.min(confidence, 1), 0)}
            tone={confidence >= 0.6 ? "good" : confidence >= 0.35 ? "warn" : "muted"}
          />
          <Metric
            icon={<Zap className="h-3.5 w-3.5" />}
            label="Stream"
            value={`${Math.max(0, Math.round(fps))} fps`}
            tone={fps >= 25 ? "good" : fps >= 15 ? "warn" : "muted"}
          />
        </div>

        {/* Landmark progress */}
        <div className="w-full">
          <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-stone-400">
            <span>Landmarks captured</span>
            <span className="font-mono text-stone-500">{landmarkCount}/21</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
            <motion.div
              className="h-full rounded-full bg-brand"
              initial={{ width: 0 }}
              animate={{ width: `${(landmarkCount / 21) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Top-k alternatives */}
        {prediction?.top_k && prediction.top_k.length > 0 && !showMotion && (
          <div className="w-full space-y-1.5 pt-1">
            <div className="text-[10px] uppercase tracking-wider text-stone-400">
              Top alternatives
            </div>
            {prediction.top_k.slice(0, 3).map((alt, i) => (
              <div
                key={`${alt.label}-${i}`}
                className="flex items-center justify-between rounded-lg border border-stone-100 bg-stone-50 px-2.5 py-1 text-xs"
              >
                <span className="font-medium text-stone-700">{alt.label}</span>
                <span className="font-mono text-stone-400">
                  {(alt.confidence * 100).toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "good" | "warn" | "muted";
}) {
  const styles = {
    good: "border-emerald-200 bg-emerald-50 text-emerald-800 [&_svg]:text-emerald-500",
    warn: "border-amber-200  bg-amber-50  text-amber-800  [&_svg]:text-amber-500",
    muted:"border-stone-200  bg-stone-50  text-stone-600  [&_svg]:text-stone-400",
  }[tone];

  return (
    <div className={cn("rounded-xl border px-3 py-2.5 text-left transition", styles)}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-70">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-base font-bold">{value}</div>
    </div>
  );
}
