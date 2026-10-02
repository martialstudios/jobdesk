"use client";

// JobDesk branded builds: Follow-ups. Every job they've applied to, and when to
// nudge: a week after applying, then a week after each follow-up (two at
// most, then it's fine to move on). A follow-up email drafted from the job and
// their resume, to copy or open in their mail app (nothing is ever sent from
// here); "I followed up"; what happened (interview, offer, didn't get it);
// notes. Built on My list; a scored job's tracker row gets the outcome too.

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Bell, Check, ChevronDown, Copy, ExternalLink, Loader2, Mail, PartyPopper, X } from "lucide-react";
import { instrumentSerif } from "@/lib/fonts";
import { useList, type ListItem } from "./use-list";

const DAY = 86_400_000;
const WAIT_DAYS = 7;
const MAX_FOLLOW_UPS = 2;

type Plan = { stage: "due" | "waiting" | "quiet" | "heard" | "closed"; due: number; last: number };

export function planFor(i: ListItem, now = Date.now()): Plan {
  const applied = i.appliedAt ?? i.addedAt;
  const last = Math.max(applied, ...(i.followUps ?? []));
  const due = i.nextAt ?? last + WAIT_DAYS * DAY;
  if (i.outcome === "interview" || i.outcome === "offer") return { stage: "heard", due, last };
  if (i.outcome === "rejected") return { stage: "closed", due, last };
  if ((i.followUps?.length ?? 0) >= MAX_FOLLOW_UPS && now >= due) return { stage: "quiet", due, last };
  return { stage: now >= due ? "due" : "waiting", due, last };
}

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
function ago(t: number) {
  const d = Math.floor((Date.now() - t) / DAY);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}
function inDays(t: number) {
  const d = Math.ceil((t - Date.now()) / DAY);
  return d <= 1 ? "tomorrow" : `in ${d} days (${day(t)})`;
}

const OUTCOMES: { key: NonNullable<ListItem["outcome"]>; label: string }[] = [
  { key: "interview", label: "Got an interview" },
  { key: "offer", label: "Got an offer" },
  { key: "rejected", label: "Didn't get it" },
];

// career-ops's tracker states, for a job that was scored.
const TRACKER: Record<string, string> = { interview: "Interview", offer: "Offer", rejected: "Rejected", waiting: "Applied" };

type Order = "newest" | "oldest" | "company" | "next";
type Status = "waiting" | "interview" | "offer" | "rejected";
const ORDERS: { key: Order; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "next", label: "Next follow-up" },
  { key: "company", label: "Company A–Z" },
];
const STATUS_LABEL: Record<Status, string> = { waiting: "Waiting", interview: "Interview", offer: "Offer", rejected: "Didn't get it" };
const statusOf = (i: ListItem): Status => (i.outcome && i.outcome !== "waiting" ? i.outcome : "waiting");
const STATUS_STYLE: Record<Status, string> = {
  waiting: "bg-surface text-muted",
  interview: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  offer: "bg-emerald-600 text-white",
  rejected: "bg-surface text-faint line-through",
};

type Draft = { url: string; subject: string; body: string } | { url: string; loading: true } | { url: string; error: string };

