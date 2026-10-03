"use client";

// JobDesk branded builds only (tools/brand_web.py adds this file and mounts it
// in the app shell). A full-screen, playful status from "Read my CV" until the
// first scan's results are on screen, with a progress bar and a live count of
// jobs found so you can see it's still working. The lines and timings come
// from the brand file via lib/jobdesk-brand.ts.
//
// Events on window, CustomEvent("jobdesk:fun", { detail }):
//   "start"   the CV was submitted (cv-ingest)
//   { kind: "progress", fraction, found }   the scan's progress (explore-provider)
//   "done"    the first scan finished, found something or not (explore-provider)
//   "stop"    something failed: get out of the way so the error shows
//   "pause"   the resume is read and the quick questions are up: step aside,
//             once the last timed line (the breathing one) has had LAST_LINE_MS
//   "resume"  questions answered, searching now: done (Find jobs shows its
//             own searching scene while the results come in)

import { useEffect, useState } from "react";
import { instrumentSerif } from "@/lib/fonts";
import { JOBDESK_FUN } from "@/lib/jobdesk-brand";
import { HowlFlame, HowlTrack } from "@/components/howl/decor";

const SAFETY_MS = 6 * 60 * 1000;
// The bar: reading the CV fills up to READ_SHARE (an estimate, easing in);
// the scan's real progress fills the rest.
const READ_SHARE = 35;
const READ_EASE_MS = 15000;
// The last timed line before the hold line gets at least this long on screen
// before the quick questions take over.
const LAST_LINE_MS = 4000;

type Progress = { kind: "progress"; fraction: number; found: number };

