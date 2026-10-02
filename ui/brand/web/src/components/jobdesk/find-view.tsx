"use client";

// JobDesk branded builds: Find jobs. career-ops's free job search, shown
// simply: best fits first, near the person (or remote) by default, a checkbox
// on every job, and one button to add the checked ones to My list. Scoring is
// optional and never in the way. Each job gets a quick read (what it is, what
// you'd do, what they want, level, pay) so it's more than a title. A search
// only runs when asked: from the questions page or a button here; the last
// results and search are remembered between visits.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown, ExternalLink, Loader2, MapPin, RotateCw, Search, Sparkles, Wand2 } from "lucide-react";
import { useExplore } from "@/components/explore/explore-provider";
import { paramsToFilters, type DiscoveredOffer, type ExploreFilters } from "@/lib/explore";
import { instrumentSerif } from "@/lib/fonts";
import { useList } from "./use-list";
import { queueTasks } from "./tasks";
import { useSynopses, type SynopsisState } from "./use-synopses";
import { howlOn } from "@/components/howl/decor";
import { HowlSearchScene } from "@/components/howl/scene";

import { canAutofill } from "./apply-kind";

// The job boards whose forms Apply can fill in (see apply-kind.ts).
const EASY_APPLY = new Set(["greenhouse", "lever", "ashby"]);
// career-ops's starter portals.yml (written for its example person, a senior
// engineer) leaves out junior roles and internships: exactly what someone
// starting out or changing careers is looking for.
const ENTRY_LEVEL = /junior|intern|praktik|werkstudent|ausbildung|thesis|trainee|apprentic|graduate|duales/i;
const forAnyLevel = (f: ExploreFilters): ExploreFilters => ({ ...f, negative: f.negative.filter((n) => !ENTRY_LEVEL.test(n)) });

const SEARCH_KEY = "jobdesk:search";
const NONE: DiscoveredOffer[] = [];
const AUTO_READS = 24;
const RESULTS_KEY = "jobdesk:results";

function readStored<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: just not remembered */
  }
}

function QuickRead({ s, open, onToggle, onRead }: { s: SynopsisState; open: boolean; onToggle: () => void; onRead: () => void }) {
  if (s === "loading")
    return (
      <div className="mt-2 flex items-center gap-2 text-sm text-faint">
        <Loader2 className="size-3.5 animate-spin" /> Reading this job…
      </div>
    );
  if (s === null) return <div className="mt-2 text-sm text-faint">Couldn&apos;t read this posting here. Open it to see the details.</div>;
  if (!s)
    return (
      <button type="button" onClick={onRead} className="mt-2 inline-flex items-center gap-1 text-sm text-brand">
        Quick read <ChevronDown className="size-3.5" />
      </button>
    );
  const chips = [s.type, s.level && `${s.level} level`, s.where, s.pay].filter(Boolean);
  return (
    <div className="mt-2">
      <p className="text-sm text-foreground">{s.summary}</p>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span key={c} className={`rounded-full px-2 py-0.5 text-[11px] ${c === s.pay ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-surface text-muted"}`}>
              {c}
            </span>
          ))}
        </div>
      )}
      {(s.doing.length > 0 || s.wants.length > 0 || s.fit) && (
        <button type="button" onClick={onToggle} className="mt-2 inline-flex items-center gap-1 text-sm text-brand">
          {open ? "Less" : "What it involves"} <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
        </button>
      )}
      {open && (
        <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
          {s.doing.length > 0 && (
            <div>
              <div className="font-medium text-foreground">What you&apos;d do</div>
              <ul className="mt-1 space-y-1 text-muted">{s.doing.map((d) => <li key={d}>• {d}</li>)}</ul>
            </div>
          )}
          {s.wants.length > 0 && (
            <div>
              <div className="font-medium text-foreground">What they want</div>
              <ul className="mt-1 space-y-1 text-muted">{s.wants.map((d) => <li key={d}>• {d}</li>)}</ul>
            </div>
          )}
          {s.fit && <p className="text-foreground sm:col-span-2">✨ {s.fit}</p>}
        </div>
      )}
    </div>
  );
}

