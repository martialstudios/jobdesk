"use client";

// JobDesk branded builds: songs of the builder's choosing (audio files they
// own, copied into the build). BRAND_MUSIC plays once when a resume is
// uploaded (the "start" of the JobdeskFun loading screen); BRAND_MUSIC_SEARCH
// plays once when the job search starts (its "resume"), taking over from the
// first if it's still going. Each keeps going on whatever page they're on. A file already cut
// to length plays as it is, its own fades and all; with BRAND_MUSIC_CLIP
// (a part of a longer song) it fades in and out here. A small button stops it.
// Renders nothing without one.

import { useEffect, useRef, useState } from "react";
import { Music, X } from "lucide-react";
import { JOBDESK_MUSIC } from "@/lib/jobdesk-brand";

const FADE_IN = 1.5;
const FADE_OUT = 5;
const VOLUME = 0.7;

export function BrandMusic() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!JOBDESK_MUSIC.src && !JOBDESK_MUSIC.searchSrc) return;
    let frame = 0;
    let fadingOut = false;
    const start = JOBDESK_MUSIC.start;
    const stopAll = () => {
      window.cancelAnimationFrame(frame);
      audio.current?.pause();
      setPlaying(false);
    };
    // The volume follows the clip's position: in, steady, out, then stop.
    const tick = () => {
      const a = audio.current;
      if (!a || a.paused) return;
      const end = JOBDESK_MUSIC.end || a.duration || 0;
      const t = a.currentTime;
      if (end && t >= end) return stopAll();
      const clipped = JOBDESK_MUSIC.end > 0;
      const fin = clipped ? Math.min(1, (t - start) / FADE_IN) : 1;
      const fout = clipped ? Math.min(1, (end - t) / FADE_OUT) : 1;
      if (fout < 1) fadingOut = true;
      a.volume = Math.max(0, Math.min(1, VOLUME * Math.max(0, Math.min(fin, fout))));
      frame = window.requestAnimationFrame(tick);
    };
    const play = (src: string) => {
      if (!src) return;
      // Already playing this one: let it carry on rather than start over.
      const cur = audio.current;
      if (cur && cur.dataset.src === src && !cur.paused && !fadingOut) return;
      cur?.pause();
      if (!cur || cur.dataset.src !== src) {
        audio.current = new Audio(src);
        audio.current.dataset.src = src;
      }
      const a = audio.current!;
      window.cancelAnimationFrame(frame);
      fadingOut = false;
      a.volume = JOBDESK_MUSIC.end > 0 ? 0 : VOLUME;
      a.currentTime = start;
      a.onended = stopAll;
      a.play()
        .then(() => {
          setPlaying(true);
          frame = window.requestAnimationFrame(tick);
        })
        .catch(() => setPlaying(false));
    };
    const onEvent = (e: Event) => {
      const what = (e as CustomEvent).detail;
      if (what === "start") play(JOBDESK_MUSIC.src);
      else if (what === "resume") play(JOBDESK_MUSIC.searchSrc);
    };
    const onStop = () => stopAll();
    window.addEventListener("jobdesk:fun", onEvent);
    window.addEventListener("jobdesk:music-stop", onStop);
    return () => {
      window.removeEventListener("jobdesk:fun", onEvent);
      window.removeEventListener("jobdesk:music-stop", onStop);
      stopAll();
    };
  }, []);

  if (!playing) return null;
  return (
    <button
      onClick={() => window.dispatchEvent(new Event("jobdesk:music-stop"))}
      className="fixed bottom-5 right-5 z-[1001] inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-sm text-muted shadow-md hover:text-foreground"
      style={{ background: "var(--bg)" }}
      aria-label="Stop the music"
    >
      <Music className="size-4 animate-pulse text-brand" />
      {JOBDESK_MUSIC.title || "Music"}
      <X className="size-3.5" />
    </button>
  );
}
