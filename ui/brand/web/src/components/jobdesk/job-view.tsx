"use client";

// JobDesk branded builds: one scored job. Encouraging first: a friendly match
// label, where they shine, how to make the application stronger. The full
// breakdown, with the exact score, is one click away ("Read why").

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, Download, ExternalLink, FileText, Loader2, Send, Wand2 } from "lucide-react";
import { instrumentSerif } from "@/lib/fonts";
import { useJobs } from "@/components/jobs/job-store";
import { useApply } from "@/components/apply/apply-provider";
import { tierOf } from "./match";
import { Doc } from "./doc";
import { canAutofill } from "./apply-kind";
import { BrandLogo, prettyCompany } from "./brand-logo";

type Job = {
  n: string;
  company: string;
  role: string;
  url: string;
  score: number | null;
  strengths: string[];
  improve: string[];
  missing: string[];
  coverLetter: string;
  breakdown: string;
  status: string;
  tailored: boolean;
};

export function JobView({ n }: { n: string }) {
  const router = useRouter();
  const apply = useApply();
  const { jobs, startJob } = useJobs();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [why, setWhy] = useState(false);
  const [letter, setLetter] = useState(false);

  const tailoring = jobs.some((j) => j.kind === "pdf" && j.input === n && j.status === "running");
  const tailoredNow = jobs.some((j) => j.kind === "pdf" && j.input === n && j.status === "done");

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/jobdesk/job?n=${encodeURIComponent(n)}`)
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          if (d.error) setError(d.error);
          else setJob(d);
        })
        .catch(() => alive && setError("Couldn't load this job."));
    load();
    return () => {
      alive = false;
    };
  }, [n, tailoredNow]);

  if (error) return <div className="mx-auto max-w-3xl px-6 py-16 text-foreground">{error}</div>;
  if (!job)
    return (
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-16 text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );

  const tier = tierOf(job.score);
  const easy = canAutofill(job.url);
  const tailored = job.tailored || tailoredNow;
  const tailor = () =>
    startJob({ title: `Tailoring resume · ${job.company}`, subtitle: job.role, kind: "pdf", input: n, page: `/job/${n}` });
  const applyNow = () => {
    void apply.open(job.url, { prefill: true, company: job.company, n, from: `/job/${n}` });
    router.push("/apply");
  };

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-8 md:px-8">
      <Link href="/my-list" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> My list
      </Link>
      <h1 className={`${instrumentSerif.className} mt-4 text-4xl leading-tight text-landing md:text-5xl`}>{job.role}</h1>
      <p className="mt-2 flex items-center gap-2.5 text-lg">
        <BrandLogo name={prettyCompany(job.company)} size={30} />
        <span className="font-semibold text-foreground">{prettyCompany(job.company)}</span>
      </p>

      {tier && (
        <div className="mt-6 rounded-2xl border border-border p-5">
          <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${tier.className}`}>{tier.label}</span>
          <p className="mt-3 text-lg text-foreground">{tier.line}</p>
        </div>
      )}

      {job.strengths.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">Where you shine</h2>
          <ul className="mt-3 space-y-2">
            {job.strengths.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-foreground">
                <span className="mt-1 text-emerald-600">✓</span> <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {job.improve.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">How to make your application stronger</h2>
          <ul className="mt-3 space-y-2">
            {job.improve.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-foreground">
                <span className="mt-1 text-brand">→</span> <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {job.missing.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-foreground">What they ask for that your resume doesn&apos;t show yet</h2>
          <p className="mt-1 text-sm text-muted">If you do have this experience, add it to your resume. It changes everything.</p>
          <ul className="mt-3 space-y-2">
            {job.missing.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-foreground">
                <span className="mt-1 text-faint">•</span> <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex flex-wrap gap-2.5">
        {easy ? (
          <button onClick={applyNow} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground hover:bg-brand-200">
            <Send className="size-4" /> Apply
          </button>
        ) : (
          <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground hover:bg-brand-200">
            <ExternalLink className="size-4" /> Apply on their site
          </a>
        )}
        {!easy && !tailored && (
          <a href="/api/jobdesk/resume-pdf" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-foreground">
            <Download className="size-4" /> My resume (PDF)
          </a>
        )}
        {tailored ? (
          <a
            href={`/api/cv-pdf?n=${encodeURIComponent(n)}&company=${encodeURIComponent(job.company)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-emerald-700 dark:text-emerald-300"
          >
            <FileText className="size-4" /> See your tailored resume
          </a>
        ) : (
          <button
            onClick={tailor}
            disabled={tailoring}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-foreground hover:border-brand/50 disabled:opacity-60"
          >
            {tailoring ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
            {tailoring ? "Tailoring your resume… (a minute or two)" : "Tailor my resume for this job"}
          </button>
        )}
        <a href={job.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-foreground">
          <ExternalLink className="size-4" /> The posting
        </a>
      </div>
      <p className="mt-3 text-sm text-faint">
        {easy
          ? `Apply fills in the real form with ${tailored ? "your tailored resume" : "your resume"} attached. You check it and press Submit yourself.`
          : "This company's form is on its own site and asks for an account first, so it can't be filled in for you. Upload your resume PDF there; most sites fill in the rest from it."}
      </p>

      {job.coverLetter && (
        <section className="mt-10 rounded-2xl border border-border">
          <button onClick={() => setLetter((v) => !v)} className="flex w-full items-center justify-between p-4 text-left font-medium text-foreground">
            Your cover letter draft <ChevronDown className={`size-4 transition ${letter ? "rotate-180" : ""}`} />
          </button>
          {letter && (
            <Doc className="border-t border-border p-5">{job.coverLetter}</Doc>
          )}
        </section>
      )}

      <section className="mt-4 rounded-2xl border border-border">
        <button onClick={() => setWhy((v) => !v)} className="flex w-full items-center justify-between p-4 text-left font-medium text-foreground">
          Read why {job.score !== null && <span className="ml-2 text-sm font-normal text-muted">(detailed score: {job.score} out of 5)</span>}
          <ChevronDown className={`ml-auto size-4 transition ${why ? "rotate-180" : ""}`} />
        </button>
        {why && (
          <Doc className="border-t border-border p-5">{job.breakdown}</Doc>
        )}
      </section>
    </div>
  );
}
