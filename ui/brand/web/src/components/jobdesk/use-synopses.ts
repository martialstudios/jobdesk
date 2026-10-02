"use client";

// JobDesk branded builds: quick reads for the jobs on screen, a few at a time
// (/api/jobdesk/synopsis). Each url is asked for once per page load; already
// summarized jobs come back from the server's cache straight away.

import { useEffect, useRef, useState } from "react";
import type { SynopsisResult } from "@/lib/jobdesk/synopsis";

type Job = { url: string; title: string; company: string; location?: string };
/** undefined: not asked yet; "loading"; null: the posting couldn't be read. */
export type SynopsisState = SynopsisResult | "loading" | undefined;

const BATCH = 3;
const AT_ONCE = 4;

export function useSynopses(jobs: Job[]): Record<string, SynopsisState> {
  const [map, setMap] = useState<Record<string, SynopsisState>>({});
  const asked = useRef(new Set<string>());
  const queue = useRef<Job[][]>([]);
  const active = useRef(0);

  useEffect(() => {
    const fresh = jobs.filter((j) => !asked.current.has(j.url));
    if (!fresh.length) return;
    fresh.forEach((j) => asked.current.add(j.url));
    setMap((m) => ({ ...m, ...Object.fromEntries(fresh.map((j) => [j.url, "loading" as const])) }));
    for (let i = 0; i < fresh.length; i += BATCH) queue.current.push(fresh.slice(i, i + BATCH));

    const pump = () => {
      while (active.current < AT_ONCE && queue.current.length) {
        const batch = queue.current.shift()!;
        active.current++;
        fetch("/api/jobdesk/synopsis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobs: batch }),
        })
          .then((r) => r.json())
          .then((d: { items?: Record<string, SynopsisResult> }) => {
            const items = d.items || {};
            // Missing from the answer: no summary this time (not "unreadable").
            setMap((m) => ({ ...m, ...Object.fromEntries(batch.map((j) => [j.url, j.url in items ? items[j.url] : undefined])) }));
          })
          .catch(() => setMap((m) => ({ ...m, ...Object.fromEntries(batch.map((j) => [j.url, undefined])) })))
          .finally(() => {
            active.current--;
            pump();
          });
      }
    };
    pump();
  }, [jobs]);

  return map;
}
