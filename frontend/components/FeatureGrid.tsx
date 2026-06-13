"use client";

import { motion } from "framer-motion";
import { Activity, Brain, Camera, Cpu, Sparkles } from "lucide-react";

const items = [
  {
    icon: <Camera className="h-4 w-4 text-cyan-300" />,
    title: "Webcam Capture",
    desc: "Streams a 30 FPS feed straight from the browser using react-webcam.",
  },
  {
    icon: <Brain className="h-4 w-4 text-violet-300" />,
    title: "MediaPipe Hands",
    desc: "Detects up to two hands and extracts 21 (x, y, z) landmarks per hand.",
  },
  {
    icon: <Cpu className="h-4 w-4 text-emerald-300" />,
    title: "Random Forest",
    desc: "scikit-learn classifier maps 63 features to A–Z, space & delete",
  },
  {
    icon: <Activity className="h-4 w-4 text-amber-300" />,
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
          className="glass rounded-xl p-4"
        >
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5">
              {it.icon}
            </div>
            <div className="text-sm font-medium text-zinc-100">{it.title}</div>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">{it.desc}</p>
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
      className="glass flex flex-col items-start gap-3 rounded-2xl p-5 md:flex-row md:items-center md:justify-between"
    >
      <div>
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-200">
          <Sparkles className="h-3 w-3" /> Demo ready
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Bridge the gap with <span className="text-gradient">real-time</span> sign translation
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-400">
          Allow camera access, show a hand sign, and watch the system transcribe,
          translate, and speak — all in under 100 ms.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-300">
          ⌘ K · shortcuts
        </span>
        <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1 font-mono text-[10px] text-zinc-300">
          /api/docs
        </span>
      </div>
    </motion.div>
  );
}
