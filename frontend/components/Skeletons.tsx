"use client";

import { motion } from "framer-motion";

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-card p-4">
      <div className="h-3 w-20 animate-pulse rounded bg-white/10" />
      <div className="mt-3 h-8 w-32 animate-pulse rounded bg-white/5" />
    </div>
  );
}

export function PanelSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="rounded-2xl border border-white/10 bg-card"
      style={{ height }}
    >
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-2.5">
        <div className="h-2 w-2 animate-pulse rounded-full bg-white/20" />
        <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
      </div>
      <div className="p-4">
        <div className="h-3 w-3/4 animate-pulse rounded bg-white/5" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-white/5" />
      </div>
    </div>
  );
}

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-3"
      >
        <div className="relative h-12 w-12">
          <span className="absolute inset-0 animate-ping rounded-full bg-violet-500/30" />
          <span className="absolute inset-2 animate-pulse rounded-full bg-violet-500/50" />
        </div>
        <p className="text-sm text-zinc-400">Loading Sign Bridge…</p>
      </motion.div>
    </div>
  );
}
