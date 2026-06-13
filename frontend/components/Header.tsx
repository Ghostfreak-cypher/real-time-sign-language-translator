"use client";

import { motion } from "framer-motion";
import { Hand, Activity, Github, BookOpen } from "lucide-react";
import Link from "next/link";

type Props = {
  status: "online" | "offline" | "starting" | "error";
  modelLoaded: boolean;
  fps: number;
};

const statusCopy: Record<
  Props["status"],
  { label: string; color: string; dot: string }
> = {
  online: { label: "Online", color: "text-emerald-300", dot: "bg-emerald-400" },
  starting: { label: "Starting", color: "text-amber-300", dot: "bg-amber-400" },
  offline: { label: "Offline", color: "text-zinc-400", dot: "bg-zinc-500" },
  error: { label: "Error", color: "text-rose-300", dot: "bg-rose-400" },
};

export function Header({ status, modelLoaded, fps }: Props) {
  const meta = statusCopy[status];
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="sticky top-0 z-30 border-b border-white/5 bg-background/70 backdrop-blur-xl"
    >
      <div className="hairline-flow absolute inset-x-0 bottom-0 h-px" />
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/30 to-cyan-500/20 ring-1 ring-white/10 transition group-hover:ring-violet-400/40">
            <Hand className="h-4 w-4 text-white" aria-hidden />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-emerald-400 ring-2 ring-background" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-white">
              Sign Bridge
            </span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
              Real-Time Translator
            </span>
          </div>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          <StatusPill
            label={`${Math.round(fps)} FPS`}
            icon={<Activity className="h-3.5 w-3.5" />}
          />
          <StatusPill
            label={modelLoaded ? "Model: Ready" : "Model: Heuristic"}
            icon={
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  modelLoaded ? "bg-emerald-400" : "bg-amber-400"
                }`}
              />
            }
          />
          <div className="flex items-center gap-2 rounded-full border border-white/5 bg-white/[0.02] px-3 py-1.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${meta.dot} animate-pulse`}
            />
            <span className={`text-xs font-medium ${meta.color}`}>
              {meta.label}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <a
            href="/history"
            className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-white md:inline-flex"
          >
            <BookOpen className="h-3.5 w-3.5" /> History
          </a>
          {/* TODO: replace with the actual repository URL */}
          <a
            href="https://github.com/your-org/real-time-sign-language-translator"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-white/5 hover:text-white"
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
    <div className="hidden items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.02] px-3 py-1.5 text-xs text-zinc-300 lg:inline-flex">
      {icon}
      <span className="font-mono">{label}</span>
    </div>
  );
}
