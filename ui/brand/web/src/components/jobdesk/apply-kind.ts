// JobDesk branded builds: how an application gets done.
//  - "auto": the app fills the form and, after she approves, sends it
//    (Greenhouse, Lever);
//  - "assist": the app drafts every answer and she sends it from her own
//    Chrome with copy buttons (Ashby turns down submissions from a browser
//    that automation software drives, as possible spam, approved or not);
//  - "own": the company's own site, with an account first (Workday and the
//    like): she applies there, with her resume PDF ready.

export type ApplyKind = "auto" | "assist" | "own";

const AUTO_ATS = new Set(["greenhouse", "lever"]);
const AUTO_HOST = /(^|\.)(greenhouse\.io|lever\.co)$/i;
const ASSIST_HOST = /(^|\.)ashbyhq\.com$/i;
// Test forms served from this Mac (no real job lives on 127.0.0.1).
const LOCAL_TEST = /^(127\.0\.0\.1|localhost)$/i;

export function applyKind(url: string, ats?: string): ApplyKind {
  const a = (ats || "").toLowerCase();
  if (AUTO_ATS.has(a)) return "auto";
  if (a === "ashby") return "assist";
  try {
    const host = new URL(url).hostname;
    if (AUTO_HOST.test(host) || LOCAL_TEST.test(host)) return "auto";
    if (ASSIST_HOST.test(host)) return "assist";
  } catch {
    /* not a link */
  }
  return "own";
}

/** The app can read the form and draft her answers (auto or assist). */
export function canAutofill(url: string, ats?: string): boolean {
  return applyKind(url, ats) !== "own";
}

/** Order for Find: the ones it sends itself first, then assisted, then the rest. */
export const kindRank = (url: string, ats?: string) => ({ auto: 0, assist: 1, own: 2 })[applyKind(url, ats)];
