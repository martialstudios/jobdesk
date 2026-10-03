"use client";

// JobDesk branded builds: how the applications stand, at a glance, at the top
// of My list and Follow-ups: how many she's applied to, how many are waiting
// to hear back (and how many of those are due a nudge), interviews and offers.
// Each tile opens Follow-ups.

import Link from "next/link";
import type { ListItem } from "./use-list";
import { planFor } from "./plan";

export function AppliedTracker({ items, link = true }: { items: ListItem[]; link?: boolean }) {
  const applied = items.filter((i) => i.status === "applied");
  const stages = applied.map((i) => planFor(i).stage);
  const tiles: { label: string; n: number; tone?: "due" | "good" }[] = [
    { label: "Applied", n: applied.length },
    { label: "Waiting to hear back", n: stages.filter((s) => s === "waiting" || s === "due" || s === "quiet").length },
    { label: "Time to follow up", n: stages.filter((s) => s === "due").length, tone: "due" },
    { label: "Interviews", n: applied.filter((i) => i.outcome === "interview").length, tone: "good" },
    { label: "Offers", n: applied.filter((i) => i.outcome === "offer").length, tone: "good" },
  ];
  const tile = (t: (typeof tiles)[number]) => (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        t.tone === "due" && t.n > 0
          ? "border-amber-500/40 bg-amber-500/10"
          : t.tone === "good" && t.n > 0
            ? "border-emerald-500/40 bg-emerald-500/10"
            : "border-border"
      }`}
      style={t.n > 0 && t.tone ? undefined : { background: "var(--bg)" }}
    >
      <div className="text-2xl font-semibold tabular-nums text-foreground">{t.n}</div>
      <div className="text-xs text-muted">{t.label}</div>
    </div>
  );
  return (
    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Your applications">
      {tiles.map((t) =>
        link ? (
          <Link key={t.label} href="/follow-ups" className="block transition hover:opacity-90">
            {tile(t)}
          </Link>
        ) : (
          <div key={t.label}>{tile(t)}</div>
        ),
      )}
    </div>
  );
}
