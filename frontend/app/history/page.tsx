"use client";

import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import { HistoryList } from "@/components/HistoryList";
import { useHistoryList } from "@/hooks/useHistoryList";
import { useSpeech } from "@/hooks/useSpeech";

export default function HistoryPage() {
  const { items, refresh, remove } = useHistoryList();
  const { speak } = useSpeech();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
            <BookOpen className="h-4 w-4 text-cyan-300" /> History
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6 md:px-6">
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5"
        >
          <h1 className="text-xl font-semibold text-white">Translation History</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Every sentence you save is persisted to MongoDB. Click an item to speak it back.
          </p>
        </motion.div>
        <HistoryList items={items} onSearch={refresh} onDelete={remove} />
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 5).map((h) => (
            <button
              key={h._id ?? h.text}
              onClick={() => speak(h.text)}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-white/10"
            >
              ▶ {h.text}
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
