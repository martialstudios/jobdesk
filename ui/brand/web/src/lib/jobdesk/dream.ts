// JobDesk branded builds: "Dreaming of something different?". Someone whose
// resume doesn't show the field they want (a bookseller who wants to work in
// marketing) gets a few follow-up questions about the dream job, then a plan:
// the job titles that are a realistic way in right now, what already carries
// over, and how those roles lead to the dream. The titles drive the job search
// (they're matched as text inside job titles), and the plan is kept so scoring
// and resume tailoring judge them as a career changer.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { careerOpsRoot } from "@/lib/career-ops";
import { resolveCli } from "@/lib/clis";

export type DreamQuestion = { q: string; options: string[]; multi: boolean };
export type DreamAsk = { heard: string; questions: DreamQuestion[] };
export type DreamPlan = {
  /** Titles to search now: entry-level ways in and bridge roles. */
  roles: string[];
  /** The dream role itself, searched too. */
  dream: string[];
  /** From the resume only: what already counts. */
  carryOver: string[];
  path: string;
  tips: string[];
  /** For whoever judges fit and tailors resumes later. */
  profile: string;
};
export type DreamAnswer = { q: string; a: string };
export type DreamGoal = { dream: string; answers: DreamAnswer[]; plan: DreamPlan; at: string };

const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const texts = (v: unknown, max: number, count: number) =>
  Array.isArray(v) ? Array.from(new Set(v.map((x) => text(x, max)).filter(Boolean))).slice(0, count) : [];

/** The JSON between <<<JSON and JSON>>> (or the first {...} as a fallback). */
export function extractJson(out: string): unknown {
  const fenced = /<<<JSON\s*([\s\S]*?)\s*JSON>>>/.exec(out)?.[1];
  const raw = fenced ?? out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  try {
    return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    return null;
  }
}

export function cleanAsk(raw: unknown): DreamAsk | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const questions = (Array.isArray(o.questions) ? o.questions : [])
    .map((x): DreamQuestion | null => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const q = text(r.q, 200);
      const options = texts(r.options, 60, 6);
      return q && options.length >= 2 ? { q, options, multi: r.multi === true } : null;
    })
    .filter((x): x is DreamQuestion => x !== null)
    .slice(0, 4);
  return questions.length ? { heard: text(o.heard, 300), questions } : null;
}

// A search phrase is matched as text inside job titles: short, no punctuation
// that would never appear in one, no "+" (the scanner reads it as AND).
const title = (s: string) => s.replace(/[^\p{L}\p{N} &/'-]/gu, " ").replace(/\s+/g, " ").trim();

export function cleanPlan(raw: unknown): DreamPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const titles = (v: unknown, count: number) =>
    texts(v, 40, count * 2)
      .map(title)
      .filter((t) => t.length >= 2 && t.split(" ").length <= 4)
      .slice(0, count);
  const roles = titles(o.roles, 8);
  const dream = titles(o.dream, 3).filter((d) => !roles.some((r) => r.toLowerCase() === d.toLowerCase()));
  if (!roles.length && !dream.length) return null;
  return {
    roles,
    dream,
    carryOver: texts(o.carryOver, 120, 5),
    path: text(o.path, 600),
    tips: texts(o.tips, 200, 3),
    profile: text(o.profile, 800),
  };
}

function goalFile() {
  return path.join(/* turbopackIgnore: true */ careerOpsRoot(), ".career-ops-web", "jobdesk-goal.json");
}

export function readGoal(): DreamGoal | null {
  try {
    const g = JSON.parse(fs.readFileSync(goalFile(), "utf8")) as DreamGoal;
    const plan = cleanPlan(g.plan);
    return plan && typeof g.dream === "string" ? { ...g, plan } : null;
  } catch {
    return null;
  }
}

export function writeGoal(goal: DreamGoal | null) {
  const file = goalFile();
  if (!goal) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(goal, null, 2));
}

