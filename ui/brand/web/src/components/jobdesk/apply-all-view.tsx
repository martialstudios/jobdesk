"use client";

// JobDesk branded builds: Apply to all. The jobs she picked on My list are
// filled at the same time, each in its own Chrome window (career-ops's apply
// session: open the real form, draft answers from her resume + My info, fill
// it). Then one review: each job is ready, needs an answer or two (asked right
// here, typed into the form when sent, kept in My info), or one to apply to on
// the company's site. She sends one, or every ready one after a single
// confirm that lists them. Nothing is sent without that. A security code a job
// site emails her gets a box on that job's card.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, ExternalLink, Eye, Loader2, Send } from "lucide-react";
import { instrumentSerif } from "@/lib/fonts";
import type { ApplyField } from "@/lib/apply/extract";
import { canAutofill } from "./apply-kind";
import { BrandLogo, prettyCompany } from "./brand-logo";
import { CheerToast } from "./cheer";
import type { ListItem } from "./use-list";

export const APPLY_ALL_KEY = "jobdesk:apply-all";
const CONFIG_KEY = "career-ops:config";
const AT_ONCE = 2;

type Stage = "waiting" | "opening" | "drafting" | "filling" | "ready" | "own" | "sending" | "code" | "sent" | "failed";
type Job = {
  url: string;
  title: string;
  company: string;
  n?: string;
  stage: Stage;
  note: string;
  sessionId?: string;
  fields: ApplyField[];
  answers: Record<string, string>;
  extra: Record<string, string>;
  code: string;
};

const cliId = (): string | null => {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").cliId || null;
  } catch {
    return null;
  }
};
const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// career-ops's pre-fill streams NDJSON; the answers come in its "done" event(s).
async function draftAnswers(sessionId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const r = await post("/api/apply/prefill", { sessionId, cliId: cliId() });
  if (!r.body) return out;
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line) as { t?: string; answers?: Record<string, { value?: string }> };
        if (ev.t === "done") for (const [id, v] of Object.entries(ev.answers || {})) if (v?.value) out[id] = v.value;
      } catch {
        /* a partial line */
      }
    }
  }
  return out;
}

// The same question on another form: by meaning for the common ones (her
// phone is "Phone", "Phone number" or "Mobile"), else by its words.
const sameQuestion = (label: string) => {
  const l = label.toLowerCase();
  if (/phone|mobile/.test(l)) return "phone";
  if (/e-?mail/.test(l)) return "email";
  if (/first name/.test(l)) return "first";
  if (/last name|surname/.test(l)) return "last";
  if (/linkedin/.test(l)) return "linkedin";
  if (/authori[sz]ed|eligible to work/.test(l)) return "authorized";
  if (/sponsor/.test(l)) return "sponsorship";
  return l.replace(/[^a-z0-9]+/g, " ").trim();
};

const missingOf = (j: Job) =>
  j.fields.filter((f) => f.required && f.type !== "file" && f.type !== "checkbox" && !(j.answers[f.id] || "").trim() && !(j.extra[f.id] || "").trim());

