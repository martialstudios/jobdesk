"use client";

// JobDesk branded builds: My resume. career-ops keeps the resume as Markdown
// (cv.md), which is great for its AI and awkward for people. Here it's shown
// as a document, with three ways to change it: a fill-in form (no Markdown
// symbols), "Ask for a change" (Claude edits, they approve), or a new upload.

import { useEffect, useState } from "react";
import { Download, Loader2, MessageSquare, Pencil, Plus, RotateCcw, Trash2, Upload, X } from "lucide-react";
import { instrumentSerif } from "@/lib/fonts";
import { CvIngest } from "@/components/cv/cv-ingest";
import { Doc } from "./doc";

type Entry = { heading: string; body: string; original: string };
type Section = { title: string; intro: string; introOriginal: string; entries: Entry[] };
type Model = { prefix: string; name: string; header: string; headerOriginal: string; sections: Section[] };

// Shown without Markdown: "- x" → "• x", **bold** → bold.
const plainLine = (l: string) => l.replace(/^\s*[-*]\s+/, "• ").replace(/\*\*(.+?)\*\*/g, "$1");
const toPlain = (text: string) => text.split("\n").map(plainLine).join("\n");
/** Back to Markdown: lines they didn't change keep their exact formatting. */
function fromPlain(edited: string, original: string): string {
  const keep = new Map<string, string>();
  for (const line of original.split("\n")) if (!keep.has(plainLine(line))) keep.set(plainLine(line), line);
  return edited
    .split("\n")
    .map((l) => keep.get(l) ?? l.replace(/^\s*•\s*/, "- "))
    .join("\n");
}

function parse(md: string): Model {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let prefix = "";
  let name = "";
  const header: string[] = [];
  const sections: Section[] = [];
  let sec: Section | null = null;
  let entry: Entry | null = null;
  const flushEntry = () => {
    if (sec && entry) {
      entry.body = entry.original.trim();
      sec.entries.push(entry);
    }
    entry = null;
  };
  for (const line of lines) {
    const h1 = /^#\s+(.*)$/.exec(line);
    const h2 = /^##\s+(.*)$/.exec(line);
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h1 && !name && !sec) {
      const m = /^(CV\s*[-—–:]+\s*)?(.*)$/i.exec(h1[1])!;
      prefix = m[1] || "";
      name = m[2].trim();
    } else if (h2) {
      flushEntry();
      sec = { title: h2[1].trim(), intro: "", introOriginal: "", entries: [] };
      sections.push(sec);
    } else if (h3 && sec) {
      flushEntry();
      entry = { heading: h3[1].trim(), body: "", original: "" };
    } else if (entry) {
      entry.original += `${line}\n`;
    } else if (sec) {
      sec.introOriginal += `${line}\n`;
    } else {
      header.push(line);
    }
  }
  flushEntry();
  for (const s of sections) s.introOriginal = s.introOriginal.trim();
  const headerOriginal = header.join("\n").trim();
  return {
    prefix,
    name,
    header: toPlain(headerOriginal),
    headerOriginal,
    sections: sections.map((s) => ({
      ...s,
      intro: toPlain(s.introOriginal),
      entries: s.entries.map((e) => ({ ...e, body: toPlain(e.body) })),
    })),
  };
}

