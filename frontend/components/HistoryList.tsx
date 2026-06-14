"use client";

import { motion } from "framer-motion";
import { History as HistoryIcon, Search, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HistoryItem } from "@/types";
import { formatTimestamp } from "@/lib/utils";

type Props = {
  items: HistoryItem[];
  onSearch: (q?: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  debounceMs?: number;
};

export function HistoryList({ items, onSearch, onDelete, debounceMs = 250 }: Props) {
  const [q, setQ] = useState("");
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => { onSearch(q.trim()); }, debounceMs);
    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [q, debounceMs, onSearch]);

  return (
    <div className="rounded-2xl border border-stone-200 bg-white shadow-card">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 bg-stone-50/60 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <HistoryIcon className="h-4 w-4 text-brand" /> Translation History
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            aria-label="Search translations"
            className="w-44 rounded-lg border border-stone-200 bg-white py-1.5 pl-8 pr-2.5 text-xs text-stone-700 placeholder-stone-400 transition focus:border-brand/50 focus:outline-none focus:ring-2 focus:ring-brand/10"
          />
        </div>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="p-6 text-center text-sm text-stone-400">
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
                  className="group flex items-start justify-between gap-3 rounded-xl border border-stone-100 bg-stone-50/60 p-3 transition hover:border-stone-200 hover:bg-white hover:shadow-card"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-800">{it.text}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-stone-400">
                      <span className="font-mono">{formatTimestamp(it.timestamp)}</span>
                      <span>·</span>
                      <span className="rounded-md border border-brand-muted/40 bg-brand-light px-1.5 py-0.5 font-medium text-brand">
                        {it.prediction}
                      </span>
                      <span>·</span>
                      <span className="font-mono font-medium text-emerald-600">
                        {(Math.min(Math.max(it.confidence, 0), 1) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  {it._id && (
                    <button
                      onClick={() => onDelete(it._id!)}
                      className="rounded-lg p-1.5 text-stone-400 transition hover:bg-red-50 hover:text-red-500"
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
