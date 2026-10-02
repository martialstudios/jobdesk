// JobDesk branded builds: "Start fresh" on My resume. Everything about the
// person (resume, answers, profile, My list and follow-ups, scores, tailored
// resumes, job summaries, the assistant's notes) moves into a dated backup
// folder inside their data folder: never deleted, and the app is back at
// "Ryan says to put your resume here". The job-board directory cache stays.

import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot } from "@/lib/career-ops";

// Files and folders about the person, relative to the data folder.
const FILES = [
  "cv.md",
  "article-digest.md",
  "config/profile.yml",
  "modes/_profile.md",
  "data/applications.md",
  "data/pipeline.md",
  "data/scan-history.tsv",
  "interview-prep/story-bank.md",
  ".career-ops-web",
];
// Folders whose contents (but not the folder or its .gitkeep) are theirs.
const CONTENTS = ["reports", "output", "data/parser-output"];

export const BACKUP_DIR = ".jobdesk-backup";

export function startFresh(): { backup: string; moved: number } {
  const root = careerOpsRoot();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(/* turbopackIgnore: true */ root, BACKUP_DIR, stamp);
  let moved = 0;
  const move = (rel: string) => {
    const from = path.join(/* turbopackIgnore: true */ root, rel);
    if (!fs.existsSync(from)) return;
    const to = path.join(backup, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(from, to);
    moved++;
  };
  for (const rel of FILES) move(rel);
  for (const dir of CONTENTS) {
    const abs = path.join(/* turbopackIgnore: true */ root, dir);
    let names: string[] = [];
    try {
      names = fs.readdirSync(abs);
    } catch {
      names = [];
    }
    for (const name of names) if (name !== ".gitkeep") move(path.join(dir, name));
  }
  // career-ops won't score a job without modes/_profile.md: the fresh one.
  const template = path.join(/* turbopackIgnore: true */ root, "modes", "_profile.template.md");
  const profile = path.join(/* turbopackIgnore: true */ root, "modes", "_profile.md");
  if (fs.existsSync(template) && !fs.existsSync(profile)) fs.copyFileSync(template, profile);
  return { backup: path.relative(root, backup), moved };
}
