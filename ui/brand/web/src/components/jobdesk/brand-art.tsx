"use client";

// JobDesk branded builds: a picture of the builder's choosing (BRAND_ART in
// the brand file), flying in the sky at the top right of every page, behind
// the content, drifting gently. On the app's own background (a transparent
// picture), with a faint light edge in dark mode so black ink stays visible.
// On the loading screen after a resume is uploaded (the "start" of the
// JobdeskFun overlay) she takes off: FLY_WAIT_MS in, she flies right to left
// across the screen, then glides back into her spot and floats there, above
// the loading screen while it's up. Hidden on narrow windows. Renders nothing
// without one.

import { useEffect, useState, type CSSProperties } from "react";
import { JOBDESK_ART } from "@/lib/jobdesk-brand";

const FLY_WAIT_MS = 5000;
const FLY_MS = 7000;
const BACK_MS = 2200;

const CSS = `
@keyframes jd-art-fly { 0%, 100% { transform: translate(0, 0) rotate(-2deg) } 50% { transform: translate(-6px, -8px) rotate(1deg) } }
@keyframes jd-art-across { 0% { transform: translate(0, 0) } 40% { transform: translate(-45vw, 14vh) } 100% { transform: translate(calc(-100vw - 100%), 4vh) } }
@keyframes jd-art-back { from { transform: translateX(calc(100% + 3vw)) } to { transform: translateX(0) } }
.jd-art { animation: jd-art-fly 6s ease-in-out infinite; filter: none }
.dark .jd-art { filter: drop-shadow(0 0 0.5px rgba(255, 255, 255, .6)) }
@keyframes jd-gust { 0% { stroke-dashoffset: 0; opacity: 0 } 15% { opacity: 1 } 100% { stroke-dashoffset: -520; opacity: 0 } }
@keyframes jd-wind-build { 0% { opacity: 0; transform: scaleX(.35) } 35% { opacity: .55; transform: scaleX(.7) } 70% { opacity: 1; transform: scaleX(1.15) } 100% { opacity: .8; transform: scaleX(1.3) } }
.jd-wind { position: absolute; left: 62%; top: 4%; width: 300px; height: 92%; overflow: visible; transform-origin: left center; color: rgba(110, 132, 168, .6) }
.dark .jd-wind { color: rgba(214, 226, 255, .5) }
.jd-wind path { fill: none; stroke: currentColor; stroke-linecap: round; stroke-dasharray: 90 430; animation: jd-gust var(--d, .9s) cubic-bezier(.3, .1, .6, 1) var(--l, 0s) infinite }
@media (prefers-reduced-motion: reduce) { .jd-art, .jd-art-trip, .jd-wind, .jd-wind path { animation: none !important } .jd-wind { display: none } }
`;

// Gusts streaming off behind her while she flies across (she flies left, so
// they trail to the right): long, slightly wavy streaks and a couple of curls,
// staggered, getting longer and stronger as she speeds up.
const GUSTS: { d: string; w: number; dur: string; delay: string }[] = [
  { d: "M0 18 C 60 10, 120 26, 180 16 S 280 8, 320 18", w: 2.2, dur: ".85s", delay: "0s" },
  { d: "M10 40 C 70 34, 140 50, 210 40 S 300 30, 340 40", w: 3, dur: ".7s", delay: ".2s" },
  { d: "M0 58 C 50 52, 110 66, 170 60 C 200 57, 214 46, 204 40 C 196 35, 186 44, 196 50 C 230 66, 290 60, 330 62", w: 1.8, dur: "1.05s", delay: ".45s" },
  { d: "M20 76 C 90 70, 150 84, 230 76 S 310 70, 350 78", w: 2.6, dur: ".75s", delay: ".1s" },
  { d: "M5 96 C 60 92, 120 104, 190 96 S 270 88, 300 96", w: 1.6, dur: ".95s", delay: ".55s" },
  { d: "M30 30 C 80 26, 120 36, 150 30 C 170 26, 178 16, 168 12 C 160 9, 154 18, 162 22 C 200 36, 260 28, 300 30", w: 1.4, dur: "1.15s", delay: ".3s" },
];

function Wind({ ms }: { ms: number }) {
  return (
    <svg className="jd-wind" viewBox="0 0 340 112" preserveAspectRatio="none" aria-hidden="true"
      style={{ animation: `jd-wind-build ${ms}ms ease-in both` }}>
      {GUSTS.map((g, i) => (
        <path key={i} d={g.d} strokeWidth={g.w} style={{ "--d": g.dur, "--l": g.delay } as CSSProperties} />
      ))}
    </svg>
  );
}

type Trip = "home" | "across" | "back";

export function BrandArt() {
  const [trip, setTrip] = useState<Trip>("home");
  const [overlay, setOverlay] = useState(false);

  useEffect(() => {
    if (!JOBDESK_ART) return;
    let timers: number[] = [];
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    const onEvent = (e: Event) => {
      const what = (e as CustomEvent).detail;
      if (what !== "start") return;
      clear();
      timers.push(window.setTimeout(() => setTrip("across"), FLY_WAIT_MS));
      timers.push(window.setTimeout(() => setTrip("back"), FLY_WAIT_MS + FLY_MS));
      timers.push(window.setTimeout(() => setTrip("home"), FLY_WAIT_MS + FLY_MS + BACK_MS));
    };
    // Above the loading screen for as long as it's actually up.
    const onUp = (e: Event) => setOverlay(!!(e as CustomEvent<boolean>).detail);
    window.addEventListener("jobdesk:fun", onEvent);
    window.addEventListener("jobdesk:fun-up", onUp);
    return () => {
      window.removeEventListener("jobdesk:fun", onEvent);
      window.removeEventListener("jobdesk:fun-up", onUp);
      clear();
    };
  }, []);

  if (!JOBDESK_ART) return null;
  const trip_ =
    trip === "across"
      ? `jd-art-across ${FLY_MS}ms ease-in-out both`
      : trip === "back"
        ? `jd-art-back ${BACK_MS}ms cubic-bezier(.22,.8,.32,1) both`
        : undefined;
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed right-[1.2vw] top-1 hidden md:block ${overlay || trip !== "home" ? "z-[1001]" : "z-0"}`}
    >
      <style>{CSS}</style>
      <div key={trip} className="jd-art-trip relative" style={{ animation: trip_ }}>
        {trip === "across" && <Wind ms={FLY_MS} />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={JOBDESK_ART} alt="" className="jd-art h-auto w-auto" style={{ maxHeight: 118 }} />
      </div>
    </div>
  );
}
