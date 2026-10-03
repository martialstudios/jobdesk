// JobDesk branded builds: career-ops starts portals.yml from its example, whose
// title_filter is someone else's search: AI/ML engineering keywords to keep,
// and "Junior", "Intern", "Internship" to drop (the opposite of what a career
// changer needs). JobDesk's own search passes its titles directly, but
// career-ops's scan (Advanced) and the assistant read this filter, so it
// follows the person's own answers: their job titles to keep, and only senior
// titles to drop when they asked for that.

import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";
import { atomicWriteWithBackup } from "@/lib/core/safe-write";
import { loadPortalsDocument } from "@/lib/portals-config.mjs";

export const SENIOR_TITLES = ["word:Senior", "word:Sr", "word:Lead", "word:Principal", "word:Staff", "Director", "Head of", "word:VP"];

/** Sets portals.yml's title_filter to these titles (and senior titles out, if asked). */
export function setPortalTitles(roles: string[], skipSenior: boolean): boolean {
  const root = careerOpsRoot();
  const file = path.join(/* turbopackIgnore: true */ root, "portals.yml");
  try {
    const { doc } = loadPortalsDocument(file, path.join(/* turbopackIgnore: true */ root, "templates", "portals.example.yml")) as {
      doc: Record<string, unknown>;
    };
    const tf = (doc.title_filter && typeof doc.title_filter === "object" ? doc.title_filter : {}) as Record<string, unknown>;
    tf.positive = Array.from(new Set(roles.map((r) => String(r).trim()).filter(Boolean))).slice(0, 24);
    tf.negative = skipSenior ? SENIOR_TITLES : [];
    doc.title_filter = tf;
    atomicWriteWithBackup(file, yaml.dump(doc, { lineWidth: 100, noRefs: true }));
    return true;
  } catch {
    return false;
  }
}

/** Before anything is saved: an example filter left in place is emptied. */
export function scrubExampleTitles(): void {
  const root = careerOpsRoot();
  const file = path.join(/* turbopackIgnore: true */ root, "portals.yml");
  try {
    const { doc } = loadPortalsDocument(file, path.join(/* turbopackIgnore: true */ root, "templates", "portals.example.yml")) as {
      doc: Record<string, unknown>;
    };
    const example = loadPortalsDocument(
      path.join(/* turbopackIgnore: true */ root, "templates", "portals.example.yml"),
      path.join(/* turbopackIgnore: true */ root, "templates", "portals.example.yml"),
    ).doc as Record<string, unknown>;
    const tf = doc.title_filter as Record<string, unknown> | undefined;
    const ex = example.title_filter as Record<string, unknown> | undefined;
    if (!tf || !ex || JSON.stringify(tf.positive) !== JSON.stringify(ex.positive)) return;
    setPortalTitles([], false);
  } catch {
    /* nothing to clean */
  }
}
