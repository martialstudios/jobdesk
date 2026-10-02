// JobDesk branded builds: a quick read of each job in Find jobs, so a list of
// titles becomes something you can choose from. The posting's own text comes
// from its job board's public API (career-ops's fetch-jd.mjs: Greenhouse,
// Lever, Ashby, Workday); a small, fast model turns a few at a time into a
// one-line summary, what you'd do, what they want, level, pay and place, and
// a line on how it fits this person. Never from the title alone: a posting
// that can't be read gets no summary rather than a guess. Kept per job.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";
import { resolveCli } from "@/lib/clis";
import { extractJson } from "./dream";

export type Synopsis = {
  summary: string;
  doing: string[];
  wants: string[];
  level: string;
  type: string;
  where: string;
  pay: string;
  fit: string;
};
export type SynopsisJob = { url: string; title: string; company: string; location?: string };
/** null: the posting couldn't be read. */
export type SynopsisResult = Synopsis | null;

// Small and quick: a summary per job, not a judgment.
const MODEL = "claude-haiku-4-5";

// Over the limit: cut at a word, with an ellipsis, never mid-word.
const text = (v: unknown, max: number) => {
  if (typeof v !== "string") return "";
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > max / 2 ? cut.lastIndexOf(" ") : max).replace(/[,;:.\s]+$/, "")}…`;
};
const texts = (v: unknown, max: number, count: number) =>
  Array.isArray(v) ? v.map((x) => text(x, max)).filter(Boolean).slice(0, count) : [];

export function cleanSynopsis(raw: unknown): Synopsis | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const summary = text(o.summary, 240);
  if (!summary) return null;
  const known = (v: unknown) => {
    const t = text(v, 60);
    return /^(unclear|unknown|n\/?a|not stated|none)$/i.test(t) ? "" : t;
  };
  return {
    summary,
    doing: texts(o.doing, 160, 3),
    wants: texts(o.wants, 160, 3),
    level: known(o.level),
    type: known(o.type),
    where: known(o.where),
    pay: known(o.pay),
    fit: text(o.fit, 320),
  };
}

function cacheFile(url: string) {
  const id = crypto.createHash("sha1").update(url).digest("hex").slice(0, 20);
  return path.join(/* turbopackIgnore: true */ careerOpsRoot(), ".career-ops-web", "jobdesk-synopsis", `${id}.json`);
}

export function readCached(url: string): { result: SynopsisResult } | undefined {
  try {
    const d = JSON.parse(fs.readFileSync(cacheFile(url), "utf8"));
    // An unreadable posting is retried after a day; a summary is kept.
    if (d.result === null && Date.now() - Date.parse(d.at) > 86_400_000) return undefined;
    return { result: d.result === null ? null : cleanSynopsis(d.result) };
  } catch {
    return undefined;
  }
}

function writeCached(url: string, result: SynopsisResult) {
  const file = cacheFile(url);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ url, at: new Date().toISOString(), result }));
}

function run(bin: string, args: string[], opts: { cwd: string; timeoutMs: number; env?: NodeJS.ProcessEnv }): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(bin, args, { cwd: opts.cwd, env: opts.env ?? process.env, stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs);
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

/** The posting's text from its job board's API, or "" when it can't be read. */
export async function fetchPosting(url: string): Promise<string> {
  const script = rootScript("fetch-jd");
  if (!fs.existsSync(script)) return "";
  const out = await run(process.execPath, [script, url], { cwd: path.dirname(script), timeoutMs: 25_000 });
  return out.trim().slice(0, 7000);
}

function about(): string {
  const root = careerOpsRoot();
  let cv = "";
  try {
    cv = fs.readFileSync(path.join(/* turbopackIgnore: true */ root, "cv.md"), "utf8").slice(0, 3000);
  } catch {
    cv = "";
  }
  let goal = "";
  try {
    const g = JSON.parse(fs.readFileSync(path.join(/* turbopackIgnore: true */ root, ".career-ops-web", "jobdesk-goal.json"), "utf8"));
    goal = String(g?.plan?.profile || "");
  } catch {
    goal = "";
  }
  return [goal && `Where they want to go: ${goal}`, cv ? `Their resume:\n${cv}` : "No resume yet."].filter(Boolean).join("\n\n");
}

export function synopsisPrompt(jobs: { job: SynopsisJob; posting: string }[]): string {
  return [
    "You help someone who isn't technical choose which jobs to look at. For each job posting below, write a",
    "quick, plain-English read. Use only what the posting says; never invent pay, perks or requirements.",
    "",
    "For each job give:",
    "- summary: one sentence (at most 25 words) saying what the job actually is, in everyday words.",
    "- doing: 2 or 3 short phrases for what they'd spend their days on.",
    "- wants: 2 or 3 short phrases for what the company asks for, the must-haves first.",
    "- level: Entry, Junior, Mid, Senior, Lead or Unclear.",
    "- type: Full-time, Part-time, Contract, Internship or Unclear.",
    "- where: like \"Remote (US)\", \"On-site · Austin, TX\" or \"Hybrid · London\".",
    "- pay: only if the posting states it, like \"$55K–65K a year\" or \"$22/hour\"; otherwise \"\".",
    "- fit: one honest, kind sentence (at most 22 words) on how it fits this person, from their resume and goal",
    "  below: what carries over, or that it's a stretch. Speak to them as \"you\".",
    "",
    "Reply with ONLY this JSON between the lines <<<JSON and JSON>>>, one entry per job, by its number:",
    '{"1": {"summary": "", "doing": [], "wants": [], "level": "", "type": "", "where": "", "pay": "", "fit": ""}}',
    "",
    about(),
    "",
    ...jobs.flatMap(({ job, posting }, i) => [
      `=== Job ${i + 1}: ${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""} ===`,
      posting,
      "",
    ]),
  ].join("\n");
}

/** Summaries for a few jobs: cached ones straight away, the rest in one model call. */
export async function synopses(jobs: SynopsisJob[]): Promise<Record<string, SynopsisResult>> {
  const out: Record<string, SynopsisResult> = {};
  const todo: SynopsisJob[] = [];
  for (const job of jobs) {
    const hit = readCached(job.url);
    if (hit) out[job.url] = hit.result;
    else todo.push(job);
  }
  if (!todo.length) return out;

  const postings = await Promise.all(todo.map((job) => fetchPosting(job.url)));
  const readable = todo.map((job, i) => ({ job, posting: postings[i] })).filter((x) => x.posting.length > 200);
  for (const job of todo) {
    if (!readable.some((x) => x.job.url === job.url)) {
      out[job.url] = null;
      writeCached(job.url, null);
    }
  }
  if (!readable.length) return out;

  const cli = resolveCli("claude");
  if (!cli) return out;
  const reply = await run(cli.binPath, ["-p", synopsisPrompt(readable), "--output-format", "text", "--model", MODEL], {
    cwd: os.tmpdir(),
    timeoutMs: 120_000,
    // No extended thinking: it was 70% of the output for a summary (a
    // three-job batch took 20 s with it, 8 s without, at half the cost).
    env: { ...process.env, MAX_THINKING_TOKENS: "0" },
  });
  const parsed = extractJson(reply) as Record<string, unknown> | null;
  readable.forEach(({ job }, i) => {
    const s = cleanSynopsis(parsed?.[String(i + 1)]);
    // A failed answer isn't cached: the next visit tries again.
    if (s) {
      out[job.url] = s;
      writeCached(job.url, s);
    }
  });
  return out;
}
