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
  return Response.json({
    hasCv: fs.existsSync(path.join(/* turbopackIgnore: true */ root, "cv.md")),
    name: c.full_name || "",
    location: c.location || "",
    roles: profile.target_roles?.primary || [],
  });
}
