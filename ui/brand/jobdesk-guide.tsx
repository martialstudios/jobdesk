"use client";

// JobDesk branded builds only (tools/brand_web.py adds this file and mounts it
// in the app shell). A small "Your next step" card that walks someone through
// career-ops's path from a list of jobs to an application:
//   1 Score (Evaluate a job)  →  2 Tailored CV (Generate tailored CV)  →  3 Apply
// career-ops has every step, but nothing says which comes next: Apply stays
// greyed out until a tailored CV exists, and an evaluation finishes silently.
//
// State comes from what's already there: running jobs (useJobs), the tracker
// (/api/pipeline), and, on a job's own page, its buttons. It never does
// anything the person didn't press: its buttons only press the page's own.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { useJobs } from "@/components/jobs/job-store";

type App = { n: string; company: string; role: string; score: string; status: string; pdf: string };
type Step = 1 | 2 | 3;
type Guide = {
  key: string;
  step: Step;
  busy?: boolean;
  text: string;
  action?: { label: string; href?: string; press?: () => void };
};

const DISMISSED = "jobdesk:guide-dismissed";
const AFTER_APPLY = /applied|responded|interview|offer|hired|rejected|discarded/i;

function pdfFromTracker(pdf: string) {
  return /✅|yes|true|\.pdf/i.test(pdf || "");
}

// The job page's own buttons, found by what they say.
function findButton(test: (el: HTMLButtonElement) => boolean) {
  return Array.from(document.querySelectorAll<HTMLButtonElement>("main button")).find(test) || null;
}
const generateButton = () => findButton((b) => !b.disabled && /Generate tailored CV/i.test(b.textContent || ""));
const applyButton = () => findButton((b) => !b.disabled && (b.textContent || "").trim() === "Apply");
const tailoredCvReady = () =>
  Array.from(document.querySelectorAll("main a")).some((a) => /View tailored CV/i.test(a.textContent || ""));

