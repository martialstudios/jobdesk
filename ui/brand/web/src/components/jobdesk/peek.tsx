"use client";

// JobDesk branded builds: a picture of the builder's choosing (BRAND_PEEK, a
// transparent head) that peeks up from the bottom of the screen on the loading
// screen after a resume is uploaded (the "start" of the JobdeskFun overlay):
// it waits WAIT_MS, slides up slowly, stays STAY_MS, then slides back down.
// Once per upload. Renders nothing without one.

import { useEffect, useState } from "react";
import { JOBDESK_PEEK } from "@/lib/jobdesk-brand";

const WAIT_MS = 5000;
const SLIDE_MS = 1800;
const STAY_MS = 5000;

type Phase = "off" | "below" | "up" | "down";

export function BrandPeek() {
  const [phase, setPhase] = useState<Phase>("off");

  useEffect(() => {
    if (!JOBDESK_PEEK) return;
    let timers: number[] = [];
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    const at = (ms: number, next: Phase) => timers.push(window.setTimeout(() => setPhase(next), ms));
    const onEvent = (e: Event) => {
      if ((e as CustomEvent).detail !== "start") return;
      clear();
      // Mounted just below the screen first, so the slide up animates.
      at(WAIT_MS - 50, "below");
      at(WAIT_MS, "up");
      at(WAIT_MS + SLIDE_MS + STAY_MS, "down");
      at(WAIT_MS + SLIDE_MS + STAY_MS + SLIDE_MS, "off");
    };
    window.addEventListener("jobdesk:fun", onEvent);
    return () => {
      window.removeEventListener("jobdesk:fun", onEvent);
      clear();
    };
  }, []);

  if (!JOBDESK_PEEK || phase === "off") return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-[1001] flex justify-center overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={JOBDESK_PEEK}
        alt=""
        className="h-auto w-[min(46vw,300px)]"
        style={{
          transform: phase === "up" ? "translateY(18%)" : "translateY(105%)",
          transition: `transform ${SLIDE_MS}ms cubic-bezier(.22,.8,.32,1)`,
        }}
      />
    </div>
  );
}
