"use client";

// JobDesk branded builds: My list. The jobs someone picked on Find jobs, and
// the one thing they're for: applying. "Apply to these" walks through them one
// at a time: career-ops opens the real application already filled in (with
// their resume attached), they check it and press Submit themselves, then the
// next one. Scoring and tailoring are optional extras for a group.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Download, ExternalLink, Loader2, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { instrumentSerif } from "@/lib/fonts";
import { useJobs } from "@/components/jobs/job-store";
import { useApply } from "@/components/apply/apply-provider";
import { useList, type ListItem } from "./use-list";
import { queueTasks, useTasks, clearFailed } from "./tasks";
import { tierOf } from "./match";
import { canAutofill } from "./apply-kind";

const APPLY_KEY = "jobdesk:applying";

function readApplying(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(APPLY_KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function writeApplying(urls: string[]) {
  try {
    if (urls.length) sessionStorage.setItem(APPLY_KEY, JSON.stringify(urls));
    else sessionStorage.removeItem(APPLY_KEY);
  } catch {
    /* private mode */
  }
}

export function MyListView() {
  const router = useRouter();
  const apply = useApply();
  const { jobs } = useJobs();
  const tasks = useTasks();
  const { items, loaded, setStatus, remove } = useList(8000);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string[]>([]);

  useEffect(() => setApplying(readApplying()), []);

  const open = items.filter((i) => i.status !== "applied");
  const done = items.filter((i) => i.status === "applied");
  // Nothing checked means "all of them".
  const chosen = useMemo(() => {
    const sel = open.filter((i) => picked.has(i.url));
    return sel.length ? sel : open;
  }, [open, picked]);

  const stateOf = (i: ListItem): { label: string; busy?: boolean; failed?: string } | null => {
    const task = tasks.find((t) => t.url === i.url);
    if (task?.failed) return { label: "Didn't work", failed: task.failed };
    if (jobs.some((j) => j.kind === "evaluate" && j.input === i.url && j.status === "running")) return { label: "Scoring…", busy: true };
    if (i.n && jobs.some((j) => j.kind === "pdf" && j.input === i.n && j.status === "running")) return { label: "Tailoring your resume…", busy: true };
    if (task) return { label: task.tailor && i.n ? "Waiting to tailor" : "Waiting to score", busy: true };
    return null;
  };

  // The apply walk-through: one job at a time, in the order picked.
  const current = items.find((i) => i.url === applying[0]);
  const startApplying = () => {
    const urls = chosen.map((i) => i.url);
    writeApplying(urls);
    setApplying(urls);
  };
  const next = async (submitted: boolean) => {
    if (current && submitted) {
      await setStatus(current.url, "applied");
      if (current.n) {
        void fetch("/api/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ n: current.n, status: "Applied" }),
        }).catch(() => {});
      }
    }
    const rest = applying.slice(1);
    writeApplying(rest);
    setApplying(rest);
  };
  const stopApplying = () => {
    writeApplying([]);
    setApplying([]);
  };
  const openForm = (i: ListItem) => {
    void apply.open(i.url, { prefill: true, company: i.company, n: i.n, from: "/my-list" });
    router.push("/apply");
  };

  if (current) {
    return (
      <div className="mx-auto max-w-2xl px-5 pb-24 pt-12 md:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted">
          Applying · {applying.length} left
        </p>
        <h1 className={`${instrumentSerif.className} mt-3 text-4xl text-landing`}>{current.title}</h1>
        <p className="mt-1 text-muted">{[current.company, current.location].filter(Boolean).join(" · ")}</p>
        {canAutofill(current.url, current.ats) ? (
          <>
            <ol className="mt-8 space-y-3 text-foreground">
              <li>
                <strong>1.</strong> Press <strong>Open the application</strong>. I&apos;ll open the real form and fill it in from your resume
                {current.tailored ? " (with the resume tailored for this job)" : ""}.
              </li>
              <li>
                <strong>2.</strong> Check every answer, fix anything that&apos;s off, and press <strong>Submit</strong> on their site. I never submit for you.
              </li>
              <li>
                <strong>3.</strong> Come back here and tell me it&apos;s done.
              </li>
            </ol>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <button onClick={() => openForm(current)} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground hover:bg-brand-200">
                <Send className="size-4" /> Open the application
              </button>
              <a href={current.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-foreground">
                <ExternalLink className="size-4" /> See the posting
              </a>
            </div>
          </>
        ) : (
          <>
            <p className="mt-6 rounded-xl bg-surface p-4 text-foreground">
              This company takes applications on its own site, which asks you to make an account first, so I can&apos;t fill
              this one in for you. Here&apos;s the quickest way:
            </p>
            <ol className="mt-6 space-y-3 text-foreground">
              <li>
                <strong>1.</strong> Save your resume as a PDF{current.tailored ? " (the one tailored for this job)" : ""}.
              </li>
              <li>
                <strong>2.</strong> Open the application on their site, make an account if it asks, and upload the PDF. Most sites then fill in the rest from it.
              </li>
              <li>
                <strong>3.</strong> Check it, press <strong>Submit</strong>, and come back here to tell me it&apos;s done.
              </li>
            </ol>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <a
                href={current.tailored && current.n ? `/api/cv-pdf?n=${encodeURIComponent(current.n)}&company=${encodeURIComponent(current.company)}` : "/api/jobdesk/resume-pdf"}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-foreground"
              >
                <Download className="size-4" /> My resume (PDF)
              </a>
              <a href={current.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground hover:bg-brand-200">
                <ExternalLink className="size-4" /> Apply on their site
              </a>
            </div>
          </>
        )}
        <div className="mt-10 flex flex-wrap items-center gap-2.5 border-t border-border pt-6">
          <button onClick={() => void next(true)} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700">
            <Check className="size-4" /> I submitted it, next
          </button>
          <button onClick={() => void next(false)} className="rounded-full border border-border px-4 py-2.5 text-foreground">
            Skip for now
          </button>
          <button onClick={stopApplying} className="ml-auto text-sm text-muted underline-offset-2 hover:underline">
            Stop and go back to my list
          </button>
        </div>
        <p className="mt-6 text-sm text-faint">Filling in forms needs Google Chrome on this Mac.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-5 pb-24 pt-10 md:px-8">
      <h1 className={`${instrumentSerif.className} text-4xl text-landing md:text-5xl`}>My list</h1>
      {loaded && items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border p-6 text-foreground">
          Nothing here yet. On <Link href="/find" className="text-brand underline-offset-2 hover:underline">Find jobs</Link>, check
          the ones you like and press <strong>Add to my list</strong>.
        </div>
      ) : (
        <>
          <p className="mt-2 text-muted">
            {open.length ? `${open.length} job${open.length === 1 ? "" : "s"} ready to apply to.` : "You've applied to everything on your list. 🎉"}{" "}
            {open.length > 0 && "Check some to work on just those, or leave them all unchecked for all."}
          </p>

          {open.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2.5">
              <button onClick={startApplying} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground hover:bg-brand-200">
                <Send className="size-4" /> Apply to {picked.size ? `these ${chosen.length}` : `all ${chosen.length}`}
              </button>
              <button
                onClick={() => queueTasks(chosen.filter((i) => !i.n).map((i) => ({ url: i.url, company: i.company, title: i.title })), false)}
                disabled={!chosen.some((i) => !i.n)}
                title="I'll read each posting and tell you how well you fit, and why. Uses a little AI per job, about 5 minutes each."
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-foreground hover:border-brand/50 disabled:opacity-40"
              >
                <Sparkles className="size-4" /> Score {picked.size ? "these" : "them"} for me
              </button>
              <button
                onClick={() => queueTasks(chosen.filter((i) => !i.tailored).map((i) => ({ url: i.url, company: i.company, title: i.title })), true)}
                disabled={!chosen.some((i) => !i.tailored)}
                title="I'll rewrite your resume for each job, using only what's true. Uses a little AI per job."
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-foreground hover:border-brand/50 disabled:opacity-40"
              >
                <Wand2 className="size-4" /> Tailor my resume for {picked.size ? "these" : "them"}
              </button>
            </div>
          )}

          <ul className="mt-6 flex flex-col gap-2.5">
            {[...open, ...done].map((i) => {
              const tier = tierOf(i.score);
              const st = stateOf(i);
              const applied = i.status === "applied";
              return (
                <li key={i.url} className={`flex items-start gap-3.5 rounded-2xl border border-border p-4 ${applied ? "opacity-60" : ""}`}>
                  <input
                    type="checkbox"
                    aria-label={`Pick ${i.title}`}
                    className="mt-1 size-4 shrink-0 accent-[hsl(26_73%_51%)]"
                    disabled={applied}
                    checked={picked.has(i.url)}
                    onChange={() =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (n.has(i.url)) n.delete(i.url);
                        else n.add(i.url);
                        return n;
                      })
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{i.title}</span>
                      {applied && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          <Check className="size-3" /> Applied
                        </span>
                      )}
                      {tier && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tier.className}`}>{tier.label}</span>}
                      {i.tailored && <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted">Tailored resume ready</span>}
                      {st && (
                        <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                          {st.busy && <Loader2 className="size-3 animate-spin" />} {st.label}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-sm text-muted">{[i.company, i.location].filter(Boolean).join(" · ")}</div>
                    {st?.failed && (
                      <div className="mt-1 text-sm text-muted">
                        {st.failed}{" "}
                        <button onClick={() => clearFailed(i.url)} className="text-brand underline-offset-2 hover:underline">OK</button>
                      </div>
                    )}
                    {i.n && (
                      <Link href={`/job/${i.n}`} className="mt-1.5 inline-flex items-center gap-1 text-sm text-brand underline-offset-2 hover:underline">
                        See how you fit <ArrowRight className="size-3.5" />
                      </Link>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!applied && (
                      <button onClick={() => openForm(i)} title="Apply to this one" className="rounded-md p-1.5 text-faint hover:text-brand">
                        <Send className="size-4" />
                      </button>
                    )}
                    <a href={i.url} target="_blank" rel="noreferrer" title="Open the job posting" className="rounded-md p-1.5 text-faint hover:text-foreground">
                      <ExternalLink className="size-4" />
                    </a>
                    <button onClick={() => void remove(i.url)} title="Remove from my list" className="rounded-md p-1.5 text-faint hover:text-red-500">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