export function JobdeskGuide() {
  const pathname = usePathname() || "/";
  const { jobs } = useJobs();
  const [apps, setApps] = useState<App[]>([]);
  const [tick, setTick] = useState(0);
  const [dismissed, setDismissed] = useState<string>("");

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISSED) || "");
    } catch {
      /* private mode */
    }
  }, []);

  // The tracker changes when an evaluation or a CV finishes; poll it gently.
  const finished = jobs.filter((j) => j.status !== "running").length;
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/pipeline")
        .then((r) => r.json())
        .then((d) => { if (alive && Array.isArray(d.applications)) setApps(d.applications); })
        .catch(() => {});
    load();
    const t = window.setInterval(load, 15000);
    return () => { alive = false; window.clearInterval(t); };
  }, [finished]);

  // The page's buttons appear after it renders; look again every second.
  useEffect(() => {
    const t = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const guide = useMemo<Guide | null>(() => {
    void tick;
    // Not while the CV-to-results overlay is up.
    if (typeof document !== "undefined" && document.querySelector('.fixed[role="status"]')) return null;
    const scoring = jobs.find((j) => j.kind === "evaluate" && j.status === "running");
    const report = pathname.match(/^\/pipeline\/([^/?#]+)$/);

    if (report) {
      const n = decodeURIComponent(report[1]);
      const app = apps.find((a) => a.n === n);
      const name = app?.company || "this job";
      const makingCv = jobs.some((j) => j.kind === "pdf" && j.input === n && j.status === "running");
      if (makingCv) {
        return { key: `cv-making-${n}`, step: 2, busy: true, text: `Making a CV tailored to ${name}… a minute or two. Stay here; Apply unlocks when it's done.` };
      }
      if (app && AFTER_APPLY.test(app.status)) {
        return { key: `done-${n}`, step: 3, text: `You've applied to ${name}. 🎉 Follow-ups (left) reminds you when to check in.` };
      }
      if (!tailoredCvReady()) {
        const gen = generateButton();
        return {
          key: `cv-${n}`,
          step: 2,
          text: `Next: a CV rewritten for ${name}. Read the score above first: below 4.0/5 it may not be worth applying.`,
          action: gen ? { label: "Make my tailored CV", press: () => gen.click() } : undefined,
        };
      }
      const apply = applyButton();
      return {
        key: `apply-${n}`,
        step: 3,
        text: apply
          ? `Your tailored CV is ready. Apply opens the real application, filled in for you. Check it, then press Submit yourself. (It needs Google Chrome.)`
          : `Your tailored CV is ready (View tailored CV, above). This job has no application link, so apply on the company's site and attach that CV.`,
        action: apply ? { label: "Apply", press: () => apply.click() } : undefined,
      };
    }

    if (scoring) {
      return {
        key: `scoring-${scoring.id}`,
        step: 1,
        busy: true,
        text: `Scoring ${scoring.subtitle || scoring.title}… about 5 minutes. Keep looking around; this card tells you when it's ready.`,
      };
    }
    const newest = [...apps].sort((a, b) => Number(b.n) - Number(a.n));
    const toTailor = newest.find((a) => a.score && !pdfFromTracker(a.pdf) && !AFTER_APPLY.test(a.status));
    const toApply = newest.find((a) => pdfFromTracker(a.pdf) && !AFTER_APPLY.test(a.status));
    if (toApply) {
      return {
        key: `go-apply-${toApply.n}`,
        step: 3,
        text: `Your tailored CV for ${toApply.company} is ready. Next: apply.`,
        action: { label: "Go to it", href: `/pipeline/${encodeURIComponent(toApply.n)}` },
      };
    }
    if (toTailor) {
      return {
        key: `see-score-${toTailor.n}`,
        step: 2,
        text: `Your score for ${toTailor.company} is in: ${toTailor.score}. Open it to see why, then make your tailored CV.`,
        action: { label: "See my score", href: `/pipeline/${encodeURIComponent(toTailor.n)}` },
      };
    }
    if (pathname.startsWith("/explore") || pathname.startsWith("/pipeline")) {
      return {
        key: "pick-one",
        step: 1,
        text: "Pick a job that looks good and press Evaluate. I'll score how well you fit and tell you why (about 5 minutes).",
      };
    }
    return null;
  }, [apps, jobs, pathname, tick]);

  if (!guide || dismissed === guide.key) return null;
  const close = () => {
    setDismissed(guide.key);
    try {
      sessionStorage.setItem(DISMISSED, guide.key);
    } catch {
      /* private mode */
    }
  };
  const steps: [Step, string][] = [[1, "Score"], [2, "Tailored CV"], [3, "Apply"]];
  return (
    <div
      role="complementary"
      aria-label="Your next step"
      className="fixed bottom-20 right-4 z-50 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-border p-4 shadow-xl"
      style={{ background: "var(--bg)" }}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Your next step</span>
        <button onClick={close} aria-label="Hide" className="rounded-md p-1 text-faint transition hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <ol className="mt-3 flex items-center gap-1.5 text-xs">
        {steps.map(([n, label], i) => (
          <li key={n} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-faint">→</span>}
            <span
              className={
                n < guide.step
                  ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-emerald-700 dark:text-emerald-400"
                  : n === guide.step
                    ? "inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 font-medium text-brand-foreground"
                    : "inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-faint"
              }
            >
              {n < guide.step ? <Check className="size-3" /> : n === guide.step && guide.busy ? <Loader2 className="size-3 animate-spin" /> : n}{" "}
              {label}
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm leading-relaxed text-foreground">{guide.text}</p>
      {guide.action &&
        (guide.action.href ? (
          <Link
            href={guide.action.href}
            className="mt-3 inline-flex items-center rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground transition hover:bg-brand-200"
          >
            {guide.action.label}
          </Link>
        ) : (
          <button
            onClick={guide.action.press}
            className="mt-3 inline-flex items-center rounded-full bg-brand px-4 py-1.5 text-sm font-medium text-brand-foreground transition hover:bg-brand-200"
          >
            {guide.action.label}
          </button>
        ))}
    </div>
  );
}
