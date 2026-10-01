// JobDesk branded builds: what the simple pages need to know about the person.
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";

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
  const [payMin, payMax] = String(comp.target_range || "")
    .split(/[-–]/)
    .map((x) => Number.parseInt(x.replace(/[^\d]/g, ""), 10));
  return Response.json({
    payMin: Number.isFinite(payMin) ? payMin : null,
    payMax: Number.isFinite(payMax) ? payMax : null,
    remote: comp.location_flexibility || "",
    hasCv: fs.existsSync(path.join(/* turbopackIgnore: true */ root, "cv.md")),
    name: c.full_name || "",
    location: c.location || "",
    roles: profile.target_roles?.primary || [],
  });
}
