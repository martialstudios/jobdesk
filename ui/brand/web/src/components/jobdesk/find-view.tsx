"use client";

// JobDesk branded builds: Find jobs. career-ops's free job search, shown
// simply: best fits first, near the person (or remote) by default, a checkbox
// on every job, and one button to add the checked ones to My list. Scoring is
// optional and never in the way.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ExternalLink, Loader2, MapPin, RotateCw, Sparkles } from "lucide-react";
import { useExplore } from "@/components/explore/explore-provider";
import { paramsToFilters, type DiscoveredOffer, type ExploreFilters } from "@/lib/explore";
import { instrumentSerif } from "@/lib/fonts";
import { useList } from "./use-list";
import { queueTasks } from "./tasks";

const STATES: Record<string, string> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut",
  DE: "delaware", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa",
  KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan",
  MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire",
  NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio",
  OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia",
  WI: "wisconsin", WY: "wyoming", DC: "district of columbia",
};

/** "Huntington Beach, CA" → a test for "near there, or remote". */
function nearTest(home: string): ((loc: string) => boolean) | null {
  const parts = home.split(",").map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const city = parts[0].toLowerCase();
  const region = (parts[1] || "").trim();
  const code = region.toUpperCase();
  const stateName = STATES[code] || (Object.values(STATES).includes(region.toLowerCase()) ? region.toLowerCase() : "");
  const stateCode = Object.entries(STATES).find(([, n]) => n === stateName)?.[0] || "";
  const abroad = /\b(europe|emea|eu|european union|uk|united kingdom|england|london|germany|berlin|france|paris|spain|madrid|belgium|netherlands|amsterdam|ireland|dublin|portugal|poland|italy|sweden|switzerland|india|bangalore|bengaluru|delhi|canada|toronto|vancouver|australia|sydney|brazil|mexico|singapore|japan|tokyo|korea|seoul|apac|latam|israel|philippines|argentina|colombia)\b/;
  const stateside = /\b(us|usa|u\.s\.|united states|america|north america)\b/;
  return (loc: string) => {
    const l = ` ${loc.toLowerCase()} `;
    if (city && l.includes(city)) return true;
    // Remote counts, unless it's remote somewhere else ("Remote, Germany").
    if (/remote|anywhere|distributed/.test(l)) return !abroad.test(l) || stateside.test(l);
    if (stateName && l.includes(stateName)) return true;
    if (stateCode && new RegExp(`[\\s,(]${stateCode}[\\s,)]`, "i").test(` ${loc} `)) return true;
    return false;
  };
}

