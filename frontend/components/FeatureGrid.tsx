"use client";

import { motion } from "framer-motion";
import { Activity, Brain, Camera, Cpu, Sparkles } from "lucide-react";

const items = [
  {
    icon: <Camera className="h-4 w-4 text-brand" />,
    title: "Webcam Capture",
    desc: "Streams a 30 FPS feed straight from the browser using react-webcam.",
  },
  {
    icon: <Brain className="h-4 w-4 text-brand" />,
    title: "MediaPipe Hands",
    desc: "Detects up to two hands and extracts 21 (x, y, z) landmarks per hand.",
  },
  {
    icon: <Cpu className="h-4 w-4 text-brand" />,
    title: "Random Forest",
    desc: "scikit-learn classifier maps 63 features to A–Z, space & delete.",
  },
  {
    icon: <Activity className="h-4 w-4 text-brand" />,
    title: "Realtime Pipeline",
    desc: "Stable-prediction filter, sentence composition, and MongoDB history.",
  },
];

export function FeatureGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((it, i) => (
        <motion.div
          key={it.title}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 * i, duration: 0.3 }}
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-card transition hover:shadow-card-hover"
        >
          <div className="mb-2.5 flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-light ring-1 ring-brand-muted/40">
              {it.icon}
            </div>
            <div className="text-sm font-semibold text-stone-800">{it.title}</div>
          </div>
          <p className="text-xs leading-relaxed text-stone-500">{it.desc}</p>
        </motion.div>
      ))}
    </div>
  );
}

export function WelcomeBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex flex-col items-start gap-3 rounded-2xl border border-stone-200 bg-white p-6 shadow-card md:flex-row md:items-center md:justify-between"
    >
      <div>
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-brand-muted/60 bg-brand-light px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand">
          <Sparkles className="h-3 w-3" /> Demo Ready
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">
          Bridge the gap with <span className="text-gradient">real-time</span> sign translation
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-stone-500">
          Allow camera access, show a hand sign, and watch the system transcribe,
          translate, and speak — all in under 100 ms.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 font-mono text-[10px] text-stone-500">
          ⌘ K · shortcuts
        </span>
        <span className="rounded-md border border-stone-200 bg-stone-50 px-2.5 py-1 font-mono text-[10px] text-stone-500">
          /api/docs
        </span>
      </div>
    </motion.div>
  );
}
