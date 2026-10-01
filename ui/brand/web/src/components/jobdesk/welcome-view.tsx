"use client";

// JobDesk branded builds: "A few quick questions". Right after the resume is
// read (the fun overlay pauses for it), and any time from Find jobs. The
// answers go into career-ops's profile through its own /api/profile, then the
// rest of the profile is made theirs in the background (/api/jobdesk/personalize,
// which keeps these answers), and the job search runs with these roles. The
// dream-job card can swap the roles for a way into a new field.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Plus, X } from "lucide-react";
import { instrumentSerif } from "@/lib/fonts";
import { DEFAULT_FILTERS, filtersToParams } from "@/lib/explore";
import type { DreamGoal, DreamPlan } from "@/lib/jobdesk/dream";
import { DreamCard } from "./dream-card";

const SENIOR = ["word:Senior", "word:Sr", "word:Lead", "word:Principal", "word:Staff", "Director", "Head of", "word:VP"];

const box = "w-full rounded-xl border border-border bg-transparent px-3 py-2 text-foreground outline-none focus:border-brand/60";

export function WelcomeView() {
  const router = useRouter();
  const [first, setFirst] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [resumeRoles, setResumeRoles] = useState<string[]>([]);
  const [goal, setGoal] = useState<DreamGoal | null>(null);
  const [plan, setPlan] = useState<DreamPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [location, setLocation] = useState("");
  const [remote, setRemote] = useState(true);
  const [minPay, setMinPay] = useState("");
  const [maxPay, setMaxPay] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setFirst(sp.get("first") === "1");
    const fromCv = (sp.get("q") || "").split(",").map((r) => r.trim()).filter(Boolean);
    fetch("/api/jobdesk/me")
      .then((r) => r.json())
      .then((d) => {
        const initial: string[] = fromCv.length ? fromCv : Array.isArray(d.roles) ? d.roles : [];
        setRoles(initial);
        // With a dream plan, the profile's roles are the plan's, not the resume's.
        if (!d.goal || fromCv.length) setResumeRoles(initial);
        setGoal(d.goal || null);
        setPlan(d.goal?.plan || null);
        setLocation(String(d.location || ""));
        if (d.payMin) setMinPay(String(d.payMin));
        if (d.payMax) setMaxPay(String(d.payMax));
        if (d.remote === "On-site only") setRemote(false);
      })
      .catch(() => {
        setRoles(fromCv);
        setResumeRoles(fromCv);
      })
      .finally(() => setLoaded(true));
  }, []);

  const applyPlan = (next: DreamPlan | null) => {
    setPlan(next);
    if (next) setRoles(Array.from(new Set([...next.roles, ...next.dream])));
    else if (resumeRoles.length) setRoles(resumeRoles);
  };

  const addRole = () => {
    const r = newRole.trim();
    if (r && !roles.includes(r)) setRoles([...roles, r]);
    setNewRole("");
  };

  const go = async () => {
    setBusy(true);
    const min = Number.parseInt(minPay.replace(/[^\d]/g, ""), 10);
    const max = Number.parseInt(maxPay.replace(/[^\d]/g, ""), 10);
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roles: roles.length ? roles : undefined,
          location: location.trim() || undefined,
          remote: remote ? "Open to remote or on-site" : "On-site only",
          compMin: Number.isFinite(min) ? min : undefined,
          compMax: Number.isFinite(max) ? max : Number.isFinite(min) ? min : undefined,
          currency: Number.isFinite(min) || Number.isFinite(max) ? "USD" : undefined,
        }),
      });
      // The rest of the profile, from the resume, in the background.
      void fetch("/api/jobdesk/personalize", { method: "POST" }).catch(() => {});
    } catch {
      /* searching still works */
    }
    if (first) window.dispatchEvent(new CustomEvent("jobdesk:fun", { detail: "resume" }));
    const filters = {
      ...DEFAULT_FILTERS,
      ats: DEFAULT_FILTERS.ats.filter((a) => a !== "workday"),
      positive: roles,
      // Someone moving into a new field is looking for a way in: leave out
      // the senior versions of the titles ("UX Designer" also matches
      // "Senior UX Designer").
      negative: plan ? SENIOR : [],
      sinceDays: 30,
      // Wider than the default 150 companies per job board (about 45 s).
      limitPerAts: 500,
    };
    const qs = filtersToParams(filters);
    router.push(`/find?${qs}${qs ? "&" : ""}run=1`);
  };

  return (
    <div className="mx-auto max-w-2xl px-5 pb-24 pt-12 md:px-8">
      <h1 className={`${instrumentSerif.className} text-4xl text-landing md:text-5xl`}>
        {first ? "A few quick questions" : "What you're looking for"}
      </h1>
      <p className="mt-2 text-muted">
        {first ? "I filled these in from your resume. Fix anything that's off, then I'll find your jobs." : "Change anything, and I'll search again."}
      </p>

      {loaded && <DreamCard goal={goal} onPlan={applyPlan} />}

      <section className="mt-8">
        <h2 className="font-medium text-foreground">What kinds of jobs?</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <span key={r} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-foreground">
              {r}
              <button onClick={() => setRoles(roles.filter((x) => x !== r))} aria-label={`Remove ${r}`} className="text-faint hover:text-red-500">
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <input value={newRole} onChange={(e) => setNewRole(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addRole()}
            placeholder="Add another, like Marketing Manager" className={box} />
          <button onClick={addRole} className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-border px-3 text-sm text-foreground">
            <Plus className="size-4" /> Add
          </button>
        </div>
        {resumeRoles.some((r) => !roles.includes(r)) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-faint">From your resume:</span>
            {resumeRoles.filter((r) => !roles.includes(r)).map((r) => (
              <button key={r} onClick={() => setRoles([...roles, r])}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-muted hover:border-brand/50 hover:text-foreground">
                <Plus className="size-3.5" /> {r}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium text-foreground">Where?</h2>
        <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State" className={`${box} mt-3`} />
        <label className="mt-3 inline-flex cursor-pointer items-center gap-2.5 text-foreground">
          <input type="checkbox" className="size-4 accent-[hsl(26_73%_51%)]" checked={remote} onChange={() => setRemote((v) => !v)} />
          I&apos;m open to remote jobs too
        </label>
      </section>

      <section className="mt-8">
        <h2 className="font-medium text-foreground">
          Salary you&apos;re aiming for <span className="font-normal text-muted">(optional, per year)</span>
        </h2>
        <div className="mt-3 flex items-center gap-2">
          <input value={minPay} onChange={(e) => setMinPay(e.target.value)} inputMode="numeric" placeholder="From, like 80000" className={box} />
          <span className="text-muted">to</span>
          <input value={maxPay} onChange={(e) => setMaxPay(e.target.value)} inputMode="numeric" placeholder="To, like 110000" className={box} />
        </div>
        <p className="mt-2 text-sm text-faint">Only used to judge fit. It&apos;s never typed into an application without you seeing it.</p>
      </section>

      <button onClick={() => void go()} disabled={busy || roles.length === 0}
        className="mt-10 inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3 font-medium text-brand-foreground hover:bg-brand-200 disabled:opacity-50">
        {first ? "Find my jobs" : "Search with these"} <ArrowRight className="size-4" />
      </button>
      {roles.length === 0 && <p className="mt-2 text-sm text-muted">Add at least one kind of job.</p>}
    </div>
  );
}