export function FollowUpsView() {
  const { items, loaded, update } = useList(15000);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notesOpen, setNotesOpen] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [showClosed, setShowClosed] = useState(false);
  const [view, setView] = useState<"next" | "all">("next");
  const [order, setOrder] = useState<Order>("newest");
  const [only, setOnly] = useState<Status | "all">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Notes save a moment after they stop typing.
  const noteTimers = useRef<Record<string, number>>({});
  const saveNote = (url: string, text: string) => {
    setNotes((n) => ({ ...n, [url]: text }));
    window.clearTimeout(noteTimers.current[url]);
    noteTimers.current[url] = window.setTimeout(() => void update(url, { notes: text }), 500);
  };

  const applied = useMemo(
    () => items.filter((i) => i.status === "applied").sort((a, b) => planFor(a).due - planFor(b).due),
    [items],
  );
  const group = (s: Plan["stage"][]) => applied.filter((i) => s.includes(planFor(i).stage));
  const due = group(["due"]);
  const waiting = group(["waiting"]);
  const quiet = group(["quiet"]);
  const heard = group(["heard"]);
  const closed = group(["closed"]);

  const setOutcome = async (i: ListItem, outcome: NonNullable<ListItem["outcome"]>) => {
    await update(i.url, { outcome });
    if (i.n) {
      void fetch("/api/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ n: i.n, status: TRACKER[outcome] }),
      }).catch(() => {});
    }
  };

  const write = async (i: ListItem) => {
    setCopied(false);
    setDraft({ url: i.url, loading: true });
    try {
      const r = await fetch("/api/jobdesk/followup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: i.url }),
      });
      const d = await r.json();
      setDraft(d.error ? { url: i.url, error: d.error } : { url: i.url, subject: d.subject, body: d.body });
    } catch {
      setDraft({ url: i.url, error: "That didn't work this time. Try again." });
    }
  };

  const card = (i: ListItem) => {
    const plan = planFor(i);
    const n = i.followUps?.length ?? 0;
    const open = notesOpen.has(i.url);
    const d = draft && draft.url === i.url ? draft : null;
    return (
      <li key={i.url} className="rounded-2xl border border-border p-5" style={{ background: "var(--bg)" }}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-foreground">{i.title}</div>
            <div className="text-sm text-muted">{[i.company, i.location].filter(Boolean).join(" · ")}</div>
            <div className="mt-1 text-sm text-faint">
              Applied {i.appliedAt ? `${day(i.appliedAt)}, ${ago(i.appliedAt)}` : "recently"}
              {n > 0 && ` · followed up ${n === 1 ? "once" : "twice"} (last ${day(Math.max(...(i.followUps ?? [0])))})`}
            </div>
          </div>
          <a href={i.url} target="_blank" rel="noreferrer" title="Open the job posting" className="shrink-0 rounded-md p-1.5 text-faint hover:text-foreground">
            <ExternalLink className="size-4" />
          </a>
        </div>

        <p className="mt-3 text-sm text-foreground">
          {plan.stage === "due" &&
            (n === 0
              ? "It's been a week: a short, friendly email now puts you back on their radar."
              : "Still quiet. One more gentle nudge is fine.")}
          {plan.stage === "waiting" && `Give them time. Follow up ${inDays(plan.due)}.`}
          {plan.stage === "quiet" && "No reply after two follow-ups. It's okay to move on; you can still update it if they write back."}
          {plan.stage === "heard" && (i.outcome === "offer" ? "An offer! 🎉" : "An interview! 🎉 Well done.")}
          {plan.stage === "closed" && "Not this one. On to the next."}
        </p>

        {(plan.stage === "due" || plan.stage === "waiting" || plan.stage === "quiet") && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void write(i)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm ${plan.stage === "due" ? "bg-brand font-medium text-brand-foreground hover:bg-brand-200" : "border border-border text-foreground hover:border-brand/50"}`}
            >
              <Mail className="size-4" /> Write a follow-up email
            </button>
            <button onClick={() => void update(i.url, { followedUp: true })} className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-foreground hover:border-brand/50">
              <Check className="size-4" /> I followed up
            </button>
            {plan.stage === "due" && (
              <button onClick={() => void update(i.url, { nextAt: Date.now() + 3 * DAY })} className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm text-muted hover:text-foreground">
                <Bell className="size-4" /> Remind me in 3 days
              </button>
            )}
          </div>
        )}

        {d && "loading" in d && (
          <p className="mt-3 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" /> Writing it… (about 10 seconds)
          </p>
        )}
        {d && "error" in d && <p className="mt-3 text-sm text-red-600">{d.error}</p>}
        {d && "body" in d && (
          <div className="mt-3 rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-muted">
                Subject: <span className="text-foreground">{d.subject}</span>
              </div>
              <button onClick={() => setDraft(null)} aria-label="Close" className="rounded-md p-1 text-faint hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <textarea
              value={d.body}
              onChange={(e) => setDraft({ ...d, body: e.target.value })}
              rows={9}
              className="mt-2 w-full resize-y rounded-lg border border-border bg-transparent p-3 text-sm text-foreground outline-none focus:border-brand/60"
            />
            <p className="mt-1 text-xs text-faint">Edit anything you like. Send it to the recruiter or the hiring contact if you have one.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  void navigator.clipboard?.writeText(`${d.subject}\n\n${d.body}`).then(() => setCopied(true));
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-foreground hover:border-brand/50"
              >
                <Copy className="size-4" /> {copied ? "Copied" : "Copy"}
              </button>
              <a
                href={`mailto:?subject=${encodeURIComponent(d.subject)}&body=${encodeURIComponent(d.body)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm text-foreground hover:border-brand/50"
              >
                <Mail className="size-4" /> Open in Mail
              </a>
              <button
                onClick={() => {
                  void update(i.url, { followedUp: true });
                  setDraft(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-200"
              >
                <Check className="size-4" /> I sent it
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-sm">
          <span className="mr-1 text-faint">Heard back?</span>
          {OUTCOMES.map((o) => (
            <button
              key={o.key}
              onClick={() => void setOutcome(i, i.outcome === o.key ? "waiting" : o.key)}
              className={`rounded-full px-3 py-1 ${i.outcome === o.key ? (o.key === "rejected" ? "bg-surface text-foreground" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300") : "border border-border text-muted hover:text-foreground"}`}
            >
              {o.label}
            </button>
          ))}
          <button
            onClick={() =>
              setNotesOpen((s) => {
                const next = new Set(s);
                if (next.has(i.url)) next.delete(i.url);
                else next.add(i.url);
                return next;
              })
            }
            className="ml-auto inline-flex items-center gap-1 text-muted hover:text-foreground"
          >
            Notes{i.notes ? " ✎" : ""} <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
        {open && (
          <textarea
            value={notes[i.url] ?? i.notes ?? ""}
            onChange={(e) => saveNote(i.url, e.target.value)}
            rows={3}
            placeholder="Who you talked to, interview dates, what's next…"
            className="mt-2 w-full resize-y rounded-lg border border-border bg-transparent p-3 text-sm text-foreground outline-none focus:border-brand/60"
          />
        )}
      </li>
    );
  };

  // "All applications": one list, in the order they choose, by status.
  const counts = useMemo(() => {
    const c: Record<Status | "all", number> = { all: applied.length, waiting: 0, interview: 0, offer: 0, rejected: 0 };
    for (const i of applied) c[statusOf(i)]++;
    return c;
  }, [applied]);
  const everything = useMemo(() => {
    const at = (i: ListItem) => i.appliedAt ?? i.addedAt;
    const list = applied.filter((i) => only === "all" || statusOf(i) === only);
    return [...list].sort((a, b) =>
      order === "newest" ? at(b) - at(a)
      : order === "oldest" ? at(a) - at(b)
      : order === "company" ? a.company.localeCompare(b.company) || at(b) - at(a)
      : planFor(a).due - planFor(b).due,
    );
  }, [applied, order, only]);

  const allView = (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["all", "waiting", "interview", "offer", "rejected"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setOnly(k)}
            className={`rounded-full px-3 py-1 text-sm ${only === k ? "bg-brand text-brand-foreground" : "border border-border text-muted hover:text-foreground"}`}
          >
            {k === "all" ? "All" : STATUS_LABEL[k]} <span className="opacity-70">{counts[k]}</span>
          </button>
        ))}
        <select
          value={order}
          onChange={(e) => setOrder(e.target.value as Order)}
          aria-label="Order"
          className="ml-auto rounded-full border border-border bg-transparent px-3 py-1.5 text-sm text-foreground"
        >
          {ORDERS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>
      <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border" style={{ background: "var(--bg)" }}>
        {everything.map((i) => {
          const st = statusOf(i);
          const plan = planFor(i);
          const open = expanded === i.url;
          return (
            <li key={i.url}>
              <button onClick={() => setExpanded(open ? null : i.url)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface/60">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-foreground">{i.title}</div>
                  <div className="truncate text-sm text-muted">
                    {i.company} · applied {i.appliedAt ? day(i.appliedAt) : "recently"}
                    {(i.followUps?.length ?? 0) > 0 && ` · followed up ${i.followUps!.length}×`}
                  </div>
                </div>
                <div className="hidden shrink-0 text-right text-xs text-faint sm:block">
                  {st === "waiting" && (plan.stage === "due" ? "Follow up now" : plan.stage === "quiet" ? "Gone quiet" : `Follow up ${day(plan.due)}`)}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[st]}`}>{STATUS_LABEL[st]}</span>
                <ChevronDown className={`size-4 shrink-0 text-faint transition ${open ? "rotate-180" : ""}`} />
              </button>
              {open && <ul className="px-3 pb-3">{card(i)}</ul>}
            </li>
          );
        })}
        {everything.length === 0 && <li className="px-4 py-6 text-sm text-muted">None with this status.</li>}
      </ul>
    </section>
  );

  const section = (title: string, list: ListItem[], hint?: string) =>
    list.length > 0 && (
      <section className="mt-10">
        <h2 className="text-lg font-semibold text-foreground">
          {title} <span className="font-normal text-muted">({list.length})</span>
        </h2>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
        <ul className="mt-4 flex flex-col gap-3">{list.map(card)}</ul>
      </section>
    );

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 md:px-8">
      <h1 className={`${instrumentSerif.className} text-4xl text-landing md:text-5xl`}>Follow-ups</h1>
      <p className="mt-2 text-muted">Every job you&apos;ve applied to, and the right time to nudge them.</p>
      {applied.length > 0 && (
        <div className="mt-5 inline-flex rounded-full border border-border p-1 text-sm">
          {([["next", "By next step"], ["all", `All applications (${applied.length})`]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`rounded-full px-3.5 py-1.5 ${view === k ? "bg-brand text-brand-foreground" : "text-muted hover:text-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {view === "all" && applied.length > 0 && allView}

      {!loaded && (
        <p className="mt-8 flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}
      {loaded && applied.length === 0 && (
        <div className="mt-8 rounded-2xl border border-border p-6 text-foreground">
          Nothing here yet. When you apply to a job from{" "}
          <Link href="/my-list" className="text-brand underline-offset-2 hover:underline">My list</Link> (or press ✓ on one you applied to on their
          site), it shows up here with a reminder to follow up a week later.
        </div>
      )}

      {view === "next" && heard.length > 0 && (
        <div className="mt-8 flex items-center gap-2 rounded-2xl bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200">
          <PartyPopper className="size-5" /> {heard.length} heard back with good news. Keep going!
        </div>
      )}
      {view === "next" && section("Time to follow up", due, "A week has passed with no news.")}
      {view === "next" && section("Waiting to hear back", waiting)}
      {view === "next" && section("Heard back", heard)}
      {view === "next" && section("Gone quiet", quiet)}
      {view === "next" && closed.length > 0 && (
        <section className="mt-10">
          <button onClick={() => setShowClosed((v) => !v)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
            {showClosed ? "Hide" : "Show"} {closed.length} that didn&apos;t work out <ChevronDown className={`size-3.5 transition ${showClosed ? "rotate-180" : ""}`} />
          </button>
          {showClosed && <ul className="mt-4 flex flex-col gap-3">{closed.map(card)}</ul>}
        </section>
      )}
      {applied.length > 0 && (
        <Link href="/find" className="mt-12 inline-flex items-center gap-1.5 text-sm text-brand underline-offset-2 hover:underline">
          Find more jobs <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}
