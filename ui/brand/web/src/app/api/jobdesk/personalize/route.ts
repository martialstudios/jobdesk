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
   Set target roles, seniority and narrative from what cv.md actually shows. Leave the app's
   own settings (scanning, output language, spend, CV template) and the file's structure as they are.
2. modes/_profile.md: replace the template's example archetypes, North Star and proof points
   with ones that fit this person's real background, from cv.md only. Keep the headings.

Never invent employers, dates, numbers, skills or contact details. Don't touch any other file.
Reply with one short line when you're done.`;

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
    ["-p", PROMPT, "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,Write,Glob,Grep"],
    { cwd: root, env: process.env, detached: true, stdio: ["ignore", log, log] },
  );
  child.on("close", () => fs.rmSync(lock, { force: true }));
  child.on("error", () => fs.rmSync(lock, { force: true }));
  child.unref();
  return Response.json({ started: true });
}
