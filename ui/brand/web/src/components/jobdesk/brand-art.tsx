// JobDesk branded builds: a picture of the builder's choosing (BRAND_ART in
// the brand file), flying in the sky at the top right of every page, behind
// the content, drifting gently. On the app's own background (a transparent
// picture), with a faint light edge in dark mode so black ink stays visible.
// Hidden on narrow windows. Renders nothing without one.
import { JOBDESK_ART } from "@/lib/jobdesk-brand";

const CSS = `
@keyframes jd-art-fly { 0%, 100% { transform: translate(0, 0) rotate(-2deg) } 50% { transform: translate(-6px, -8px) rotate(1deg) } }
.jd-art { animation: jd-art-fly 6s ease-in-out infinite; filter: none }
.dark .jd-art { filter: drop-shadow(0 0 0.5px rgba(255, 255, 255, .6)) }
@media (prefers-reduced-motion: reduce) { .jd-art { animation: none } }
`;

export function BrandArt() {
  if (!JOBDESK_ART) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed right-[1.2vw] top-1 z-0 hidden md:block">
      <style>{CSS}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={JOBDESK_ART} alt="" className="jd-art h-auto w-auto" style={{ maxHeight: 118 }} />
    </div>
  );
}
