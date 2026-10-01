// JobDesk branded builds: make career-ops's profile theirs, once, right after
// a resume is saved. career-ops starts config/profile.yml from its example
// file (placeholder contact details like "Jane Smith") and modes/_profile.md
// from its template (the template author's target roles), and scores every
// job against them. Claude rewrites both from cv.md in the background: real
// contact details or blanks, and targeting that fits this person. Never
// invents anything; runs detached so it finishes even if the page moves on.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { careerOpsRoot } from "@/lib/career-ops";
import { resolveCli } from "@/lib/clis";
import { readGoal } from "@/lib/jobdesk/dream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PROMPT = `Personalize this career-ops setup for the person whose resume is in cv.md. Work only on
config/profile.yml and modes/_profile.md. Read cv.md first.

1. config/profile.yml: every contact or identity value (name, email, phone, LinkedIn, GitHub,
   portfolio, website, location) must come from cv.md. Any value copied from the example file
   (for example "Jane Smith", "janesmith", example.com addresses, 555 phone numbers) that cv.md
   doesn't provide must become an empty string. The same goes for every other fact about the
   person (compensation and salary, work authorization and visa, languages, availability,
   relocation, demographics, side projects, links): keep it only if cv.md states it, otherwise
   empty it ("" or []), so nothing about the example person can ever end up in an application.
   The person just answered a few questions themselves: keep their target roles, location,
   compensation.target_range, currency and remote preference exactly as they are in the file
   now. Every other compensation value must agree with their answer: set compensation.minimum
   to the low end of target_range, or empty it when there's no range. Set seniority and
   narrative from what cv.md actually shows. Leave the app's
   own settings (scanning, output language, spend, CV template) and the file's structure as they are.
2. modes/_profile.md: rewrite every section that still describes the template's example
   person (archetypes, North Star, framing, exit narrative, proof points, cross-cutting
   advantage) so it fits this person's real background and the target roles in
   config/profile.yml, from cv.md only. Keep the headings.

Never invent employers, dates, numbers, skills or contact details. Don't touch any other file.
Reply with one short line when you're done.`;

// When they told the dream-job helper where they want to go, the profile is
// written for that move, so every score and tailored resume judges them as a
// career changer instead of against their current field.
function goalPrompt(): string {
  const goal = readGoal();
  if (!goal) return "";
  const roles = [...goal.plan.roles, ...goal.plan.dream].join(", ");
  return `

This person is changing careers. Their dream job, in their words: ${goal.dream}
The roles they're targeting now: ${roles}
${goal.plan.profile}
In modes/_profile.md, write the archetypes, North Star, framing and narrative for that move: the
target roles above, and how what cv.md actually shows (transferable skills, results, interests)
carries over. Fit should be judged on potential and transferable skills, not years in the field.
Still never invent experience the resume doesn't show.`;
}

export async function POST() {
  const root = careerOpsRoot();
  if (!fs.existsSync(path.join(/* turbopackIgnore: true */ root, "cv.md"))) {
    return Response.json({ error: "no resume yet" }, { status: 400 });
  }
  const cli = resolveCli("claude");
  if (!cli) return Response.json({ error: "Claude isn't set up." }, { status: 500 });
  const dir = path.join(/* turbopackIgnore: true */ root, ".career-ops-web");
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, "jobdesk-personalize.lock");
  try {
    // One at a time; a lock older than 10 minutes is a leftover.
    if (Date.now() - fs.statSync(lock).mtimeMs < 10 * 60 * 1000) return Response.json({ started: false, running: true });
  } catch {
    /* no lock */
  }
  fs.writeFileSync(lock, String(Date.now()));
  const log = fs.openSync(path.join(dir, "jobdesk-personalize.log"), "a");
  const child = spawn(
    cli.binPath,
    ["-p", PROMPT + goalPrompt(), "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,Write,Glob,Grep"],
    { cwd: root, env: process.env, detached: true, stdio: ["ignore", log, log] },
  );
  child.on("close", () => fs.rmSync(lock, { force: true }));
  child.on("error", () => fs.rmSync(lock, { force: true }));
  child.unref();
  return Response.json({ started: true });
}