function ago(date: string): string {
  if (!date) return "";
  const days = Math.floor((Date.now() - Date.parse(date)) / 86400000);
  if (!Number.isFinite(days)) return "";
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

const bandRank = (o: DiscoveredOffer) => (o.fit?.band === "strong" ? 0 : o.fit?.band === "related" ? 1 : o.fit ? 2 : 1);

export function FindView({ seed }: { seed: ExploreFilters }) {
  const ex = useExplore();
  const { items: list, add } = useList();
  const [me, setMe] = useState<{ hasCv: boolean; location: string } | null>(null);
  const [nearOnly, setNearOnly] = useState(true);
  const [showMore, setShowMore] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const started = useRef(false);

  useEffect(() => {
    fetch("/api/jobdesk/me")
      .then((r) => r.json())
      .then((d) => setMe({ hasCv: !!d.hasCv, location: String(d.location || "") }))
      .catch(() => setMe({ hasCv: true, location: "" }));
  }, []);

  // Arriving from a new resume (?run=1) searches with its roles; otherwise a
  // first visit with nothing on screen searches with the saved profile.
  useEffect(() => {
    if (started.current || !me) return;
    started.current = true;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("run") === "1") {
      ex.initFilters(paramsToFilters(sp, seed));
      void ex.discover();
      window.history.replaceState(null, "", "/find");
    } else if (me.hasCv && !ex.offers.length && !ex.running) {
      ex.initFilters(seed);
      void ex.discover();
    }
  }, [me, ex, seed]);

  const inList = useMemo(() => new Set(list.map((i) => i.url)), [list]);
  const near = useMemo(() => (me?.location ? nearTest(me.location) : null), [me]);
  const sorted = useMemo(
    () =>
      [...ex.offers].sort(
        (a, b) => bandRank(a) - bandRank(b) || (b.fit?.score ?? 0) - (a.fit?.score ?? 0) || (b.postedAt || "").localeCompare(a.postedAt || ""),
      ),
    [ex.offers],
  );
  const local = useMemo(() => (near ? sorted.filter((o) => near(o.location || "")) : sorted), [sorted, near]);
  // Too few nearby: show everything rather than an empty page.
  const pool = nearOnly && near && local.length >= 5 ? local : sorted;
  const main = pool.filter((o) => o.fit?.band !== "weak");
  const more = pool.filter((o) => o.fit?.band === "weak");
  const shown = showMore ? [...main, ...more] : main;

  const toggle = (url: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(url)) n.delete(url);
      else n.add(url);
      return n;
    });
  const selectable = shown.filter((o) => !inList.has(o.url));
  const allPicked = selectable.length > 0 && selectable.every((o) => picked.has(o.url));
  const pickedOffers = sorted.filter((o) => picked.has(o.url));

  const addPicked = async (score: boolean) => {
    if (!pickedOffers.length) return;
    const next = await add(pickedOffers);
    if (next && score) queueTasks(pickedOffers.map((o) => ({ url: o.url, company: o.company, title: o.title })), false);
    setNotice(
      `Added ${pickedOffers.length} job${pickedOffers.length === 1 ? "" : "s"} to your list${score ? `, and scoring ${pickedOffers.length === 1 ? "it" : "them"} now` : ""}.`,
    );
    setPicked(new Set());
  };

  const scanning = ex.running || ex.phase === "casting" || ex.phase === "scanning";
  const fraction = useMemo(() => {
    const all = Object.values(ex.sources);
    if (!all.length) return 0;
    return all.reduce((s, x) => s + (x?.state === "swept" || x?.state === "noisy" ? 1 : x?.total ? Math.min(1, (x.done ?? 0) / x.total) : 0), 0) / all.length;
  }, [ex.sources]);

  if (me && !me.hasCv) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className={`${instrumentSerif.className} text-4xl text-landing`}>First, your resume</h1>
        <p className="mt-3 text-muted">Add your resume and I&apos;ll find jobs that fit you.</p>
        <Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground">
          Add my resume <ArrowRight className="size-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 pb-36 pt-10 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={`${instrumentSerif.className} text-4xl text-landing md:text-5xl`}>Jobs for you</h1>
          <p className="mt-2 text-muted">Free to search. Check the ones you like, then add them to your list.</p>
        </div>
        <button
          onClick={() => void ex.discover()}
          disabled={scanning}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-foreground transition hover:border-brand/50 disabled:opacity-50"
        >
          <RotateCw className={`size-4 ${scanning ? "animate-spin" : ""}`} /> Search again
        </button>
      </div>

      {scanning && (
        <div className="mt-8 rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 text-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching job boards… {ex.matchCount > 0 && `${ex.matchCount} found so far`}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.max(4, Math.round(fraction * 100))}%` }} />
          </div>
        </div>
      )}

      {!scanning && (ex.phase === "failed" || ex.phase === "degraded") && (
        <div className="mt-8 rounded-2xl border border-border p-5 text-foreground">
          The job search hit a snag. Press <strong>Search again</strong> in a moment.
        </div>
      )}

      {!scanning && ex.offers.length === 0 && ex.phase !== "idle" && ex.phase !== "failed" && (
        <div className="mt-8 rounded-2xl border border-border p-5 text-foreground">
          No new jobs right now. Try <strong>Search again</strong> later. New postings show up every day.
        </div>
      )}

      {sorted.length > 0 && !scanning && (
        <>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
              <input type="checkbox" className="size-4 accent-[hsl(26_73%_51%)]" checked={allPicked} onChange={() =>
                setPicked((p) => {
                  const n = new Set(p);
                  if (allPicked) selectable.forEach((o) => n.delete(o.url));
                  else selectable.forEach((o) => n.add(o.url));
                  return n;
                })}
              />
              Select all {selectable.length}
            </label>
            {near && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input type="checkbox" className="size-4 accent-[hsl(26_73%_51%)]" checked={nearOnly} onChange={() => setNearOnly((v) => !v)} />
                <MapPin className="size-3.5" /> Only near {me?.location.split(",")[0]} or remote
                {nearOnly && local.length < 5 && <span className="text-faint">(few nearby, showing all)</span>}
              </label>
            )}
          </div>

          <ul className="mt-4 flex flex-col gap-2.5">
            {shown.map((o) => {
              const saved = inList.has(o.url);
              const on = picked.has(o.url);
              return (
                <li
                  key={o.url}
                  className={`flex items-start gap-3.5 rounded-2xl border p-4 transition ${on ? "border-brand/60 bg-brand/5" : "border-border hover:border-brand/30"}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`Pick ${o.title} at ${o.company}`}
                    className="mt-1 size-4 shrink-0 accent-[hsl(26_73%_51%)]"
                    checked={on || saved}
                    disabled={saved}
                    onChange={() => toggle(o.url)}
                  />
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => !saved && toggle(o.url)}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{o.title}</span>
                      {o.fit?.band === "strong" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          <Sparkles className="size-3" /> Top pick
                        </span>
                      )}
                      {saved && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">
                          <Check className="size-3" /> In your list
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-muted">
                      {[o.company, o.location, ago(o.postedAt)].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                  <a href={o.url} target="_blank" rel="noreferrer" aria-label="Open the job posting" className="mt-0.5 shrink-0 rounded-md p-1 text-faint hover:text-foreground">
                    <ExternalLink className="size-4" />
                  </a>
                </li>
              );
            })}
          </ul>
          {more.length > 0 && !showMore && (
            <button onClick={() => setShowMore(true)} className="mt-4 text-sm text-muted underline-offset-2 hover:underline">
              Show {more.length} more that match less closely
            </button>
          )}
        </>
      )}

      {(picked.size > 0 || notice) && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border p-4 md:left-60" style={{ background: "var(--bg)" }}>
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
            {picked.size > 0 ? (
              <>
                <span className="text-foreground">
                  {picked.size} job{picked.size === 1 ? "" : "s"} picked
                </span>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void addPicked(true)} className="rounded-full border border-border px-4 py-2 text-sm text-foreground hover:border-brand/50">
                    Add and score them
                  </button>
                  <button onClick={() => void addPicked(false)} className="rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-200">
                    Add to my list
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="text-foreground">{notice}</span>
                <div className="flex gap-2">
                  <button onClick={() => setNotice("")} className="rounded-full px-3 py-2 text-sm text-muted">Keep looking</button>
                  <Link href="/my-list" className="inline-flex items-center gap-1.5 rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground">
                    Go to my list <ArrowRight className="size-4" />
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
