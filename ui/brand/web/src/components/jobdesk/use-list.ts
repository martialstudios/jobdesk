"use client";
// JobDesk branded builds: "My list" on the client (server: /api/jobdesk/list).
import { useCallback, useEffect, useState } from "react";

export type ListItem = {
  url: string;
  company: string;
  title: string;
  location: string;
  postedAt: string;
  ats: string;
  addedAt: number;
  status: "saved" | "applied" | "skipped";
  appliedAt?: number;
  followUps?: number[];
  outcome?: "waiting" | "interview" | "offer" | "rejected";
  nextAt?: number;
  notes?: string;
  n?: string;
  score?: number | null;
  tailored?: boolean;
};

async function post(body: unknown): Promise<ListItem[] | null> {
  try {
    const r = await fetch("/api/jobdesk/list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    return Array.isArray(d.items) ? d.items : null;
  } catch {
    return null;
  }
}

export function useList(pollMs = 0) {
  const [items, setItems] = useState<ListItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const d = await (await fetch("/api/jobdesk/list")).json();
      if (Array.isArray(d.items)) setItems(d.items);
    } catch {
      /* keep what we have */
    }
    setLoaded(true);
  }, []);
  useEffect(() => {
    void refresh();
    if (!pollMs) return;
    const t = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(t);
  }, [refresh, pollMs]);
  const add = useCallback(async (offers: Partial<ListItem>[]) => {
    const next = await post({ add: offers });
    if (next) setItems(next);
    return next;
  }, []);
  const setStatus = useCallback(async (url: string, status: ListItem["status"]) => {
    const next = await post({ url, status });
    if (next) setItems(next);
  }, []);
  const update = useCallback(
    async (url: string, patch: { followedUp?: boolean; outcome?: ListItem["outcome"]; nextAt?: number | null; notes?: string; status?: ListItem["status"] }) => {
      const next = await post({ url, ...patch });
      if (next) setItems(next);
    },
    [],
  );
  const remove = useCallback(async (url: string) => {
    const next = await post({ url, remove: true });
    if (next) setItems(next);
  }, []);
  return { items, loaded, refresh, add, setStatus, update, remove };
}