export function JobdeskFun() {
  const [text, setText] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [found, setFound] = useState(0);
  const [dots, setDots] = useState(1);

  useEffect(() => {
    let lineTimer = 0;
    let revealTimer = 0;
    let safety = 0;
    let ticker = 0;
    let startedAt = 0;
    let idx = 0;
    let shownAt = 0;
    let paused = false;
    let pauseWanted = false;
    let revealing = false;
    let finishWanted = false;
    let scanFraction = -1; // -1 until the scan reports
    const lines = JOBDESK_FUN.lines;
    const holdIndex = lines.length - 1;
    const clearAll = () => {
      window.clearTimeout(lineTimer);
      window.clearTimeout(revealTimer);
      window.clearTimeout(safety);
      window.clearInterval(ticker);
      lineTimer = revealTimer = safety = ticker = 0;
    };
    const up = (on: boolean) => window.dispatchEvent(new CustomEvent("jobdesk:fun-up", { detail: on }));
    const hide = () => {
      up(false);
      clearAll();
      startedAt = 0;
      revealing = false;
      finishWanted = false;
      setText(null);
    };
    // Never moves backwards.
    const bump = (next: number) => setPct((p) => Math.max(p, Math.min(100, next)));
    const tick = () => {
      setDots((d) => (d % 3) + 1);
      if (scanFraction < 0 && startedAt && !paused) {
        bump(READ_SHARE * (1 - Math.exp(-(Date.now() - startedAt) / READ_EASE_MS)));
      }
    };
    const reveal = () => {
      revealing = true;
      window.clearTimeout(lineTimer);
      bump(100);
      setText(JOBDESK_FUN.reveal);
      revealTimer = window.setTimeout(hide, JOBDESK_FUN.revealSeconds * 1000);
    };
    // Show line i, then the next one after its time (the last one holds).
    const show = (i: number) => {
      idx = Math.min(i, holdIndex);
      shownAt = Date.now();
      // The resume is read: the questions wait for the last timed line.
      if (pauseWanted && idx >= holdIndex) return stepAside();
      setText(lines[idx][0]);
      const secs = lines[idx][1];
      window.clearTimeout(lineTimer);
      if (pauseWanted && idx === holdIndex - 1) {
        lineTimer = window.setTimeout(stepAside, LAST_LINE_MS);
      } else if (idx < holdIndex && secs !== null) {
        lineTimer = window.setTimeout(() => !paused && !revealing && show(idx + 1), secs * 1000);
      } else if (finishWanted) {
        lineTimer = window.setTimeout(reveal, 1500);
      }
    };
    const start = () => {
      clearAll();
      startedAt = Date.now();
      paused = revealing = finishWanted = pauseWanted = false;
      scanFraction = -1;
      setPct(0);
      setFound(0);
      show(0);
      up(true);
      safety = window.setTimeout(hide, SAFETY_MS);
      ticker = window.setInterval(tick, 450);
    };
    // Questions between reading the resume and searching: step aside, but
    // not before the last timed line (the breathing one) has had its moment.
    const stepAside = () => {
      up(false);
      paused = true;
      pauseWanted = false;
      window.clearTimeout(lineTimer);
      setText(null);
    };
    const pause = () => {
      if (!startedAt || paused) return;
      const last = holdIndex - 1;
      if (idx > last || (idx === last && Date.now() - shownAt >= LAST_LINE_MS)) return stepAside();
      pauseWanted = true;
      if (idx === last) {
        window.clearTimeout(lineTimer);
        lineTimer = window.setTimeout(stepAside, LAST_LINE_MS - (Date.now() - shownAt));
      }
    };
    // Searching now: Find jobs has its own scene for that, so this is done.
    const resume = () => {
      if (!startedAt) return;
      hide();
    };
    const progress = (p: Progress) => {
      if (!startedAt) return;
      scanFraction = Math.max(scanFraction, Math.min(1, p.fraction || 0));
      bump(READ_SHARE + (98 - READ_SHARE) * scanFraction);
      setFound((f) => Math.max(f, p.found || 0));
    };
    // The results are in: once the script reaches its last line, the reveal.
    const finish = () => {
      if (!startedAt || revealing || paused) return;
      finishWanted = true;
      if (idx >= holdIndex) {
        window.clearTimeout(lineTimer);
        lineTimer = window.setTimeout(reveal, 1500);
      }
    };
    const onEvent = (e: Event) => {
      const what = (e as CustomEvent<string | Progress>).detail;
      if (what === "start") start();
      else if (what === "done") finish();
      else if (what === "stop") hide();
      else if (what === "pause") pause();
      else if (what === "resume") resume();
      else if (what && typeof what === "object" && what.kind === "progress") progress(what);
    };
    window.addEventListener("jobdesk:fun", onEvent);
    return () => {
      window.removeEventListener("jobdesk:fun", onEvent);
      clearAll();
    };
  }, []);

  if (text === null) return null;
  // "searching" → "searching." → "searching.." → "searching..." while it works.
  const shown = JOBDESK_FUN.dots.includes(text) ? text + ".".repeat(dots) : text;
  const rounded = Math.round(pct);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center gap-10 p-8"
      style={{ background: "color-mix(in srgb, var(--bg) 97%, transparent)", color: "var(--fg)" }}
    >
      <p
        key={text}
        className={`${instrumentSerif.className} max-w-3xl text-center text-4xl leading-tight md:text-6xl`}
        style={{ animation: "co-rise .4s ease both" }}
      >
        {/* Room for the dots, so the word doesn't shift as they grow. */}
        <span>{shown}</span>
        {JOBDESK_FUN.dots.includes(text) && <span style={{ visibility: "hidden" }}>{".".repeat(3 - dots)}</span>}
      </p>
      <div className="w-full max-w-md" aria-label={`${rounded} percent`}>
        <HowlTrack pct={rounded} />
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 12%, transparent)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${rounded}%`, background: "hsl(26 73% 51%)", transition: "width .6s ease" }}
          />
        </div>
        <div className="mt-3 flex justify-between font-mono text-sm" style={{ color: "color-mix(in srgb, var(--fg) 65%, transparent)" }}>
          <span>
            <HowlFlame />
            {rounded}%
          </span>
          <span>{found > 0 ? `${found.toLocaleString()} job${found === 1 ? "" : "s"} found so far` : "reading your resume"}</span>
        </div>
      </div>
    </div>
  );
}
