"use client";

// JobDesk branded builds: a company's name and mark the way they show it.
// Job boards file companies under a slug ("doordashmexico", "court-avenue");
// the quick read gives their real name and website when it has read the
// posting, and until then the slug is tidied up. The mark is their favicon
// through career-ops's own local logo cache (/api/logo), over a colored
// monogram that shows when there's no logo.

import { useState } from "react";
import { companyInitials, monogramHue } from "@/lib/company";

/** "court-avenue" -> "Court Avenue", "ramp" -> "Ramp". */
export function prettyCompany(slug: string): string {
  const s = String(slug || "").trim();
  if (!s) return "";
  // Already a written name (spaces or capitals): keep it.
  if (/\s/.test(s) || /[A-Z]/.test(s)) return s;
  return s
    .replace(/[-_]+/g, " ")
    .replace(/\s+\d+$/, "")
    .split(" ")
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function BrandLogo({ name, domain, size = 36 }: { name: string; domain?: string; size?: number }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const hue = monogramHue(name);
  const src = domain ? `/api/logo?domain=${encodeURIComponent(domain)}` : `/api/logo?company=${encodeURIComponent(name)}`;
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden ring-1 ring-black/5 dark:ring-white/10"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.26) }}
    >
      <span
        className="absolute inset-0 flex items-center justify-center font-semibold leading-none text-white"
        style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 48%), hsl(${(hue + 28) % 360} 52% 38%))`, fontSize: Math.round(size * 0.4) }}
      >
        {companyInitials(name)}
      </span>
      {!failed && name && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full bg-white object-contain transition-opacity duration-200"
          style={{ opacity: loaded ? 1 : 0, padding: Math.max(2, Math.round(size * 0.12)) }}
        />
      )}
    </span>
  );
}
