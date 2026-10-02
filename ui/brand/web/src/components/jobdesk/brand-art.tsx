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

import { useEffect, useState } from "react";
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
@media (prefers-reduced-motion: reduce) { .jd-art, .jd-art-trip { animation: none !important } }
`;

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
      if (what === "start" || what === "resume") setOverlay(true);
      if (what === "pause" || what === "done" || what === "stop") setOverlay(false);
      if (what !== "start") return;
      clear();
      timers.push(window.setTimeout(() => setTrip("across"), FLY_WAIT_MS));
      timers.push(window.setTimeout(() => setTrip("back"), FLY_WAIT_MS + FLY_MS));
      timers.push(window.setTimeout(() => setTrip("home"), FLY_WAIT_MS + FLY_MS + BACK_MS));
    };
    window.addEventListener("jobdesk:fun", onEvent);
    return () => {
      window.removeEventListener("jobdesk:fun", onEvent);
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
      <div key={trip} className="jd-art-trip" style={{ animation: trip_ }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={JOBDESK_ART} alt="" className="jd-art h-auto w-auto" style={{ maxHeight: 118 }} />
      </div>
    </div>
  );
}
