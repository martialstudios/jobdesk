// JobDesk branded builds: no example person in an application. career-ops
// starts config/profile.yml as a copy of config/profile.example.yml ("Jane
// Smith", linkedin.com/in/janesmith, $150K-200K, a visa answer), and Apply
// pre-fills forms from it. The background personalization asks Claude to
// replace those, but that's a model following a prompt; this is the
// guarantee: any personal value still identical to the example's is emptied.

import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";

// About the person. Everything else (language, spend_tier, cv, scan) is the
// app's own settings and keeps the example's defaults.
const PERSONAL = ["candidate", "target_roles", "narrative", "compensation", "location", "cover_letter"];

// Defaults rather than claims about the person.
const KEEP = new Set(["currency", "photo_style"]);

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Empties what still equals the example. Returns the number of values emptied. */
export function scrubValues(profile: Record<string, unknown>, example: Record<string, unknown>): number {
  let n = 0;
  const walk = (node: Record<string, unknown>, ex: Record<string, unknown>) => {
    for (const key of Object.keys(node)) {
      const v = node[key];
      const e = ex[key];
      if (e === undefined || KEEP.has(key)) continue;
      if (v && typeof v === "object" && !Array.isArray(v) && e && typeof e === "object" && !Array.isArray(e)) {
        walk(v as Record<string, unknown>, e as Record<string, unknown>);
      } else if (same(v, e) && v !== "" && !(Array.isArray(v) && v.length === 0)) {
        node[key] = Array.isArray(v) ? [] : "";
        n++;
      }
    }
  };
  for (const section of PERSONAL) {
    const v = profile[section];
    const e = example[section];
    if (v && typeof v === "object" && !Array.isArray(v) && e && typeof e === "object" && !Array.isArray(e)) {
      walk(v as Record<string, unknown>, e as Record<string, unknown>);
    }
  }
  return n;
}

export function scrubExampleProfile(): number {
  const dir = path.join(/* turbopackIgnore: true */ careerOpsRoot(), "config");
  const file = path.join(dir, "profile.yml");
  try {
    const profile = yaml.load(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const example = yaml.load(fs.readFileSync(path.join(dir, "profile.example.yml"), "utf8")) as Record<string, unknown>;
    if (!profile || typeof profile !== "object" || !example || typeof example !== "object") return 0;
    const n = scrubValues(profile, example);
    if (n > 0) fs.writeFileSync(file, yaml.dump(profile, { lineWidth: 120 }));
    return n;
  } catch {
    return 0;
  }
}