export function readResume(): string {
  try {
    return fs.readFileSync(path.join(/* turbopackIgnore: true */ careerOpsRoot(), "cv.md"), "utf8").slice(0, 20000);
  } catch {
    return "";
  }
}

/** One answer from the bundled Claude, no tools, no files. */
export async function ask(prompt: string, timeoutMs = 120_000): Promise<string> {
  const cli = resolveCli("claude");
  if (!cli) throw new Error("Claude isn't set up.");
  return new Promise((resolve) => {
    const child = spawn(cli.binPath, ["-p", prompt, "--output-format", "text"], {
      cwd: os.tmpdir(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out);
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
  });
}

const COACH = [
  "You are a warm, practical career coach inside a job-search app for someone who isn't technical.",
  "Many people want a job in a field their resume doesn't show yet. That's normal: your job is to find",
  "a realistic way in from where they are now. Plain, friendly words; no jargon, no file names.",
];

export function askPrompt(dream: string, resume: string): string {
  return [
    ...COACH,
    "",
    `Their dream job, in their words: ${dream}`,
    "",
    "Ask 2 to 4 short follow-up questions whose answers would most change WHICH job titles to search",
    "for: which part of the field excites them, whether they'd start in an assistant, coordinator or",
    "entry-level role, what kind of workplace, whether a bridge role that uses what they do now would",
    "be fine as a first step. Don't ask about location, remote work or salary; that's asked elsewhere.",
    "Each question gets 3 to 5 short tappable answers (at most 6 words each). Set multi to true when",
    "picking several answers makes sense.",
    "Also write heard: one encouraging sentence (at most 25 words) saying their dream back in your words.",
    "",
    "Reply with ONLY this JSON between the lines <<<JSON and JSON>>>:",
    '{"heard": "...", "questions": [{"q": "...", "options": ["...", "..."], "multi": false}]}',
    "",
    resume ? `Their resume:\n${resume}` : "They haven't added a resume.",
  ].join("\n");
}

export function planPrompt(dream: string, answers: DreamAnswer[], resume: string): string {
  return [
    ...COACH,
    "",
    `Their dream job, in their words: ${dream}`,
    ...(answers.length ? ["", "What they told you:", ...answers.map((x) => `- ${x.q} ${x.a}`)] : []),
    "",
    "Work out the most realistic path from their experience to the dream job, and what to search now.",
    "- roles: 4 to 8 job titles they could realistically be hired for NOW with this resume: entry-level,",
    "  assistant or coordinator roles in the dream field, plus bridge roles that use what they already do.",
    "  The search matches each as text inside job titles, so write each as 1 to 3 words exactly as it",
    "  appears in real postings (like \"Marketing Coordinator\" or \"Content Assistant\"). No Senior, Lead,",
    "  Manager or Director unless the resume clearly supports it.",
    "- dream: 1 to 3 short titles for the dream role itself, to search too.",
    "- carryOver: 3 to 5 short phrases for what in their resume carries over to the dream field. Only",
    "  what the resume actually shows; never invent. Empty if there's no resume.",
    "- path: 2 or 3 warm, concrete sentences, speaking to them as \"you\": how these roles lead to the dream.",
    "- tips: 2 or 3 specific, cheap or free things that would make their applications stronger",
    "  (a short course, a small portfolio piece, a volunteer project).",
    "- profile: 2 or 3 factual sentences in the third person, for the assistant that will judge job fit",
    "  and tailor their resume: the dream, the roles they're targeting now, and that they're changing",
    "  careers, so transferable skills and potential count more than direct experience.",
    "",
    "Reply with ONLY this JSON between the lines <<<JSON and JSON>>>:",
    '{"roles": [], "dream": [], "carryOver": [], "path": "", "tips": [], "profile": ""}',
    "",
    resume ? `Their resume:\n${resume}` : "They haven't added a resume.",
  ].join("\n");
}
