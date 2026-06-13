"use client";

import { motion } from "framer-motion";
import { History as HistoryIcon, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HistoryItem } from "@/types";
import { formatTimestamp } from "@/lib/utils";

type Props = {
  items: HistoryItem[];
  /** q is optional so callers can pass an async hook function directly. */
  onSearch: (q?: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  debounceMs?: number;
};

export function HistoryList({
  items,
  onSearch,
  onDelete,
  debounceMs = 250,
}: Props) {
  const [q, setQ] = useState("");
  const debounceRef = useRef<number | null>(null);

  // Debounce parent notifications so we don't fire one request per keystroke.
  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(() => {
      onSearch(q.trim());
    }, debounceMs);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [q, debounceMs, onSearch]);

  return (
    <div className="rounded-2xl border border-white/10 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-white/5 bg-white/[0.02] px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
          <HistoryIcon className="h-4 w-4 text-cyan-300" /> Translation History
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            aria-label="Search translations"
            className="w-44 rounded-lg border border-white/10 bg-white/5 py-1.5 pl-7 pr-2 text-xs text-zinc-200 placeholder-zinc-500 focus:border-violet-500/50 focus:outline-none"
          />
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            No translations yet. Save one to see it appear here.
          </div>
        ) : (
          <ul className="space-y-1">
            {items.map((it, i) => {
              const key = it._id ?? `${it.text}-${it.timestamp ?? i}`;
              return (
                <motion.li
                  key={key}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 10) * 0.02 }}
                  className="group flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-white/[0.02] p-3 transition hover:border-white/10 hover:bg-white/[0.04]"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-zinc-100">{it.text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-zinc-500">
                      <span className="font-mono">
                        {formatTimestamp(it.timestamp)}
                      </span>
                      <span>·</span>
                      <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-300">
                        {it.prediction}
                      </span>
                      <span>·</span>
                      <span className="font-mono text-emerald-300">
                        {(
                          Math.min(Math.max(it.confidence, 0), 1) * 100
                        ).toFixed(0)}
                        %
                      </span>
                    </div>
                  </div>
                  {it._id && (
                    <button
                      onClick={() => onDelete(it._id!)}
                      className="rounded-md p-1.5 text-zinc-500 transition hover:bg-rose-500/10 hover:text-rose-300"
                      aria-label={`Delete ${it.text}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
