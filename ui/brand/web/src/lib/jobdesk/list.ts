// JobDesk branded builds: "My list", the jobs someone checked on Find jobs.
// Kept in the career-ops folder (.career-ops-web/jobdesk-list.json) so it
// survives restarts and travels with their data. Scoring, tailored CVs and
// applying all key off a job's URL; a scored job also gets its tracker number.

import fs from "node:fs";
import path from "node:path";
import { careerOpsRoot, readApplications } from "@/lib/career-ops";

export type ListStatus = "saved" | "applied" | "skipped";
/** After applying: what happened (Follow-ups). */
export type ListOutcome = "waiting" | "interview" | "offer" | "rejected";
const OUTCOMES: ListOutcome[] = ["waiting", "interview", "offer", "rejected"];
export type ListItem = {
  url: string;
  company: string;
  title: string;
  location: string;
  postedAt: string;
  ats: string;
  addedAt: number;
  status: ListStatus;
  appliedAt?: number;
  /** When they followed up (Follow-ups). */
  followUps?: number[];
  outcome?: ListOutcome;
  /** Follow up again on this day instead of the usual week. */
  nextAt?: number;
  notes?: string;
};
export type ListPatch = {
  status?: ListStatus;
  followedUp?: boolean;
  outcome?: ListOutcome;
  nextAt?: number | null;
  notes?: string;
};
export type ListView = ListItem & {
  /** Tracker number once it's been scored. */
  n?: string;
  score?: number | null;
  /** A tailored CV exists for it. */
  tailored?: boolean;
};

function listFile(): string {
  return path.join(/* turbopackIgnore: true */ careerOpsRoot(), ".career-ops-web", "jobdesk-list.json");
}

export function readList(): ListItem[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(listFile(), "utf8"));
    return Array.isArray(parsed) ? parsed.filter((i) => i && typeof i.url === "string") : [];
  } catch {
    return [];
  }
}

export function writeList(items: ListItem[]): void {
  const file = listFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(items, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

function normalizeUrl(u: string): string {
  return u.trim().replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();
}

/** URL → tracker row, through each scored job's report ("**URL:** …" up top).
 *  Report file numbers can differ from tracker numbers, so go via the
 *  tracker's own report link. */
export function scoredByUrl(): Map<string, { n: string; score: number | null; tailored: boolean }> {
  const out = new Map<string, { n: string; score: number | null; tailored: boolean }>();
  const root = careerOpsRoot();
  for (const app of readApplications()) {
    const link = /\]\(([^)]+)\)/.exec(app.report || "")?.[1];
    if (!link) continue;
    const file = path.resolve(/* turbopackIgnore: true */ root, "data", link);
    let head = "";
    try {
      const fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(4096);
      const len = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      head = buf.subarray(0, len).toString("utf8");
    } catch {
      continue;
    }
    const url = /\*\*URL:\*\*\s*(\S+)/.exec(head)?.[1];
    if (!url) continue;
    const score = Number.parseFloat(app.score);
    out.set(normalizeUrl(url), {
      n: app.n,
      score: Number.isFinite(score) ? score : null,
      tailored: /✅/.test(app.pdf || ""),
    });
  }
  return out;
}

export function listView(): ListView[] {
  const scored = scoredByUrl();
  return readList().map((item) => {
    const s = scored.get(normalizeUrl(item.url));
    return s ? { ...item, n: s.n, score: s.score, tailored: s.tailored } : item;
  });
}

export function addToList(offers: Partial<ListItem>[]): number {
  const items = readList();
  const have = new Set(items.map((i) => normalizeUrl(i.url)));
  let added = 0;
  for (const o of offers) {
    if (!o.url || !/^https?:\/\//i.test(o.url) || have.has(normalizeUrl(o.url))) continue;
    have.add(normalizeUrl(o.url));
    items.push({
      url: o.url,
      company: String(o.company || ""),
      title: String(o.title || ""),
      location: String(o.location || ""),
      postedAt: String(o.postedAt || ""),
      ats: String(o.ats || ""),
      addedAt: Date.now(),
      status: "saved",
    });
    added++;
  }
  writeList(items);
  return added;
}

export function updateItem(url: string, patch: ListPatch): boolean {
  const items = readList();
  const item = items.find((i) => normalizeUrl(i.url) === normalizeUrl(url));
  if (!item) return false;
  if (patch.status && ["saved", "applied", "skipped"].includes(patch.status)) {
    // Applying again doesn't move the date they first applied.
    if (patch.status === "applied" && !(item.status === "applied" && item.appliedAt)) item.appliedAt = Date.now();
    item.status = patch.status;
  }
  if (patch.followedUp) {
    item.followUps = [...(item.followUps || []), Date.now()];
    delete item.nextAt;
  }
  if (patch.outcome && OUTCOMES.includes(patch.outcome)) item.outcome = patch.outcome;
  if (patch.nextAt === null) delete item.nextAt;
  else if (typeof patch.nextAt === "number" && Number.isFinite(patch.nextAt)) item.nextAt = patch.nextAt;
  if (typeof patch.notes === "string") item.notes = patch.notes.slice(0, 4000);
  writeList(items);
  return true;
}

export function removeItem(url: string): boolean {
  const items = readList();
  const keep = items.filter((i) => normalizeUrl(i.url) !== normalizeUrl(url));
  if (keep.length === items.length) return false;
  writeList(keep);
  return true;
}
