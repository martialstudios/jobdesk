// JobDesk branded builds: a picture of the builder's choosing under the menu
// (BRAND_ART in the brand file), on the app's own background: small, centered,
// and in dark mode with a faint light edge so black ink stays visible.
// Renders nothing without one.
import { JOBDESK_ART } from "@/lib/jobdesk-brand";

const CSS = `
.jd-art { filter: none }
.dark .jd-art { filter: drop-shadow(0 0 0.6px rgba(255, 255, 255, .85)) drop-shadow(0 0 5px rgba(255, 255, 255, .12)) }
`;

export function BrandArt() {
  if (!JOBDESK_ART) return null;
  return (
    <div aria-hidden="true" className="mt-5 flex justify-center">
      <style>{CSS}</style>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={JOBDESK_ART} alt="" className="jd-art h-auto w-auto object-contain" style={{ maxHeight: 170, maxWidth: "78%" }} />
    </div>
  );
}