function serialize(m: Model): string {
  const out: string[] = [`# ${m.prefix}${m.name.trim()}`, ""];
  const header = fromPlain(m.header, m.headerOriginal).trim();
  if (header) out.push(header, "");
  for (const s of m.sections) {
    out.push(`## ${s.title.trim()}`, "");
    const intro = fromPlain(s.intro, s.introOriginal).trim();
    if (intro) out.push(intro, "");
    for (const e of s.entries) {
      if (!e.heading.trim() && !e.body.trim()) continue;
      out.push(`### ${e.heading.trim()}`);
      const body = fromPlain(e.body, e.original).trim();
      if (body) out.push(body);
      out.push("");
    }
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// "# CV -- Name" (career-ops's convention) shows as just the name.
const shown = (md: string) => md.replace(/^#\s*CV\s*[-—–:]+\s*/m, "# ");

const box = "w-full rounded-xl border border-border bg-transparent px-3 py-2 text-foreground outline-none focus:border-brand/60";
const rowsFor = (t: string) => Math.min(14, Math.max(2, t.split("\n").length + 1));

type Mode = "view" | "edit" | "ask" | "upload";

// Starting over, or handing the app to someone else.
function StartFresh() {
  const [asking, setAsking] = useState(false);
  // "Start over" in the sidebar links here (#start-over).
  const [glow, setGlow] = useState(false);
  useEffect(() => {
    if (window.location.hash !== "#start-over") return;
    const t = window.setTimeout(() => {
      document.getElementById("start-over")?.scrollIntoView({ behavior: "smooth", block: "center" });
      setGlow(true);
    }, 300);
    return () => window.clearTimeout(t);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/jobdesk/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: "start fresh" }),
      });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Couldn't start fresh.");
      // What this browser remembers about the old searches and list.
      try {
        for (const k of Object.keys(localStorage)) if (k.startsWith("jobdesk:")) localStorage.removeItem(k);
        sessionStorage.clear();
      } catch {
        /* nothing remembered */
      }
      window.location.href = "/";
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <section id="start-over" className={`mt-12 rounded-2xl border p-5 transition-colors ${glow ? "border-brand" : "border-border"}`}>
      <h2 className="font-medium text-foreground">Start over from scratch</h2>
      <p className="mt-1 text-sm text-muted">
        Starting over, or giving this app to someone else? This clears the resume, your answers, My list, follow-ups,
        scores and tailored resumes, and takes you back to the start. Nothing is deleted: it all goes into a backup folder.
      </p>
      {!asking ? (
        <button onClick={() => setAsking(true)} className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-foreground hover:border-red-400">
          <RotateCcw className="size-3.5" /> Start fresh
        </button>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground">Are you sure?</span>
          <button onClick={() => void go()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60">
            {busy && <Loader2 className="size-3.5 animate-spin" />} Yes, start fresh
          </button>
          <button onClick={() => setAsking(false)} disabled={busy} className="rounded-full px-3 py-2 text-sm text-muted">
            Keep everything
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  );
}

export function ResumeView() {
  const [md, setMd] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [model, setModel] = useState<Model | null>(null);
  const [ask, setAsk] = useState("");
  const [proposal, setProposal] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () =>
    fetch("/api/cv")
      .then((r) => r.json())
      .then((d) => setMd(d.exists ? String(d.content || "") : ""))
      .catch(() => setMd(""));
  useEffect(() => {
    void load();
  }, []);

  const save = async (content: string) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/cv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }) });
      if (!r.ok) throw new Error();
      setMd(content);
      setMode("view");
      setProposal("");
      setAsk("");
      setMsg("Saved.");
    } catch {
      setMsg("Couldn't save. Try again.");
    }
    setBusy(false);
  };

  const requestChange = async () => {
    if (!ask.trim()) return;
    setBusy(true);
    setMsg("");
    setProposal("");
    try {
      const r = await fetch("/api/jobdesk/cv-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: ask, content: md }),
      });
      const d = await r.json();
      if (d.content) setProposal(d.content);
      else setMsg(d.error || "That didn't work. Try again.");
    } catch {
      setMsg("That didn't work. Try again.");
    }
    setBusy(false);
  };

  const update = (fn: (m: Model) => void) =>
    setModel((m) => {
      if (!m) return m;
      const next: Model = JSON.parse(JSON.stringify(m));
      fn(next);
      return next;
    });

  if (md === null)
    return (
      <div className="mx-auto flex max-w-3xl items-center gap-2 px-6 py-16 text-muted">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 md:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className={`${instrumentSerif.className} text-4xl text-landing md:text-5xl`}>My resume</h1>
        {mode === "view" && md && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { setModel(parse(md)); setMode("edit"); setMsg(""); }} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm text-foreground hover:border-brand/50">
              <Pencil className="size-3.5" /> Edit
            </button>
            <button onClick={() => { setMode("ask"); setMsg(""); }} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm text-foreground hover:border-brand/50">
              <MessageSquare className="size-3.5" /> Ask for a change
            </button>
            <button onClick={() => { setMode("upload"); setMsg(""); }} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-sm text-foreground hover:border-brand/50">
              <Upload className="size-3.5" /> Replace my resume
            </button>
            <a href="/api/jobdesk/resume-pdf" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-2 text-sm font-medium text-brand-foreground">
              <Download className="size-3.5" /> Download PDF
            </a>
          </div>
        )}
      </div>
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}

      {mode === "view" &&
        (md ? (
          <div className="mt-6 rounded-2xl border border-border p-6 md:p-10">
            <Doc lines>{shown(md)}</Doc>
          </div>
        ) : (
          <div className="mt-6">
            <CvIngest />
          </div>
        ))}

      {mode === "view" && md && <StartFresh />}

      {mode === "upload" && (
        <div className="mt-6">
          <p className="mb-4 text-muted">
            Your new resume replaces this one. Then a few quick questions, and I&apos;ll look for fresh jobs that fit it. Your list and
            follow-ups stay.
          </p>
          <CvIngest />
          <button onClick={() => setMode("view")} className="mt-4 text-sm text-muted underline-offset-2 hover:underline">Cancel</button>
        </div>
      )}

      {mode === "ask" && (
        <div className="mt-6 rounded-2xl border border-border p-5">
          <label className="font-medium text-foreground" htmlFor="jd-ask">What should change?</label>
          <textarea id="jd-ask" value={ask} onChange={(e) => setAsk(e.target.value)} rows={3} className={`${box} mt-2`}
            placeholder="For example: add my new job as Marketing Lead at Acme since March 2025, or make my summary shorter." />
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {["Fix any typos", "Make my summary shorter and stronger", "Make the bullet points start with action verbs"].map((t) => (
              <button key={t} onClick={() => setAsk(t)} className="rounded-full border border-border px-2.5 py-1 text-muted hover:text-foreground">{t}</button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => void requestChange()} disabled={busy || !ask.trim()} className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50">
              {busy && <Loader2 className="size-4 animate-spin" />} {busy ? "Working on it… (up to a minute)" : "Show me the change"}
            </button>
            <button onClick={() => { setMode("view"); setProposal(""); }} className="rounded-full px-4 py-2 text-sm text-muted">Cancel</button>
          </div>
          {proposal && (
            <div className="mt-6">
              <p className="font-medium text-foreground">Here&apos;s your resume with that change. Keep it?</p>
              <div className="mt-3 max-h-[60vh] overflow-y-auto rounded-xl border border-border p-5">
                <Doc lines>{shown(proposal)}</Doc>
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => void save(proposal)} disabled={busy} className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white">Save this version</button>
                <button onClick={() => setProposal("")} className="rounded-full border border-border px-4 py-2 text-sm text-foreground">No, discard it</button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "edit" && model && (
        <div className="mt-6 space-y-5">
          <div className="rounded-2xl border border-border p-5">
            <label className="text-sm text-muted">Your name</label>
            <input value={model.name} onChange={(e) => update((m) => { m.name = e.target.value; })} className={`${box} mt-1 text-lg`} />
            <label className="mt-4 block text-sm text-muted">Contact details (one per line)</label>
            <textarea value={model.header} rows={rowsFor(model.header)} onChange={(e) => update((m) => { m.header = e.target.value; })} className={`${box} mt-1`} />
          </div>
          {model.sections.map((s, si) => (
            <div key={si} className="rounded-2xl border border-border p-5">
              <input value={s.title} onChange={(e) => update((m) => { m.sections[si].title = e.target.value; })}
                className="w-full bg-transparent text-sm font-semibold uppercase tracking-[0.08em] text-foreground outline-none" />
              {(s.intro || !s.entries.length) && (
                <textarea value={s.intro} rows={rowsFor(s.intro)} onChange={(e) => update((m) => { m.sections[si].intro = e.target.value; })} className={`${box} mt-3`} />
              )}
              {s.entries.map((e, ei) => (
                <div key={ei} className="mt-4 rounded-xl bg-surface/50 p-4">
                  <div className="flex items-center gap-2">
                    <input value={e.heading} placeholder="Company or school" onChange={(ev) => update((m) => { m.sections[si].entries[ei].heading = ev.target.value; })}
                      className={`${box} font-medium`} />
                    <button onClick={() => update((m) => { m.sections[si].entries.splice(ei, 1); })} title="Remove" className="rounded-md p-2 text-faint hover:text-red-500">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <textarea value={e.body} rows={rowsFor(e.body)} placeholder={"Job title, dates\n• What you did"}
                    onChange={(ev) => update((m) => { m.sections[si].entries[ei].body = ev.target.value; })} className={`${box} mt-2`} />
                </div>
              ))}
              {s.entries.length > 0 && (
                <button onClick={() => update((m) => { m.sections[si].entries.push({ heading: "", body: "• ", original: "" }); })}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand">
                  <Plus className="size-4" /> Add another
                </button>
              )}
            </div>
          ))}
          <p className="text-sm text-muted">Start a line with • to make it a bullet point.</p>
          <div className="sticky bottom-0 flex gap-2 border-t border-border py-4" style={{ background: "var(--bg)" }}>
            <button onClick={() => model && void save(serialize(model))} disabled={busy} className="rounded-full bg-brand px-5 py-2 font-medium text-brand-foreground">
              {busy ? "Saving…" : "Save my resume"}
            </button>
            <button onClick={() => setMode("view")} className="inline-flex items-center gap-1 rounded-full px-4 py-2 text-muted">
              <X className="size-4" /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
