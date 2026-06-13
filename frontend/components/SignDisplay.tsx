"use client";

import { motion } from "framer-motion";
import { Sparkles, TrendingUp, Zap } from "lucide-react";
import type { PredictionResponse } from "@/types";
import { cn, formatPercent } from "@/lib/utils";

type Props = {
  prediction: PredictionResponse | null;
  landmarkCount: number;
  fps: number;
  latencyMs: number | null;
};

export function SignDisplay({
  prediction,
  landmarkCount,
  fps,
  latencyMs,
}: Props) {
  const label = prediction?.prediction ?? "—";
  const confidence = prediction?.confidence ?? 0;
  const isPlaceholder =
    !prediction || label === "—" || label === "Model not trained";

  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-card">
      <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <Sparkles className="h-4 w-4 text-violet-300" />
          Detected Sign
        </div>
        <span className="font-mono text-[10px] text-zinc-500">
          {latencyMs !== null ? `${latencyMs.toFixed(0)} ms` : "—"}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <motion.div
          key={label}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className={cn(
            "text-6xl font-semibold tracking-tight md:text-7xl",
            isPlaceholder ? "text-zinc-700" : "text-gradient",
          )}
        >
          {label}
        </motion.div>
        <p className="max-w-xs text-xs text-zinc-500">
          {isPlaceholder
            ? "Show a sign to your webcam to begin translation."
            : "Stable prediction. Speak, save, or compose a sentence."}
        </p>

        <div className="grid w-full grid-cols-2 gap-2 pt-2">
          <Metric
            icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-300" />}
            label="Confidence"
            value={formatPercent(Math.min(confidence, 1), 0)}
            tone={
              confidence >= 0.8 ? "good" : confidence >= 0.5 ? "warn" : "muted"
            }
          />
          <Metric
            icon={<Zap className="h-3.5 w-3.5 text-cyan-300" />}
            label="Stream"
            value={`${Math.max(0, Math.round(fps))} fps`}
            tone={fps >= 25 ? "good" : fps >= 15 ? "warn" : "muted"}
          />
        </div>

        <div className="w-full">
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-zinc-500">
            <span>Landmarks captured</span>
            <span className="font-mono text-zinc-400">{landmarkCount}/21</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400"
              initial={{ width: 0 }}
              animate={{ width: `${(landmarkCount / 21) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {prediction?.top_k && prediction.top_k.length > 0 && (
          <div className="w-full space-y-1.5 pt-1">
            <div className="text-[10px] uppercase tracking-wider text-zinc-500">
              Top alternatives
            </div>
            {prediction.top_k.slice(0, 3).map((alt, i) => (
              <div
                key={`${alt.label}-${i}`}
                className="flex items-center justify-between rounded-md border border-white/5 bg-white/[0.02] px-2.5 py-1 text-xs"
              >
                <span className="text-zinc-300">{alt.label}</span>
                <span className="font-mono text-zinc-500">
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
  const toneClass =
    tone === "good"
      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
      : tone === "warn"
        ? "border-amber-500/20 bg-amber-500/5 text-amber-200"
        : "border-white/5 bg-white/[0.02] text-zinc-300";
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-left", toneClass)}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <div className="font-mono text-base font-semibold">{value}</div>
    </div>
  );
}
