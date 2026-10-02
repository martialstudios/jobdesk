"use client";

// JobDesk branded builds: the first application is a moment. The first time
// they mark one sent, confetti and the builder's word of encouragement
// (BRAND_CHEER); after that, just a small "Sent!".

import { useEffect, useMemo, useState } from "react";
import { JOBDESK_CHEER } from "@/lib/jobdesk-brand";

const CSS = `
@keyframes jd-fall { from { transform: translate3d(0, -10vh, 0) rotate(0) } to { transform: translate3d(var(--dx), 110vh, 0) rotate(var(--spin)) } }
@keyframes jd-pop { 0% { transform: scale(.85); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
.jd-confetti { position: absolute; top: 0; width: 9px; height: 14px; border-radius: 2px; animation: jd-fall var(--dur) cubic-bezier(.25,.6,.45,1) var(--delay) both }
@media (prefers-reduced-motion: reduce) { .jd-confetti { display: none } }
`;
const COLORS = ["#f08a3c", "#f9c74f", "#97bf8f", "#9db4e0", "#e9a8b5", "#c8664f", "#ffffff"];

/** `at` changes when an application is marked sent; `first` for the very first one. */
export function CheerToast({ at, first }: { at: number; first: boolean }) {
  const [shown, setShown] = useState<"first" | "sent" | null>(null);
  useEffect(() => {
    if (!at) return;
    setShown(first ? "first" : "sent");
    const t = window.setTimeout(() => setShown(null), first ? 7000 : 3000);
    return () => window.clearTimeout(t);
  }, [at, first]);
  // Fixed per mount, so the pieces don't jump on re-render.
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        dur: 2.6 + Math.random() * 2.2,
        delay: Math.random() * 1.4,
        dx: (Math.random() - 0.5) * 30,
        spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 540),
      })),
    [],
  );
  if (!shown) return null;
  if (shown === "sent")
    return (
      <div role="status" className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-full bg-emerald-600 px-5 py-3 font-medium text-white shadow-lg" style={{ animation: "jd-pop .3s ease-out both" }}>
        <style>{CSS}</style>
        Sent! 🎉
      </div>
    );
  return (
    <div role="status" className="fixed inset-0 z-[1001] flex items-center justify-center p-6" onClick={() => setShown(null)} style={{ background: "color-mix(in srgb, var(--bg) 70%, transparent)" }}>
      <style>{CSS}</style>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="jd-confetti"
            style={{
              left: `${p.left}%`,
              background: p.color,
              ["--dur" as string]: `${p.dur}s`,
              ["--delay" as string]: `${p.delay}s`,
              ["--dx" as string]: `${p.dx}vw`,
              ["--spin" as string]: `${p.spin}deg`,
            }}
          />
        ))}
      </div>
      <div className="relative max-w-md rounded-3xl border border-border p-8 text-center" style={{ background: "var(--bg)", animation: "jd-pop .4s ease-out both" }}>
        <div className="text-5xl">🎉</div>
        <p className="mt-3 text-2xl font-semibold text-foreground">Your first application is in!</p>
        {JOBDESK_CHEER && <p className="mt-2 text-lg text-foreground">{JOBDESK_CHEER}</p>}
        <p className="mt-4 text-sm text-muted">I&apos;ll remind you to follow up in a week.</p>
      </div>
    </div>
  );
}
