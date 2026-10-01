// JobDesk branded builds: what the simple pages need to know about the person.
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";
import { readGoal } from "@/lib/jobdesk/dream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const root = careerOpsRoot();
  let profile: Record<string, any> = {};
  try {
    profile = (yaml.load(fs.readFileSync(path.join(/* turbopackIgnore: true */ root, "config", "profile.yml"), "utf8")) as Record<string, any>) || {};
  } catch {
    profile = {};
  }
  const c = profile.candidate || {};
  const comp = profile.compensation || {};
  // A first profile is career-ops's example file ("$150K-200K"): that's not
  // their answer, so the salary boxes start empty instead.
  let example: Record<string, any> = {};
  try {
    example = (yaml.load(fs.readFileSync(path.join(/* turbopackIgnore: true */ root, "config", "profile.example.yml"), "utf8")) as Record<string, any>) || {};
  } catch {
    example = {};
  }
  const range = String(comp.target_range || "");
  const fromExample = range !== "" && range === String(example.compensation?.target_range ?? "");
  // "90000-120000", "$90K–120K", "90k - 120k".
  const amount = (x: string) => {
    const n = Number.parseFloat(x.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? Math.round(/k/i.test(x) ? n * 1000 : n) : Number.NaN;
  };
  const [payMin, payMax] = fromExample ? [Number.NaN, Number.NaN] : range.split(/[-–]/).map(amount);
  return Response.json({
    payMin: Number.isFinite(payMin) ? payMin : null,
    payMax: Number.isFinite(payMax) ? payMax : null,
    remote: comp.location_flexibility || "",
    hasCv: fs.existsSync(path.join(/* turbopackIgnore: true */ root, "cv.md")),
    name: c.full_name || "",
    location: c.location && c.location !== example.candidate?.location ? c.location : "",
    roles: profile.target_roles?.primary || [],
    goal: readGoal(),
  });
}