// Where she'll work: within N miles of home (0: anywhere in the US), and
// remote jobs in the US or not. Set on the questions page, changeable here.
type Area = { miles: number; remote: boolean };
const AREA_KEY = "jobdesk:area";
const DEFAULT_AREA: Area = { miles: 25, remote: true };
const RADII = [10, 25, 50, 100, 0];
type Where = { us: boolean | null; remote: boolean; miles: number | null };

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
  const [me, setMe] = useState<{ hasCv: boolean; location: string; answered: boolean } | null>(null);
  const [stored, setStored] = useState<DiscoveredOffer[]>([]);
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const [area, setAreaState] = useState<Area>(DEFAULT_AREA);
  const [places, setPlaces] = useState<Record<string, Where>>({});
  const [showFar, setShowFar] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState("");
  const started = useRef(false);

  useEffect(() => {
    fetch("/api/jobdesk/me")
      .then((r) => r.json())
      .then((d) => setMe({ hasCv: !!d.hasCv, location: String(d.location || ""), answered: !!d.answered }))
      .catch(() => setMe({ hasCv: true, location: "", answered: true }));
    setStored(readStored<{ offers: DiscoveredOffer[] }>(RESULTS_KEY)?.offers ?? []);
    setAreaState({ ...DEFAULT_AREA, ...(readStored<Area>(AREA_KEY) ?? {}) });
  }, []);

  // Only "Find my jobs" on the questions page (?run=1) starts a search on its
  // own; it's remembered, and the buttons here repeat it.
  useEffect(() => {
    if (started.current || !me) return;
    started.current = true;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("run") === "1") {
      sp.delete("run");
      store(SEARCH_KEY, sp.toString());
      ex.initFilters(forAnyLevel(paramsToFilters(sp, seed)));
      void ex.discover();
      window.history.replaceState(null, "", "/find");
    }
  }, [me, ex, seed]);

  const search = () => {
    const saved = readStored<string>(SEARCH_KEY);
    // Never searched from the questions: the profile's search, without the
    // job boards Apply can't fill in, and wider than the default.
    const f: ExploreFilters = saved
      ? paramsToFilters(new URLSearchParams(saved), seed)
      : { ...seed, ats: seed.ats.filter((a) => EASY_APPLY.has(a)), limitPerAts: 500, sinceDays: 30 };
    ex.initFilters(forAnyLevel(f));
    void ex.discover();
  };

  // A finished search is kept for the next visit.
  useEffect(() => {
    if (!ex.running && ex.phase === "results" && ex.offers.length) {
      store(RESULTS_KEY, { at: Date.now(), offers: ex.offers });
      setStored(ex.offers);
    }
  }, [ex.running, ex.phase, ex.offers]);

  const inList = useMemo(() => new Set(list.map((i) => i.url)), [list]);
  const setArea = (a: Area) => {
    setAreaState(a);
    store(AREA_KEY, a);
    setShowFar(false);
  };
  // Before any search this visit: the last results.
  const offers = ex.phase === "idle" && !ex.running ? stored : ex.offers;
  const sorted = useMemo(
    () =>
      [...offers].sort(
        (a, b) => bandRank(a) - bandRank(b) || (b.fit?.score ?? 0) - (a.fit?.score ?? 0) || (b.postedAt || "").localeCompare(a.postedAt || ""),
      ),
    [offers],
  );
  // Where each job is (/api/jobdesk/where): asked once per location.
  const locKey = useMemo(() => Array.from(new Set(offers.map((o) => o.location || ""))).sort().join("\n"), [offers]);
  useEffect(() => {
    if (!me) return;
    const missing = locKey.split("\n").filter((l) => !(l in places));
    if (!missing.length) return;
    fetch("/api/jobdesk/where", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home: me.location, locations: missing }),
    })
      .then((r) => r.json())
      .then((d) => d.items && setPlaces((p) => ({ ...p, ...d.items })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locKey, me]);
  const placed = (o: DiscoveredOffer): Where | undefined => places[o.location || ""];
  // US only, always. In the area: within the miles, or remote in the US (if
  // they're open to remote), or anywhere in the US when that's the setting.
  const inArea = (w: Where) =>
    w.us !== false &&
    ((w.miles !== null && (area.miles === 0 || w.miles <= area.miles)) ||
      (area.remote && w.remote) ||
      (area.miles === 0 && w.us === true));
  const abroad = sorted.filter((o) => placed(o)?.us === false).length;
  const local = sorted.filter((o) => {
    const w = placed(o);
    return w ? inArea(w) : false;
  });
  // In the US (or unclear) but further away: behind "Show more elsewhere".
  const far = sorted.filter((o) => {
    const w = placed(o);
    return w ? w.us !== false && !inArea(w) : false;
  });
  const pool = showFar ? [...local, ...far] : local;
  const main = pool.filter((o) => o.fit?.band !== "weak");
  const more = pool.filter((o) => o.fit?.band === "weak");
  const shown = showMore ? [...main, ...more] : main;
  const scanning = ex.running || ex.phase === "casting" || ex.phase === "scanning";
  // After the search: while it runs, results stream in one at a time and
  // would each become their own request.
  // Read automatically: the first jobs on the page (a long list would cost
  // a summary per job); the rest when asked ("Quick read").
  const [extra, setExtra] = useState<Set<string>>(new Set());
  const toRead = useMemo(
    () => (scanning ? NONE : [...shown.slice(0, AUTO_READS), ...shown.slice(AUTO_READS).filter((o) => extra.has(o.url))]),
    [scanning, shown, extra],
  );
  const reads = useSynopses(toRead);

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
          <Link href="/welcome" className="mt-1 inline-block text-sm text-brand underline-offset-2 hover:underline">
            Change what I&apos;m looking for
          </Link>
        </div>
        <button
          onClick={search}
          disabled={scanning}
          className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-foreground transition hover:border-brand/50 disabled:opacity-50"
        >
          <RotateCw className={`size-4 ${scanning ? "animate-spin" : ""}`} /> {offers.length ? "Search again" : "Search"}
        </button>
      </div>

      {scanning && howlOn && (
        <div className="mt-8">
          <HowlSearchScene progress={fraction} found={ex.matchCount} />
        </div>
      )}

      {scanning && !howlOn && (
        <div className="mt-8 rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 text-foreground">
            <Loader2 className="size-4 animate-spin" /> Searching job boards… {ex.matchCount > 0 && `${ex.matchCount} found so far`}
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.max(4, Math.round(fraction * 100))}%` }} />
          </div>
        </div>
      )}

      {!scanning && ex.phase === "failed" && (
        <div className="mt-8 rounded-2xl border border-border p-5 text-foreground">
          The job search hit a snag. Press <strong>Search again</strong> in a moment.
        </div>
      )}

      {/* Each search checks a different random batch of companies, so career-ops
          calls an empty one "degraded" (not everything was checked): say so. */}
      {!scanning && ex.offers.length === 0 && ex.phase !== "idle" && ex.phase !== "failed" && (
        <div className="mt-8 rounded-2xl border border-border p-5 text-foreground">
          None of the companies I checked this time are hiring for these. Every search looks at a
          different batch, so press <strong>Search again</strong>, or{" "}
          <Link href="/welcome" className="text-brand underline-offset-2 hover:underline">change what you&apos;re looking for</Link>.
        </div>
      )}

      {!scanning && ex.phase === "idle" && !offers.length && me && !me.answered && (
        <div className="mt-8 rounded-2xl border border-border p-6 text-foreground">
          <p className="text-lg">First, a few quick questions about what you&apos;re looking for.</p>
          <p className="mt-1 text-muted">Then I&apos;ll search for jobs that fit, and Apply will fill in your real details.</p>
          <Link href="/welcome?first=1" className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground">
            Answer them <ArrowRight className="size-4" />
          </Link>
        </div>
      )}

      {!scanning && ex.phase === "idle" && !offers.length && me?.answered && (
        <div className="mt-8 rounded-2xl border border-border p-6 text-foreground">
          <p className="text-lg">Ready when you are.</p>
          <p className="mt-1 text-muted">Searching takes about a minute and is free.</p>
          <button onClick={search} className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground">
            <Search className="size-4" /> Find jobs
          </button>
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
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <MapPin className="size-3.5" />
              <select
                value={area.miles}
                onChange={(e) => setArea({ ...area, miles: Number(e.target.value) })}
                className="rounded-full border border-border bg-transparent px-2.5 py-1 text-foreground"
                aria-label="How far from home"
              >
                {RADII.map((m) => (
                  <option key={m} value={m}>
                    {m ? `Within ${m} miles` : "Anywhere in the US"}
                  </option>
                ))}
              </select>
              {area.miles > 0 && <span>of {me?.location.split(",")[0] || "home"}</span>}
              <label className="ml-1 inline-flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" className="size-4 accent-[hsl(26_73%_51%)]" checked={area.remote} onChange={() => setArea({ ...area, remote: !area.remote })} />
                Remote (US)
              </label>
            </div>
          </div>
          {abroad > 0 && <p className="mt-2 text-xs text-faint">Left out {abroad} outside the US.</p>}
          {sorted.length > 0 && local.length === 0 && !showFar && (
            <p className="mt-4 rounded-xl bg-surface p-4 text-sm text-foreground">
              None of these are within {area.miles} miles{area.remote ? " or remote" : ""}. Try a wider distance, or press{" "}
              <strong>Search again</strong>: every search checks a different batch of companies.
            </p>
          )}

          <ul className="mt-4 flex flex-col gap-2.5">
            {shown.map((o) => {
              const saved = inList.has(o.url);
              const on = picked.has(o.url);
              return (
                <li
                  key={o.url}
                  className={`flex items-start gap-3.5 rounded-2xl border p-4 transition ${on ? "border-brand/60 bg-brand/5" : "border-border hover:border-brand/30"}`}
                  style={on ? undefined : { background: "var(--bg)" }}
                >
                  <input
                    type="checkbox"
                    aria-label={`Pick ${o.title} at ${o.company}`}
                    className="mt-1 size-4 shrink-0 accent-[hsl(26_73%_51%)]"
                    checked={on || saved}
                    disabled={saved}
                    onChange={() => toggle(o.url)}
                  />
                  <div className="min-w-0 flex-1">
                    <button type="button" className="w-full text-left" onClick={() => !saved && toggle(o.url)}>
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
                        {canAutofill(o.url, o.ats) ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand-text" title="Apply can fill in this form for you">
                            <Wand2 className="size-3" /> Easy apply
                          </span>
                        ) : (
                          <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted" title="This company's form needs an account on their site">
                            Apply on their site
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-sm text-muted">
                        {[o.company, o.location, placed(o)?.miles != null ? `${placed(o)!.miles} mi away` : "", ago(o.postedAt)].filter(Boolean).join(" · ")}
                      </div>
                    </button>
                    <QuickRead
                      s={reads[o.url]}
                      onRead={() => setExtra((x) => new Set(x).add(o.url))}
                      open={opened.has(o.url)}
                      onToggle={() =>
                        setOpened((p) => {
                          const n = new Set(p);
                          if (n.has(o.url)) n.delete(o.url);
                          else n.add(o.url);
                          return n;
                        })
                      }
                    />
                  </div>
                  <a href={o.url} target="_blank" rel="noreferrer" aria-label="Open the job posting" className="mt-0.5 shrink-0 rounded-md p-1 text-faint hover:text-foreground">
                    <ExternalLink className="size-4" />
                  </a>
                </li>
              );
            })}
          </ul>
          {far.length > 0 && !showFar && (
            <button onClick={() => setShowFar(true)} className="mt-4 mr-4 text-sm text-muted underline-offset-2 hover:underline">
              Show {far.length} more elsewhere in the US
            </button>
          )}
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