export function ApplyAllView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Opened without picks from My list (another window, a bookmark): choose here.
  const [choosing, setChoosing] = useState<{ url: string; title: string; company: string; on: boolean }[] | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [cheer, setCheer] = useState<{ at: number; first: boolean } | null>(null);
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;
  const started = useRef(false);
  const anySent = useRef<boolean | null>(null);

  const patch = useCallback((url: string, p: Partial<Job>) => setJobs((all) => all.map((j) => (j.url === url ? { ...j, ...p } : j))), []);
  // An answer typed on one card goes to every card asking the same question,
  // unless she typed something different there.
  const answer = useCallback((url: string, f: ApplyField, value: string) => {
    const q = sameQuestion(f.label);
    setJobs((all) => {
      const prev = all.find((j) => j.url === url)?.extra[f.id] || "";
      return all.map((j) => {
        if (j.url === url) return { ...j, extra: { ...j.extra, [f.id]: value } };
        if (["sent", "own", "failed"].includes(j.stage)) return j;
        const extra = { ...j.extra };
        for (const g of j.fields) {
          if (sameQuestion(g.label) !== q || (j.answers[g.id] || "").trim()) continue;
          if ((extra[g.id] || "") !== prev) continue;
          if (g.options?.length && !g.options.includes(value)) continue;
          extra[g.id] = value;
        }
        return { ...j, extra };
      });
    });
  }, []);

  // The picked jobs, from My list.
  useEffect(() => {
    let urls: string[] = [];
    try {
      urls = JSON.parse(sessionStorage.getItem(APPLY_ALL_KEY) || "[]");
    } catch {
      urls = [];
    }
    fetch("/api/jobdesk/list")
      .then((r) => r.json())
      .then((d) => {
        const items: ListItem[] = d.items || [];
        anySent.current = items.some((i) => i.status === "applied");
        if (!urls.length) {
          setChoosing(items.filter((i) => i.status !== "applied").map((i) => ({ url: i.url, title: i.title, company: i.company, on: true })));
          return;
        }
        const picked = items.filter((i) => urls.includes(i.url) && i.status !== "applied");
        setJobs(
          picked.map((i) => ({
            url: i.url,
            title: i.title,
            company: i.company,
            n: i.n,
            stage: canAutofill(i.url) ? "waiting" : "own",
            note: canAutofill(i.url) ? "" : "This company's site can't be filled in from here. Apply there, then mark it applied on My list.",
            fields: [],
            answers: {},
            extra: {},
            code: "",
          })),
        );
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Fill them, AT_ONCE at a time.
  const fillOne = useCallback(
    async (j: Job) => {
      patch(j.url, { stage: "opening", note: "Opening the form…" });
      try {
        const r = await post("/api/apply/session", { url: j.url, cliId: cliId() });
        const d = await r.json();
        const block = (d.issues || []).find((i: { level?: string }) => i.level === "block");
        if (d.error || block || d.needsDrive || !d.id) {
          if (d.id) void post("/api/apply/close", { sessionId: d.id });
          patch(j.url, { stage: "own", note: block?.message || d.error || "This form needs a person to get to it. Apply on their site." });
          return;
        }
        const fields: ApplyField[] = d.fields || [];
        patch(j.url, { stage: "drafting", note: "Filling in your answers…", sessionId: d.id, fields });
        const answers = await draftAnswers(d.id);
        patch(j.url, { stage: "filling", note: "Typing them into the form…", answers });
        void post("/api/jobdesk/answers/learn", { fields, answers, company: j.company });
        const f = await post("/api/apply/fill", { sessionId: d.id, answers, fields, handoff: false, company: j.company, application: j.n });
        const fd = await f.json();
        if (fd.error) {
          patch(j.url, { stage: "failed", note: fd.error });
          return;
        }
        patch(j.url, { stage: "ready", note: "" });
      } catch {
        patch(j.url, { stage: "failed", note: "Something went wrong opening this one. Try it from My list." });
      }
    },
    [patch],
  );

  const startChosen = () => {
    const urls = (choosing || []).filter((c) => c.on).map((c) => c.url);
    try {
      sessionStorage.setItem(APPLY_ALL_KEY, JSON.stringify(urls));
    } catch {
      /* fine: this visit has them */
    }
    window.location.reload();
  };

  useEffect(() => {
    if (!loaded || started.current) return;
    started.current = true;
    const queue = jobsRef.current.filter((j) => j.stage === "waiting");
    let i = 0;
    const lane = async () => {
      while (i < queue.length) {
        const j = queue[i++];
        await fillOne(j);
      }
    };
    void Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, lane));
  }, [loaded, fillOne]);

  // Leaving: close the forms that weren't sent.
  useEffect(
    () => () => {
      for (const j of jobsRef.current) if (j.sessionId && j.stage !== "sent") void post("/api/apply/close", { sessionId: j.sessionId });
    },
    [],
  );

  const send = useCallback(
    async (j: Job) => {
      if (!j.sessionId) return;
      patch(j.url, { stage: "sending", note: "Sending…" });
      try {
        const r = await post("/api/jobdesk/submit", {
          sessionId: j.sessionId,
          confirm: true,
          extra: j.extra,
          fields: j.fields,
          company: j.company,
          code: j.stage === "code" || j.code ? j.code || undefined : undefined,
        });
        const d = (await r.json()) as { ok: boolean; message: string; reason?: string; errors?: string[] };
        if (d.ok) {
          await post("/api/jobdesk/list", { url: j.url, status: "applied" }).catch(() => {});
          if (j.n) void post("/api/status", { n: j.n, status: "Applied" }).catch(() => {});
          if (anySent.current === false) setCheer({ at: Date.now(), first: true });
          anySent.current = true;
          patch(j.url, { stage: "sent", note: d.message });
          void post("/api/apply/close", { sessionId: j.sessionId });
        } else if (d.reason === "code") {
          patch(j.url, { stage: "code", note: d.message, code: "" });
        } else {
          patch(j.url, { stage: "ready", note: [d.message, ...(d.errors || [])].join(" ") });
        }
      } catch {
        patch(j.url, { stage: "ready", note: "Couldn't reach the form. Check it in Chrome." });
      }
    },
    [patch],
  );

  const ready = jobs.filter((j) => j.stage === "ready" && missingOf(j).length === 0);
  const working = jobs.filter((j) => ["waiting", "opening", "drafting", "filling", "sending"].includes(j.stage)).length;
  const sendAll = async () => {
    setConfirmAll(false);
    for (const j of ready) await send(jobsRef.current.find((x) => x.url === j.url) || j);
  };

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 md:px-8">
      {cheer && <CheerToast at={cheer.at} first={cheer.first} />}
      <h1 className={`${instrumentSerif.className} text-4xl text-landing md:text-5xl`}>Apply to all</h1>
      <p className="mt-2 text-muted">
        Each job opens in its own Chrome window and gets filled in from your resume and My info. Check any of them, answer what&apos;s missing, then send.
        Nothing is sent until you say so.
      </p>

      {choosing && (
        <div className="mt-8 rounded-2xl border border-border p-5">
          {choosing.length === 0 ? (
            <p className="text-foreground">
              Nothing on <Link href="/my-list" className="text-brand underline-offset-2 hover:underline">My list</Link> to apply to yet.
            </p>
          ) : (
            <>
              <p className="font-medium text-foreground">Which jobs should I fill in?</p>
              <ul className="mt-3 space-y-2">
                {choosing.map((c) => (
                  <li key={c.url}>
                    <label className="flex cursor-pointer items-center gap-2.5 text-foreground">
                      <input
                        type="checkbox"
                        className="size-4 accent-[hsl(26_73%_51%)]"
                        checked={c.on}
                        onChange={() => setChoosing(choosing.map((x) => (x.url === c.url ? { ...x, on: !x.on } : x)))}
                      />
                      {c.title} <span className="text-muted">· {prettyCompany(c.company)}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                onClick={startChosen}
                disabled={!choosing.some((c) => c.on)}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 font-medium text-brand-foreground hover:bg-brand-200 disabled:opacity-50"
              >
                Fill in {choosing.filter((c) => c.on).length}
              </button>
            </>
          )}
        </div>
      )}

      {loaded && !choosing && jobs.length === 0 && (
        <p className="mt-8 rounded-2xl border border-border p-6 text-foreground">
          No jobs picked. Go to <Link href="/my-list" className="text-brand underline-offset-2 hover:underline">My list</Link> and press Apply to all.
        </p>
      )}

      {jobs.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!confirmAll ? (
            <button
              onClick={() => setConfirmAll(true)}
              disabled={ready.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Send className="size-4" /> Submit all ready ({ready.length})
            </button>
          ) : (
            <div className="w-full rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4">
              <p className="font-medium text-foreground">Send these {ready.length} applications for real?</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-foreground">
                {ready.map((j) => (
                  <li key={j.url}>
                    {j.title} at {prettyCompany(j.company)}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-2">
                <button onClick={() => void sendAll()} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700">
                  <Send className="size-4" /> Yes, send them
                </button>
                <button onClick={() => setConfirmAll(false)} className="rounded-full border border-border px-4 py-2 text-muted hover:text-foreground">
                  Not yet
                </button>
              </div>
            </div>
          )}
          {working > 0 && (
            <span className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Working on {working}…
            </span>
          )}
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {jobs.map((j) => {
          const missing = missingOf(j);
          const asked = j.fields.filter((f) => f.required && f.type !== "file" && f.type !== "checkbox" && !(j.answers[f.id] || "").trim());
          return (
            <li key={j.url} className="rounded-2xl border border-border p-4" style={{ background: "var(--bg)" }}>
              <div className="flex items-start gap-3">
                <BrandLogo name={prettyCompany(j.company)} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{j.title}</p>
                  <p className="text-sm text-muted">{prettyCompany(j.company)}</p>
                </div>
                <StageChip j={j} missing={missing.length} />
              </div>
              {j.note && <p className={`mt-2 text-sm ${j.stage === "sent" ? "text-emerald-700 dark:text-emerald-300" : "text-muted"}`}>{j.note}</p>}

              {["ready", "code"].includes(j.stage) && asked.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className={missing.length ? "text-amber-800 dark:text-amber-200" : "text-emerald-700 dark:text-emerald-300"}>
                    {missing.length
                      ? "The form needs these. They go into the form when you send it, and into My info."
                      : "All answered. They go into the form when you send it, and into My info."}
                  </p>
                  {asked.map((f) => (
                    <label key={f.id} className="mt-2 block">
                      <span className="flex items-center gap-1.5 text-foreground">
                        {(j.extra[f.id] || "").trim() ? <Check className="size-3.5 text-emerald-600" /> : null}
                        {f.label.replace(/\s*\*\s*$/, "")}
                      </span>
                      {f.options?.length ? (
                        <select
                          value={j.extra[f.id] || ""}
                          onChange={(e) => answer(j.url, f, e.target.value)}
                          className="mt-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-foreground"
                        >
                          <option value="">Choose…</option>
                          {f.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={j.extra[f.id] || ""}
                          onChange={(e) => answer(j.url, f, e.target.value)}
                          className="mt-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-foreground outline-none focus:border-brand/60"
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}

              {j.stage === "code" && (
                <label className="mt-3 block rounded-lg border border-brand/40 bg-brand/5 p-3 text-sm">
                  <span className="text-foreground">Security code from the email</span>
                  <input
                    value={j.code}
                    onChange={(e) => patch(j.url, { code: e.target.value.trim() })}
                    className="mt-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 font-mono tracking-widest text-foreground outline-none focus:border-brand/60"
                  />
                </label>
              )}

              <div className="mt-3 flex flex-wrap gap-2 text-sm">
                {j.sessionId && !["sent", "own"].includes(j.stage) && (
                  <button onClick={() => void post("/api/jobdesk/show", { sessionId: j.sessionId })} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-muted hover:text-foreground">
                    <Eye className="size-4" /> Show in Chrome
                  </button>
                )}
                {j.stage === "ready" && (
                  <SendOne j={j} disabled={missing.length > 0} onSend={() => void send(j)} />
                )}
                {j.stage === "code" && (
                  <button
                    onClick={() => void send(j)}
                    disabled={j.code.length < 4}
                    className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Send className="size-4" /> Enter the code &amp; send
                  </button>
                )}
                {j.stage === "own" && (
                  <a href={j.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-muted hover:text-foreground">
                    <ExternalLink className="size-4" /> Apply on their site
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SendOne({ j, disabled, onSend }: { j: Job; disabled: boolean; onSend: () => void }) {
  const [sure, setSure] = useState(false);
  if (!sure)
    return (
      <button
        onClick={() => setSure(true)}
        disabled={disabled}
        className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        <Send className="size-4" /> {disabled ? "Answer the questions above" : "Send this one"}
      </button>
    );
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-foreground">Send to {prettyCompany(j.company)}?</span>
      <button onClick={onSend} className="rounded-full bg-emerald-600 px-3.5 py-1.5 font-medium text-white hover:bg-emerald-700">
        Yes, send it
      </button>
      <button onClick={() => setSure(false)} className="rounded-full border border-border px-3 py-1.5 text-muted">
        No
      </button>
    </span>
  );
}

function StageChip({ j, missing }: { j: Job; missing: number }) {
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium";
  if (["waiting", "opening", "drafting", "filling", "sending"].includes(j.stage))
    return (
      <span className={`${base} bg-surface text-muted`}>
        <Loader2 className="size-3 animate-spin" /> {j.stage === "waiting" ? "Waiting" : j.stage === "sending" ? "Sending" : "Filling"}
      </span>
    );
  if (j.stage === "sent")
    return (
      <span className={`${base} bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`}>
        <CheckCircle2 className="size-3" /> Sent
      </span>
    );
  if (j.stage === "code") return <span className={`${base} bg-brand/15 text-brand`}>Needs the emailed code</span>;
  if (j.stage === "own") return <span className={`${base} bg-surface text-muted`}>Apply on their site</span>;
  if (j.stage === "failed")
    return (
      <span className={`${base} bg-red-500/10 text-red-600`}>
        <AlertTriangle className="size-3" /> Didn&apos;t open
      </span>
    );
  return missing ? (
    <span className={`${base} bg-amber-500/15 text-amber-700 dark:text-amber-300`}>Needs {missing} answer{missing === 1 ? "" : "s"}</span>
  ) : (
    <span className={`${base} bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`}>Ready</span>
  );
}
