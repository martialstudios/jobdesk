"use client";

// JobDesk branded builds: "A new version is ready". Checks a little after the
// app opens and every few hours (/api/jobdesk/update). "Update now" installs it
// (the app's server restarts, about a minute) and the page comes back on the
// new version with what's new; "Later" waits a day.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

type Check = { enabled?: boolean; available?: boolean; latest?: { stamp: string; notes: string } | null; error?: string };
type Progress = { state: string; pct?: number; label?: string; error?: string; notes?: string; stamp?: string; at?: number };

const LATER_KEY = "jobdesk:update-later";
const SEEN_KEY = "jobdesk:update-seen";

function read(key: string): string {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered */
  }
}
const firstLines = (notes: string) => notes.split("\n").map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean).slice(0, 4);

export function UpdateNotice() {
  const [check, setCheck] = useState<Check | null>(null);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [away, setAway] = useState(false);
  const [justUpdated, setJustUpdated] = useState<Progress | null>(null);

  const look = useCallback(() => {
    fetch("/api/jobdesk/update")
      .then((r) => r.json())
      .then((d: Check) => setCheck(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const first = window.setTimeout(look, 5000);
    const every = window.setInterval(look, 6 * 3600_000);
    // Back on a new version: say so once.
    fetch("/api/jobdesk/update?status=1")
      .then((r) => r.json())
      .then((s: Progress) => {
        if (s.state === "done" && s.stamp && read(SEEN_KEY) !== s.stamp && Date.now() - (s.at || 0) < 3600_000) {
          write(SEEN_KEY, s.stamp);
          setJustUpdated(s);
        }
      })
      .catch(() => {});
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [look]);

  // While updating: follow the updater; the server goes away while it installs.
  useEffect(() => {
    if (!updating) return;
    let wentAway = false;
    const t = window.setInterval(() => {
      fetch("/api/jobdesk/update?status=1", { cache: "no-store" })
        .then((r) => r.json())
        .then((s: Progress) => {
          setAway(false);
          setProgress(s);
          if (s.state === "done") window.setTimeout(() => window.location.reload(), wentAway ? 1500 : 500);
          if (s.state === "failed") window.clearInterval(t);
        })
        .catch(() => {
          wentAway = true;
          setAway(true);
        });
    }, 1500);
    return () => window.clearInterval(t);
  }, [updating]);

  const start = async () => {
    setUpdating(true);
    setProgress({ state: "checking" });
    try {
      await fetch("/api/jobdesk/update", { method: "POST" });
    } catch {
      /* the progress poll shows what happens */
    }
  };

  if (updating) {
    const failed = progress?.state === "failed";
    const line = away
      ? "Installing the new version… the app will be back in about a minute."
      : progress?.state === "downloading"
        ? `Downloading the update… ${progress.pct ?? 0}%`
        : progress?.state === "installing"
          ? "Installing the new version…"
          : progress?.state === "starting" || progress?.state === "done"
            ? "Starting the new version…"
            : "Getting the update…";
    return (
      <div role="status" className="fixed inset-0 z-[1002] flex items-center justify-center p-6" style={{ background: "color-mix(in srgb, var(--bg) 92%, transparent)" }}>
        <div className="max-w-md rounded-3xl border border-border p-8 text-center" style={{ background: "var(--bg)" }}>
          {failed ? (
            <>
              <p className="text-lg font-semibold text-foreground">The update didn&apos;t finish</p>
              <p className="mt-2 text-sm text-muted">{progress?.error || "Something went wrong."} Everything you saved is fine.</p>
              <button onClick={() => window.location.reload()} className="mt-5 rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground">
                OK
              </button>
            </>
          ) : (
            <>
              <Loader2 className="mx-auto size-6 animate-spin text-brand" />
              <p className="mt-4 text-lg text-foreground">{line}</p>
              {progress?.state === "downloading" && (
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface">
                  <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress.pct ?? 0}%` }} />
                </div>
              )}
              <p className="mt-3 text-sm text-muted">Your resume, list and follow-ups stay just as they are.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (justUpdated) {
    const notes = firstLines(justUpdated.notes || "");
    return (
      <div role="status" className="fixed bottom-6 left-6 z-50 max-w-sm rounded-2xl border border-border p-4 shadow-lg md:left-64" style={{ background: "var(--bg)" }}>
        <button onClick={() => setJustUpdated(null)} aria-label="Close" className="absolute right-2 top-2 rounded-md p-1 text-faint hover:text-foreground">
          <X className="size-4" />
        </button>
        <p className="flex items-center gap-2 font-medium text-foreground">
          <Sparkles className="size-4 text-brand" /> Updated!
        </p>
        {notes.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {notes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const stamp = check?.latest?.stamp || "";
  const later = read(LATER_KEY).split("|");
  const snoozed = later[0] === stamp && Date.now() < Number(later[1] || 0);
  if (!check?.available || !stamp || snoozed) return null;
  const notes = firstLines(check.latest?.notes || "");
  return (
    <div className="fixed bottom-6 left-6 z-50 max-w-sm rounded-2xl border border-brand/40 p-4 shadow-lg md:left-64" style={{ background: "var(--bg)" }}>
      <p className="flex items-center gap-2 font-medium text-foreground">
        <Sparkles className="size-4 text-brand" /> A new version is ready
      </p>
      {notes.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {notes.map((n) => (
            <li key={n}>• {n}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-faint">Takes about a minute. Everything you&apos;ve saved stays.</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => void start()} className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-200">
          Update now
        </button>
        <button
          onClick={() => {
            write(LATER_KEY, `${stamp}|${Date.now() + 24 * 3600_000}`);
            setCheck({ ...check, available: false });
          }}
          className="rounded-full px-3 py-2 text-sm text-muted hover:text-foreground"
        >
          Later
        </button>
      </div>
    </div>
  );
}
