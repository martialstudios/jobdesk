"use client";

// JobDesk branded builds: "Dreaming of something different?" on the questions
// page. Their dream job in their own words, a few tap-to-answer follow-ups,
// then the way in: the jobs to search now (handed to the page as roles), what
// already carries over, and what would make them stand out.

import { useState } from "react";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import type { DreamAsk, DreamGoal, DreamPlan } from "@/lib/jobdesk/dream";

const box = "w-full rounded-xl border border-border bg-transparent px-3 py-2 text-foreground outline-none focus:border-brand/60";

type Stage =
  | { kind: "idle" }
  | { kind: "thinking"; line: string }
  | { kind: "questions"; ask: DreamAsk }
  | { kind: "plan"; plan: DreamPlan };

async function post(body: object) {
  const r = await fetch("/api/jobdesk/dream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.error) throw new Error(d.error || "That didn't work this time. Try again.");
  return d;
}

export function DreamCard({ goal, onPlan, big = false }: { goal: DreamGoal | null; onPlan: (plan: DreamPlan | null) => void; big?: boolean }) {
  const [dream, setDream] = useState(goal?.dream || "");
  const [stage, setStage] = useState<Stage>(goal ? { kind: "plan", plan: goal.plan } : { kind: "idle" });
  const [picked, setPicked] = useState<Record<number, string[]>>({});
  const [other, setOther] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  const start = async () => {
    if (!dream.trim()) return;
    setError("");
    setPicked({});
    setOther({});
    setStage({ kind: "thinking", line: "Thinking about your dream job…" });
    try {
      setStage({ kind: "questions", ask: (await post({ step: "ask", dream })) as DreamAsk });
    } catch (e) {
      setError((e as Error).message);
      setStage({ kind: "idle" });
    }
  };

  const finish = async (ask: DreamAsk) => {
    const answers = ask.questions
      .map((q, i) => ({ q: q.q, a: [...(picked[i] || []), other[i]?.trim()].filter(Boolean).join("; ") }))
      .filter((x) => x.a);
    setError("");
    setStage({ kind: "thinking", line: "Finding the jobs that lead there…" });
    try {
      const { plan } = (await post({ step: "plan", dream, answers })) as { plan: DreamPlan };
      setStage({ kind: "plan", plan });
      onPlan(plan);
    } catch (e) {
      setError((e as Error).message);
      setStage({ kind: "questions", ask });
    }
  };

  const reset = () => {
    void post({ step: "clear" }).catch(() => {});
    setStage({ kind: "idle" });
    onPlan(null);
  };

  const toggle = (i: number, option: string, multi: boolean) =>
    setPicked((p) => {
      const have = p[i] || [];
      const next = have.includes(option) ? have.filter((x) => x !== option) : multi ? [...have, option] : [option];
      return { ...p, [i]: next };
    });

  return (
    <section className="mt-8 rounded-2xl border border-brand/30 bg-brand/5 p-5">
      <h2 className="flex items-center gap-2 font-medium text-foreground">
        <Sparkles className="size-4 text-brand" /> {big ? "Your dream job" : "Dreaming of something different?"}
      </h2>

      {stage.kind === "idle" && (
        <>
          {!big && (
            <p className="mt-1 text-sm text-muted">
              Your resume doesn&apos;t have to show it yet. Tell me the job you&apos;d love, and I&apos;ll work out the jobs that get you there.
            </p>
          )}
          <textarea value={dream} onChange={(e) => setDream(e.target.value)} rows={big ? 3 : 2} autoFocus={big}
            placeholder="Like: working in book publishing, or designing apps" className={`${box} mt-3 resize-none`} />
          <button onClick={() => void start()} disabled={!dream.trim()}
            className="mt-3 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-200 disabled:opacity-50">
            Help me get there <ArrowRight className="size-4" />
          </button>
        </>
      )}

      {stage.kind === "thinking" && (
        <p className="mt-3 flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" /> {stage.line} <span className="text-faint">(about 20 seconds)</span>
        </p>
      )}

      {stage.kind === "questions" && (
        <div className="mt-2">
          {stage.ask.heard && <p className="text-foreground">{stage.ask.heard}</p>}
          <p className="mt-1 text-sm text-muted">A few quick questions so I search for the right things. Skip any you like.</p>
          {stage.ask.questions.map((q, i) => (
            <div key={i} className="mt-5">
              <p className="font-medium text-foreground">{q.q}</p>
              {q.multi && <p className="text-xs text-faint">Pick as many as you like.</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                {q.options.map((o) => {
                  const on = (picked[i] || []).includes(o);
                  return (
                    <button key={o} onClick={() => toggle(i, o, q.multi)}
                      className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-brand bg-brand text-brand-foreground" : "border-border text-foreground hover:border-brand/50"}`}>
                      {o}
                    </button>
                  );
                })}
              </div>
              <input value={other[i] || ""} onChange={(e) => setOther({ ...other, [i]: e.target.value })}
                placeholder="Or say it your way" className={`${box} mt-2 text-sm`} />
            </div>
          ))}
          <div className="mt-5 flex items-center gap-4">
            <button onClick={() => void finish(stage.ask)}
              className="inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand-200">
              Show me the way in <ArrowRight className="size-4" />
            </button>
            <button onClick={() => setStage({ kind: "idle" })} className="text-sm text-muted hover:text-foreground">Start over</button>
          </div>
        </div>
      )}

      {stage.kind === "plan" && (
        <div className="mt-2">
          {stage.plan.path && <p className="text-foreground">{stage.plan.path}</p>}
          <p className="mt-3 text-sm text-muted">
            {big
              ? "Next, I'll show you the jobs that lead there, and you can add or remove any."
              : <>I&apos;ve put the jobs that lead there under &ldquo;What kinds of jobs?&rdquo; below. Add or remove any.</>}
          </p>
          {stage.plan.carryOver.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-foreground">What you already bring</h3>
              <ul className="mt-2 space-y-1.5">
                {stage.plan.carryOver.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground"><span className="text-emerald-600">✓</span> {c}</li>
                ))}
              </ul>
            </>
          )}
          {stage.plan.tips.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-foreground">To stand out</h3>
              <ul className="mt-2 space-y-1.5">
                {stage.plan.tips.map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm text-foreground"><span className="text-brand">→</span> {t}</li>
                ))}
              </ul>
            </>
          )}
          <button onClick={reset} className="mt-4 text-sm text-muted underline-offset-2 hover:text-foreground hover:underline">
            Change my dream job
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </section>
  );
}
