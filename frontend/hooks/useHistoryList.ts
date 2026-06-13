"use client";

import { useEffect, useState, useCallback } from "react";
import type { HistoryItem } from "@/types";
import { fetchHistory, deleteHistory } from "@/lib/api";

export function useHistoryList() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const data = await fetchHistory(q);
      setItems(data);
    } catch {
      // ignore - keep previous items
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((h) => h._id !== id));
      try {
        await deleteHistory(id);
      } catch {
        // ignore
      }
    },
    []
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, refresh, remove };
}
