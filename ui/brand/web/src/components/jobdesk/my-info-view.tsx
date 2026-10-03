"use client";

// JobDesk branded builds: My info. The things job applications ask beyond the
// resume (address, work authorization, start date, pay, education, how you
// heard, the optional demographic questions), answered once and used on every
// form (lib/jobdesk/answers.ts). Below: questions forms asked that she hasn't
// answered yet, and every answer the app has learned from her forms, each one
// editable or removable. Saves as she types.

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { instrumentSerif } from "@/lib/fonts";

type Question = { key: string; label: string; section: string; options?: string[]; placeholder?: string; hint?: string };
type Learned = { key: string; label: string; value: string; at: string; uses: number };
type Missing = { key: string; label: string; at: string };

const box = "w-full rounded-xl border border-border bg-transparent px-3 py-2 text-foreground outline-none focus:border-brand/60";
const SECTIONS = ["Contact", "Work", "Availability", "Education", "About you"];
const SECTION_NOTE: Record<string, string> = {
  "About you": "US forms often ask these. They're optional and never decide whether you're hired; “I don't wish to answer” is always fine.",
};

async function save(body: unknown) {
  await fetch("/api/jobdesk/answers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});
}

export function MyInfoView() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [basics, setBasics] = useState<Record<string, string>>({});
  const [learned, setLearned] = useState<Learned[]>([]);
  const [missing, setMissing] = useState<Missing[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const timer = useRef(0);

  const load = () =>
    fetch("/api/jobdesk/answers")
      .then((r) => r.json())
      .then((d) => {
        setQuestions(d.questions || []);
        setBasics(d.basics || {});
        setLearned(d.learned || []);
        setMissing(d.missing || []);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  useEffect(() => {
    void load();
  }, []);

  const setBasic = (key: string, value: string) => {
    setBasics((b) => {
      const next = { ...b, [key]: value };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        void save({ basics: next }).then(() => {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 1500);
        });
      }, 600);
      return next;
    });
  };

  const answerMissing = async (m: Missing) => {
    const value = (draft[m.key] || "").trim();
    if (!value) return;
    await save({ learned: [{ key: m.key, label: m.label, value }] });
    void load();
  };
  const editLearned = async (l: Learned, value: string) => {
    await save({ learned: [{ key: l.key, label: l.label, value }] });
  };
  const forget = async (l: Learned) => {
    await save({ learned: [{ key: l.key, remove: true }] });
    setLearned((all) => all.filter((x) => x.key !== l.key));
  };

  const filled = questions.filter((q) => (basics[q.key] || "").trim()).length;

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 md:px-8">
      <h1 className={`${instrumentSerif.className} text-4xl text-landing md:text-5xl`}>My info</h1>
      <p className="mt-2 text-muted">
        What job applications ask beyond your resume. Answer once and every form gets filled with it; it saves as you type.
      </p>
      {loaded && (
        <p className="mt-2 flex items-center gap-2 text-sm text-faint">
          {filled} of {questions.length} answered
          {saved && (
            <span className="inline-flex items-center gap-1 text-emerald-600">
              <Check className="size-3.5" /> Saved
            </span>
          )}
        </p>
      )}
      {!loaded && (
        <p className="mt-8 flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}

      {missing.length > 0 && (
        <section className="mt-8 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <h2 className="font-medium text-foreground">Forms asked these and they were left empty</h2>
          <p className="mt-1 text-sm text-muted">Answer them here and the next form fills them in for you.</p>
          {missing.map((m) => (
            <div key={m.key} className="mt-4">
              <p className="text-sm font-medium text-foreground">{m.label}</p>
              <div className="mt-1.5 flex gap-2">
                <input value={draft[m.key] || ""} onChange={(e) => setDraft({ ...draft, [m.key]: e.target.value })} className={box} />
                <button onClick={() => void answerMissing(m)} className="shrink-0 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground">
                  Save
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {loaded &&
        SECTIONS.map((section) => {
          const qs = questions.filter((q) => q.section === section);
          if (!qs.length) return null;
          return (
            <section key={section} className="mt-8">
              <h2 className="font-medium text-foreground">{section}</h2>
              {SECTION_NOTE[section] && <p className="mt-1 text-sm text-muted">{SECTION_NOTE[section]}</p>}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {qs.map((q) => (
                  <label key={q.key} className={`block ${q.options && q.options.some((o) => o.length > 30) ? "sm:col-span-2" : ""}`}>
                    <span className="text-sm text-foreground">{q.label}</span>
                    {q.options ? (
                      <select value={basics[q.key] || ""} onChange={(e) => setBasic(q.key, e.target.value)} className={`${box} mt-1`}>
                        <option value="">Choose…</option>
                        {q.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input value={basics[q.key] || ""} placeholder={q.placeholder} onChange={(e) => setBasic(q.key, e.target.value)} className={`${box} mt-1`} />
                    )}
                    {q.hint && <span className="mt-1 block text-xs text-faint">{q.hint}</span>}
                  </label>
                ))}
              </div>
            </section>
          );
        })}

      {loaded && (
        <section className="mt-10">
          <h2 className="font-medium text-foreground">Learned from your applications</h2>
          <p className="mt-1 text-sm text-muted">
            {learned.length
              ? "Answers you gave on real forms, reused when another form asks the same thing. Change or remove any."
              : "Nothing yet. When you fill in an application, your answers show up here and the next form reuses them."}
          </p>
          <div className="mt-3 space-y-2">
            {learned.map((l) => (
              <div key={l.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3" style={{ background: "var(--bg)" }}>
                <span className="min-w-0 flex-1 text-sm text-foreground">{l.label}</span>
                <input
                  defaultValue={l.value}
                  onBlur={(e) => e.target.value.trim() && e.target.value !== l.value && void editLearned(l, e.target.value)}
                  className="w-full rounded-lg border border-border bg-transparent px-2 py-1 text-sm text-foreground outline-none focus:border-brand/60 sm:w-64"
                />
                <button onClick={() => void forget(l)} aria-label={`Forget ${l.label}`} className="rounded-md p-1.5 text-faint hover:text-red-500">
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
