// JobDesk branded builds: one scored job, in plain language. career-ops's
// evaluation report is thorough but written for power users (YAML, cv.md,
// archetypes). This pulls out what a person needs: where they shine, how to
// make the application stronger, the cover letter draft, and the full
// breakdown behind a "Read why".

import * as yaml from "js-yaml";

export type JobInsight = {
  company: string;
  role: string;
  url: string;
  score: number | null;
  strengths: string[];
  /** Concrete changes that would make the application stronger. */
  improve: string[];
  /** What the role asks for that the resume doesn't show yet, said gently. */
  missing: string[];
  coverLetter: string;
  /** The rest of the report, for "Read why". */
  breakdown: string;
};

// Words a non-technical person shouldn't have to see.
export function plain(text: string): string {
  return String(text ?? "")
    .replace(/`?cv\.md`?/gi, "your resume")
    .replace(/`?config\/profile\.yml`?/gi, "your profile")
    .replace(/`?modes\/_profile\.md`?/gi, "your profile")
    .replace(/`?article-digest\.md`?/gi, "your notes")
    .replace(/`?interview-prep\/story-bank\.md`?/gi, "your interview stories")
    .replace(/`[\w./-]+\.(?:md|ya?ml|tsv|json|mjs)`/g, "your notes")
    .replace(/\b[\w-]+\/[\w./-]+\.(?:md|ya?ml|tsv|json)\b/g, "your notes")
    .replace(/\bprofile\.yml\b/gi, "your profile")
    .replace(/\bCandidate's\b/g, "Your")
    .replace(/\bcandidate's\b/g, "your")
    .replace(/\barchetypes\b/gi, "role types")
    .replace(/\barchetype\b/gi, "role type")
    .replace(/\bYAML\b/g, "settings")
    .replace(/\/career-ops \w+[^.\n]*/g, "")
    .replace(/\s+([,.])/g, "$1");
}

function section(md: string, heading: RegExp): string {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return "";
  const level = (/^(#+)/.exec(lines[start])?.[1] || "##").length;
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const m = /^(#+)\s/.exec(line);
    if (m && m[1].length <= level) break;
    out.push(line);
  }
  return out.join("\n").trim();
}

function tableRows(md: string): string[][] {
  return md
    .split("\n")
    .filter((l) => /^\|/.test(l.trim()) && !/^\|\s*-/.test(l.trim()))
    .map((l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
}

const strip = (s: string) => plain(s.replace(/\*\*/g, "").replace(/^"|"$/g, "")).trim();

export function parseReport(content: string): JobInsight {
  const title = /^#\s*(?:Evaluation:\s*)?(.+)$/m.exec(content)?.[1] || "";
  const [companyFromTitle, roleFromTitle] = title.split(/\s+[—–-]\s+/);
  const url = /\*\*URL:\*\*\s*(\S+)/.exec(content)?.[1] || "";
  const scoreLine = /\*\*Score:\*\*\s*([\d.]+)/.exec(content)?.[1];

  let summary: Record<string, unknown> = {};
  const yamlBlock = /##\s*Machine Summary\s*\n+```ya?ml\n([\s\S]*?)```/.exec(content)?.[1];
  if (yamlBlock) {
    try {
      summary = (yaml.load(yamlBlock) as Record<string, unknown>) || {};
    } catch {
      summary = {};
    }
  }
  const list = (key: string) =>
    Array.isArray(summary[key]) ? (summary[key] as unknown[]).map((x) => strip(String(x))).filter(Boolean) : [];

  // "E) Customization Plan": one row per suggested change.
  const plan = tableRows(section(content, /^##\s*E\)/));
  const header = plan[0]?.map((h) => h.toLowerCase()) || [];
  const changeCol = header.findIndex((h) => /proposed|change/.test(h));
  const whyCol = header.findIndex((h) => /why/.test(h));
  const improve = plan
    .slice(1)
    .map((row) => {
      const change = row[changeCol] ? strip(row[changeCol]) : "";
      const why = whyCol >= 0 && row[whyCol] ? strip(row[whyCol]) : "";
      // "Matches streaming keywords" → "(matches streaming keywords)", but "JD …" stays "JD …".
      const lead = /^[A-Z][a-z]/.test(why) ? why.charAt(0).toLowerCase() + why.slice(1) : why;
      return change ? (why ? `${change} (${lead})` : change) : "";
    })
    .filter(Boolean)
    .slice(0, 5);

  const softGaps = list("soft_gaps");
  const cover = section(content, /^##\s*Cover Letter/i);

  // "Read why": the analysis sections, without the machine block, the archived
  // posting, the keyword tables or the drafts shown elsewhere.
  const drop = /^##\s*(Machine Summary|Cover Letter|Keywords|Keyword Coverage|Job Description|H\))/i;
  const kept: string[] = [];
  let skipping = false;
  for (const line of content.split("\n").slice(1)) {
    if (/^##\s/.test(line)) skipping = drop.test(line);
    if (!skipping) kept.push(line);
  }
  const breakdown = plain(
    kept
      .join("\n")
      .replace(/^\*\*(Date|Via|Archetype|PDF|Verification|Work Auth|Legitimacy|URL|Score):\*\*.*$/gm, "")
      .replace(/^---\s*$/gm, "")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();

  const score = typeof summary.score === "number" ? summary.score : scoreLine ? Number.parseFloat(scoreLine) : null;
  return {
    company: strip(String(summary.company || companyFromTitle || "")),
    role: strip(String(summary.role || roleFromTitle || "")),
    url,
    score: Number.isFinite(score as number) ? (score as number) : null,
    strengths: list("top_strengths"),
    improve: improve.length ? improve : softGaps.slice(0, 4),
    missing: list("hard_stops"),
    coverLetter: plain(cover).trim(),
    breakdown,
  };
}
