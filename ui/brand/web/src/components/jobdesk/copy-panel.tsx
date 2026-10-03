"use client";

// JobDesk branded builds: send it yourself, without starting from scratch.
// For job sites that turn down a browser the app drives (Ashby flags those
// as possible spam, approved or not), the app still reads the form and drafts
// every answer; here they are in the form's order, each with a copy button,
// plus "Copy next" to step through them, her resume PDF, and the form opened
// in her own Chrome. "I sent it" marks it applied and keeps her answers.

import { useState } from "react";
import { Check, CheckCircle2, Copy, Download, ExternalLink, Send } from "lucide-react";
import type { ApplyField } from "@/lib/apply/extract";
import { CheerToast } from "./cheer";

const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// Ashby's form is the posting's /application tab.
export function applicationUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/ashbyhq\.com$/i.test(u.hostname) && !/\/application\/?$/.test(u.pathname)) u.pathname = u.pathname.replace(/\/$/, "") + "/application";
    return u.toString();
  } catch {
    return url;
  }
}

const shown = (f: ApplyField) => f.label.replace(/\s*\*\s*$/, "").trim();

export function CopyPanel({
  url,
  company,
  n,
  fields,
  answers,
  intro,
  onSent,
}: {
  url: string;
  company: string;
  n?: string;
  fields: ApplyField[];
  answers: Record<string, string>;
  intro?: string;
  onSent?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(answers);
  const [copied, setCopied] = useState<string>("");
  const [step, setStep] = useState(0);
  const [sent, setSent] = useState(false);
  const [cheer, setCheer] = useState<{ at: number; first: boolean } | null>(null);
  // What she pastes: every question but the resume upload (that's the PDF button).
  const rows = fields.filter((f) => f.type !== "file" && (values[f.id] || "").trim());
  const empty = fields.filter((f) => f.type !== "file" && f.required && !(values[f.id] || "").trim());
  const hasFile = fields.some((f) => f.type === "file");

  const copy = async (f: ApplyField) => {
    try {
      await navigator.clipboard.writeText(values[f.id] || "");
    } catch {
      const t = document.createElement("textarea");
      t.value = values[f.id] || "";
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(f.id);
  };
  const copyNext = async () => {
    const f = rows[step];
    if (!f) return;
    await copy(f);
    setStep((s) => Math.min(s + 1, rows.length));
  };

  const markSent = async () => {
    const before = await fetch("/api/jobdesk/list")
      .then((r) => r.json())
      .catch(() => ({ items: [] }));
    const first = !(before.items || []).some((i: { status?: string }) => i.status === "applied");
    await post("/api/jobdesk/list", { add: [{ url, company }] }).catch(() => {});
    await post("/api/jobdesk/list", { url, status: "applied" }).catch(() => {});
    if (n) void post("/api/status", { n, status: "Applied" }).catch(() => {});
    void post("/api/jobdesk/answers/learn", { fields, answers: values, company });
    setCheer({ at: Date.now(), first });
    setSent(true);
    onSent?.();
  };

  if (sent) {
    return (
      <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
        {cheer && <CheerToast at={cheer.at} first={cheer.first} />}
        <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-5" /> Marked applied. It&apos;s in your Follow-ups now.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm">
      <p className="text-foreground">
        {intro ||
          "This company's job site turns down applications sent by the app, so you send this one from your own Chrome. Every answer is ready: copy, paste, done."}
      </p>
      <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-muted">
        <li>Open the form in your Chrome.</li>
        <li>Press Copy next, click the matching box in the form, paste (⌘V). Repeat.</li>
        {hasFile && <li>Upload your resume PDF where it asks for one.</li>}
        <li>Press Submit there, then I sent it here.</li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={applicationUrl(url)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 font-medium text-brand-foreground hover:bg-brand-200"
        >
          <ExternalLink className="size-4" /> Open in my Chrome
        </a>
        {rows.length > 0 && (
          <button onClick={() => void copyNext()} disabled={step >= rows.length} className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 px-4 py-2 font-medium text-foreground hover:border-brand disabled:opacity-50">
            <Copy className="size-4" />
            {step < rows.length ? `Copy next: ${shown(rows[step]).slice(0, 40)}` : "All copied"}
          </button>
        )}
        {hasFile && (
          <a href="/api/jobdesk/resume-pdf" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-muted hover:text-foreground">
            <Download className="size-4" /> My resume PDF
          </a>
        )}
      </div>

      <ul className="mt-4 space-y-1.5">
        {rows.map((f, i) => (
          <li key={f.id} className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${i === step ? "border-brand/50" : "border-border"}`} style={{ background: "var(--bg)" }}>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">{shown(f)}</p>
              <input
                value={values[f.id] || ""}
                onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                className="w-full bg-transparent text-foreground outline-none"
              />
            </div>
            <button onClick={() => void copy(f)} aria-label={`Copy ${shown(f)}`} className="shrink-0 rounded-md p-1.5 text-muted hover:text-foreground">
              {copied === f.id ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            </button>
          </li>
        ))}
      </ul>
      {empty.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="text-amber-800 dark:text-amber-200">Answer these here first (they&apos;re saved to My info too):</p>
          {empty.map((f) => (
            <label key={f.id} className="mt-2 block">
              <span className="text-foreground">{shown(f)}</span>
              {f.options?.length ? (
                <select value={values[f.id] || ""} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-foreground">
                  <option value="">Choose…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={values[f.id] || ""} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-foreground outline-none focus:border-brand/60" />
              )}
            </label>
          ))}
        </div>
      )}
      <button onClick={() => void markSent()} className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700">
        <Send className="size-4" /> I sent it
      </button>
    </div>
  );
}
