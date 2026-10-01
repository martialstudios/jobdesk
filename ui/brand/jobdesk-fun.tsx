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

import { useEffect, useState } from "react";
import { instrumentSerif } from "@/lib/fonts";
import { JOBDESK_FUN } from "@/lib/jobdesk-brand";

const SAFETY_MS = 6 * 60 * 1000;
// The bar: reading the CV fills up to READ_SHARE (an estimate, easing in);
// the scan's real progress fills the rest.
const READ_SHARE = 35;
const READ_EASE_MS = 15000;

type Progress = { kind: "progress"; fraction: number; found: number };

export function JobdeskFun() {
  const [text, setText] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const [found, setFound] = useState(0);
  const [dots, setDots] = useState(1);

  useEffect(() => {
    let timers: number[] = [];
    let ticker = 0;
    let startedAt = 0;
    let revealing = false;
    let scanFraction = -1; // -1 until the scan reports
    // The scripted lines (all but a last "hold" line) take this long.
    const scriptMs = JOBDESK_FUN.lines.reduce((ms, [, secs]) => ms + (secs ?? 0) * 1000, 0);
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
      window.clearInterval(ticker);
      ticker = 0;
    };
    const hide = () => {
      clear();
      startedAt = 0;
      revealing = false;
      setText(null);
    };
    // Never moves backwards.
    const bump = (next: number) => setPct((p) => Math.max(p, Math.min(100, next)));
    const tick = () => {
      setDots((d) => (d % 3) + 1);
      if (scanFraction < 0 && startedAt) {
        bump(READ_SHARE * (1 - Math.exp(-(Date.now() - startedAt) / READ_EASE_MS)));
      }
    };
    const start = () => {
      clear();
      startedAt = Date.now();
      revealing = false;
      scanFraction = -1;
      setPct(0);
      setFound(0);
      let at = 0;
      for (const [line, secs] of JOBDESK_FUN.lines) {
        timers.push(window.setTimeout(() => { if (!revealing) setText(line); }, at));
        at += (secs ?? 0) * 1000;
      }
      timers.push(window.setTimeout(hide, SAFETY_MS));
      ticker = window.setInterval(tick, 450);
    };
    const progress = (p: Progress) => {
      if (!startedAt) return;
      scanFraction = Math.max(scanFraction, Math.min(1, p.fraction || 0));
      bump(READ_SHARE + (98 - READ_SHARE) * scanFraction);
      setFound((f) => Math.max(f, p.found || 0));
    };
    const finish = () => {
      if (!startedAt || revealing) return;
      // Let the script play out, then the reveal line, then the results.
      const wait = Math.max(0, startedAt + scriptMs + 1500 - Date.now());
      timers.push(window.setTimeout(() => {
        revealing = true;
        bump(100);
        setText(JOBDESK_FUN.reveal);
        timers.push(window.setTimeout(hide, JOBDESK_FUN.revealSeconds * 1000));
      }, wait));
    };
    const onEvent = (e: Event) => {
      const what = (e as CustomEvent<string | Progress>).detail;
      if (what === "start") start();
      else if (what === "done") finish();
      else if (what === "stop") hide();
      else if (what && typeof what === "object" && what.kind === "progress") progress(what);
    };
    window.addEventListener("jobdesk:fun", onEvent);
    return () => {
      window.removeEventListener("jobdesk:fun", onEvent);
      clear();
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
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--fg) 12%, transparent)" }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${rounded}%`, background: "hsl(26 73% 51%)", transition: "width .6s ease" }}
          />
        </div>
        <div className="mt-3 flex justify-between font-mono text-sm" style={{ color: "color-mix(in srgb, var(--fg) 65%, transparent)" }}>
          <span>{rounded}%</span>
          <span>{found > 0 ? `${found.toLocaleString()} job${found === 1 ? "" : "s"} found so far` : "reading your resume"}</span>
        </div>
      </div>
    </div>
  );
}
