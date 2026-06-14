"use client";

import { motion } from "framer-motion";
import { Hand, Activity, Github, BookOpen } from "lucide-react";
import Link from "next/link";

type Props = {
  status: "online" | "offline" | "starting" | "error";
  modelLoaded: boolean;
  fps: number;
};

const statusCopy: Record<Props["status"], { label: string; color: string; dot: string }> = {
  online:   { label: "Online",   color: "text-emerald-700", dot: "bg-emerald-500" },
  starting: { label: "Starting", color: "text-amber-700",   dot: "bg-amber-500"   },
  offline:  { label: "Offline",  color: "text-stone-500",   dot: "bg-stone-400"   },
  error:    { label: "Error",    color: "text-red-600",     dot: "bg-red-500"     },
};

export function Header({ status, modelLoaded, fps }: Props) {
  const meta = statusCopy[status];
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-30 border-b border-stone-200 bg-[#f4f3ee]/90 backdrop-blur-xl"
    >
      <div className="hairline-flow absolute inset-x-0 bottom-0 h-px" />
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">

        <Link href="/" className="group flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-brand shadow-brand transition group-hover:bg-brand-dark">
            <Hand className="h-4 w-4 text-white" aria-hidden />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-emerald-500 ring-2 ring-[#f4f3ee]" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-stone-900">Sign Bridge</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-stone-400">Real-Time Translator</span>
          </div>
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          <StatusPill
            label={`${Math.round(fps)} FPS`}
            icon={<Activity className="h-3.5 w-3.5 text-brand" />}
          />
          <StatusPill
            label={modelLoaded ? "Model: Ready" : "Model: Heuristic"}
            icon={
              <span className={`h-1.5 w-1.5 rounded-full ${modelLoaded ? "bg-emerald-500" : "bg-amber-500"}`} />
            }
          />
          <div className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 shadow-card">
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} animate-pulse`} />
            <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <a
            href="/history"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-stone-500 transition hover:bg-stone-100 hover:text-stone-900 md:inline-flex"
          >
            <BookOpen className="h-3.5 w-3.5" /> History
          </a>
          <a
            href="https://github.com/Ghostfreak-cypher/real-time-sign-language-translator"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-stone-500 transition hover:bg-stone-100 hover:text-stone-900"
          >
            <Github className="h-3.5 w-3.5" />
          </a>
        </div>

      </div>
    </motion.header>
  );
}

function StatusPill({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="hidden items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-600 shadow-card lg:inline-flex">
      {icon}
      <span className="font-mono">{label}</span>
    </div>
  );
}
