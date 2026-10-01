"use client";

// JobDesk branded builds: where the "howl" theme's drawings go. Nothing
// renders unless the brand file asked for the theme (BRAND_THEME=howl).
//   <HowlSky />      a soft sky behind the top of every page: drifting clouds
//                    by day, stars and the odd shooting star in dark mode
//   <HowlMeadow />   the flower meadow (and the castle) at the foot of the sidebar
//   <HowlTrack />    the castle walking along the loading overlay's progress bar

import { JOBDESK_THEME } from "@/lib/jobdesk-brand";
import { Castle, Cloud, Flame, HOWL_CSS, Meadow } from "./art";

export const howlOn = JOBDESK_THEME === "howl";

export function HowlStyles() {
  return howlOn ? <style>{HOWL_CSS}</style> : null;
}

// Fixed, so a page never re-randomizes them.
const STARS: [number, number, number][] = [
  [4, 18, 1.2], [9, 62, 0.8], [13, 34, 1], [18, 80, 0.9], [23, 12, 1.4], [27, 50, 0.8], [31, 26, 1], [36, 70, 1.1],
  [41, 8, 0.9], [45, 44, 1.3], [50, 22, 0.8], [54, 66, 1], [58, 36, 1.2], [63, 14, 0.9], [67, 58, 1], [72, 30, 1.4],
  [76, 76, 0.8], [80, 10, 1], [84, 48, 1.1], [88, 24, 0.9], [92, 64, 1.2], [96, 38, 0.8], [99, 16, 1],
];

export function HowlSky() {
  if (!howlOn) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-0 h-72 overflow-hidden">
      <div className="howl-day absolute inset-0" style={{ background: "linear-gradient(to bottom, hsl(203 70% 84% / .7), hsl(203 70% 90% / .35) 55%, transparent)" }}>
        {[
          { top: 18, width: 190, dur: 140, delay: -30, opacity: 0.95 },
          { top: 70, width: 120, dur: 190, delay: -120, opacity: 0.8 },
          { top: 36, width: 150, dur: 165, delay: -75, opacity: 0.85 },
        ].map((c, i) => (
          <Cloud
            key={i}
            width={c.width}
            className="howl-cloud absolute left-0"
            style={{ top: c.top, opacity: c.opacity, animation: `howl-drift ${c.dur}s linear ${c.delay}s infinite` }}
          />
        ))}
      </div>
      <div className="howl-night absolute inset-0" style={{ background: "linear-gradient(to bottom, hsl(226 42% 20% / .75), hsl(226 42% 14% / .3) 60%, transparent)" }}>
        {STARS.map(([x, y, r], i) => (
          <span
            key={i}
            className="howl-star absolute rounded-full bg-white"
            style={{ left: `${x}%`, top: `${y}%`, width: r * 2.2, height: r * 2.2, animation: `howl-twinkle ${3 + (i % 5)}s ease-in-out ${-i * 0.7}s infinite` }}
          />
        ))}
        <span
          className="howl-shooting absolute h-px w-24"
          style={{ right: "12%", top: "14%", rotate: "-25deg", background: "linear-gradient(to right, white, transparent)", animation: "howl-shoot 11s ease-out infinite" }}
        />
      </div>
    </div>
  );
}

export function HowlMeadow() {
  if (!howlOn) return null;
  return (
    <div aria-hidden className="-mx-4 -mb-20 mt-2">
      <Meadow />
    </div>
  );
}

/** The castle above the bar at `pct`, and the flame beside the percentage. */
export function HowlTrack({ pct }: { pct: number }) {
  if (!howlOn) return null;
  return (
    <div aria-hidden className="relative mb-1 h-14">
      <div className="absolute bottom-0" style={{ left: `calc(${pct}% - 28px)`, transition: "left .6s ease-out" }}>
        <Castle width={56} />
      </div>
    </div>
  );
}

export function HowlFlame({ size = 18 }: { size?: number }) {
  return howlOn ? <Flame size={size} style={{ display: "inline-block", verticalAlign: "-3px", marginRight: 6 }} /> : null;
}
