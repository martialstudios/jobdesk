"use client";

// JobDesk branded builds: after the real form is filled in her Chrome window,
// she looks it over there and approves it here. "Approve & submit" asks once
// more, then the app presses the form's own Submit (/api/jobdesk/submit) and
// says what the page answered. Sent: the job is marked applied (My list, the
// tracker) and the first one gets its celebration. Not sent: what to fix, and
// she can always press Submit in Chrome herself and Mark applied.
//
// Questions the form still has empty get a box here: what she types goes into
// the form when she sends it (and into My info for next time). A job site that
// emails a security code gets a box for that too.
//
// Mounted for the whole Apply page, not just while the fill is "done": a fill
// whose fields didn't land hands the form to the AI for a moment ("done",
// then filling again), and a panel that came and went with it would lose the
// confirm she'd just opened. It shows once this form is filled, and its
// button waits while anything is still filling.

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Send } from "lucide-react";
import { useApply } from "@/components/apply/apply-provider";
import { CheerToast } from "./cheer";
import { CopyPanel } from "./copy-panel";

type Result = { ok: boolean; message: string; reason?: string; errors?: string[] };

export function ApproveSubmit() {
  const a = useApply();
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [cheer, setCheer] = useState<{ at: number; first: boolean } | null>(null);
  const [extra, setExtra] = useState<Record<string, string>>({});
  const [code, setCode] = useState("");
  // A new form starts fresh.
  const session = a.getSessionId();
  const [seenFill, setSeenFill] = useState(false);
  useEffect(() => {
    setConfirming(false);
    setResult(null);
    setCheer(null);
    setSeenFill(false);
    setExtra({});
    setCode("");
  }, [session]);
  useEffect(() => {
    if (a.status === "done") setSeenFill(true);
  }, [a.status]);
  const ready = a.status === "done";
  const empty = a.fields.filter((f) => f.required && f.type !== "file" && f.type !== "checkbox" && !(a.answers[f.id] || "").trim());
  const stillEmpty = empty.filter((f) => !(extra[f.id] || "").trim());
  const askingCode = result?.reason === "code";

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const listBefore = await fetch("/api/jobdesk/list").then((r) => r.json()).catch(() => ({ items: [] }));
      const r = await fetch("/api/jobdesk/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: a.getSessionId(),
          confirm: true,
          extra,
          fields: a.fields,
          company: a.company,
          code: askingCode ? code : undefined,
        }),
      });
      const d = (await r.json()) as Result;
      setResult(d);
      // Asked for a code (again): an empty box for the new one.
      if (d.reason === "code") setCode("");
      if (d.ok) {
        const first = !(listBefore.items || []).some((i: { status?: string }) => i.status === "applied");
        // Opened from a pasted link, it isn't on her list yet: add it, then mark it.
        await fetch("/api/jobdesk/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ add: [{ url: a.url, title: a.title, company: a.company }] }),
        }).catch(() => {});
        await fetch("/api/jobdesk/list", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: a.url, status: "applied" }),
        }).catch(() => {});
        if (a.n) {
          void fetch("/api/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ n: a.n, status: "Applied" }),
          }).catch(() => {});
        }
        setCheer({ at: Date.now(), first });
      }
    } catch {
      setResult({ ok: false, message: "Couldn't reach the form. Check the Chrome window; if it was sent, press Mark applied." });
    } finally {
      setSending(false);
      setConfirming(false);
    }
  };

  if (!session || (!seenFill && !result)) return null;

  // The site's spam check turned the app's send down: she sends it from her Chrome.
  if (result?.reason === "flagged") {
    return (
      <CopyPanel
        url={a.url}
        company={a.company}
        n={a.n || undefined}
        fields={a.fields}
        answers={{ ...a.answers, ...extra }}
        intro={result.message}
      />
    );
  }

  if (result?.ok) {
    return (
      <div className="co-rise mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
        {cheer && <CheerToast at={cheer.at} first={cheer.first} />}
        <p className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="size-5" /> Sent! It&apos;s in your Follow-ups now.
        </p>
        <p className="mt-1 text-muted">The page said: &ldquo;{result.message}&rdquo;</p>
      </div>
    );
  }

  return (
    <div className="co-rise mt-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-4 text-sm">
      <p className="font-medium text-foreground">Look it over in the Chrome window. When it&apos;s right, send it from here.</p>
      {empty.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <p className="flex items-start gap-1.5 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            The form still needs {empty.length === 1 ? "this" : "these"}. Answer here and it goes into the form when you send it (and into My info for next time).
          </p>
          {empty.map((f) => (
            <label key={f.id} className="mt-2 block">
              <span className="text-foreground">{f.label.replace(/\s*\*\s*$/, "")}</span>
              {f.options?.length ? (
                <select
                  value={extra[f.id] || ""}
                  onChange={(e) => setExtra({ ...extra, [f.id]: e.target.value })}
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
                  value={extra[f.id] || ""}
                  onChange={(e) => setExtra({ ...extra, [f.id]: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-foreground outline-none focus:border-brand/60"
                />
              )}
            </label>
          ))}
        </div>
      )}
      {askingCode && (
        <label className="mt-3 block rounded-lg border border-brand/40 bg-brand/5 p-3">
          <span className="text-foreground">Security code from the email</span>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            autoFocus
            inputMode="text"
            className="mt-1 w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 font-mono tracking-widest text-foreground outline-none focus:border-brand/60"
          />
        </label>
      )}
      {result && !result.ok && !askingCode && (
        <div className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
          <p>{result.message}</p>
          {result.errors && result.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {result.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {askingCode && <p className="mt-2 text-amber-800 dark:text-amber-200">{result?.message}</p>}
      {askingCode ? (
        <button
          onClick={() => void send()}
          disabled={sending || !ready || code.length < 4}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {sending ? "Sending…" : "Enter the code & send"}
        </button>
      ) : !confirming ? (
        <button
          onClick={() => setConfirming(true)}
          disabled={sending || !ready || stillEmpty.length > 0}
          className="mt-3 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          <Send className="size-4" /> {!ready ? "Still filling…" : stillEmpty.length ? `Answer ${stillEmpty.length} more to send` : "Approve & submit"}
        </button>
      ) : (
        <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3">
          <p className="font-medium text-foreground">
            Send your application{a.company ? ` to ${a.company}` : ""}? This submits it for real.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => void send()}
              disabled={sending || !ready}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {sending ? "Sending…" : "Yes, send it"}
            </button>
            <button onClick={() => setConfirming(false)} disabled={sending} className="rounded-full border border-border px-4 py-2 text-muted hover:text-foreground">
              Not yet
            </button>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-faint">Or press Submit yourself in Chrome, then Mark applied below.</p>
    </div>
  );
}
