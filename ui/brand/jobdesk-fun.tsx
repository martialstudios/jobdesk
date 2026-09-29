"use client";

// JobDesk branded builds only (tools/brand_web.py adds this file and mounts it
// in the app shell). A full-screen, playful status from "Read my CV" until the
// first scan's results are on screen. The lines and timings come from the
// brand file via lib/jobdesk-brand.ts.
//
// Events on window, CustomEvent("jobdesk:fun", { detail }):
//   "start"  the CV was submitted (cv-ingest)
//   "done"   the first scan finished, found something or not (explore-provider)
//   "stop"   something failed: get out of the way so the error shows

import { useEffect, useState } from "react";
import { instrumentSerif } from "@/lib/fonts";
import { JOBDESK_FUN } from "@/lib/jobdesk-brand";

const SAFETY_MS = 6 * 60 * 1000;

export function JobdeskFun() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    let timers: number[] = [];
    let startedAt = 0;
    let revealing = false;
    // The scripted lines (all but a last "hold" line) take this long.
    const scriptMs = JOBDESK_FUN.lines.reduce((ms, [, secs]) => ms + (secs ?? 0) * 1000, 0);
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    const hide = () => {
      clear();
      startedAt = 0;
      revealing = false;
      setText(null);
    };
    const start = () => {
      clear();
      startedAt = Date.now();
      revealing = false;
      let at = 0;
      for (const [line, secs] of JOBDESK_FUN.lines) {
        timers.push(window.setTimeout(() => { if (!revealing) setText(line); }, at));
        at += (secs ?? 0) * 1000;
      }
      timers.push(window.setTimeout(hide, SAFETY_MS));
    };
    const finish = () => {
      if (!startedAt || revealing) return;
      // Let the script play out, then the reveal line, then the results.
      const wait = Math.max(0, startedAt + scriptMs + 1500 - Date.now());
      timers.push(window.setTimeout(() => {
        revealing = true;
        setText(JOBDESK_FUN.reveal);
        timers.push(window.setTimeout(hide, JOBDESK_FUN.revealSeconds * 1000));
      }, wait));
    };
    const onEvent = (e: Event) => {
      const what = (e as CustomEvent<string>).detail;
      if (what === "start") start();
      else if (what === "done") finish();
      else if (what === "stop") hide();
    };
    window.addEventListener("jobdesk:fun", onEvent);
    return () => {
      window.removeEventListener("jobdesk:fun", onEvent);
      clear();
    };
  }, []);

  if (text === null) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-8"
      style={{ background: "color-mix(in srgb, var(--bg) 96%, transparent)", color: "var(--fg)" }}
    >
      <p
        key={text}
        className={`${instrumentSerif.className} max-w-3xl text-center text-4xl leading-tight md:text-6xl`}
        style={{ animation: "co-rise .4s ease both" }}
      >
        {text}
      </p>
    </div>
  );
}
