// JobDesk branded builds: the job titles from "A few quick questions" become
// portals.yml's title filter (lib/jobdesk/portal-titles.ts), so career-ops's
// own scan and the assistant search for what she asked for.

import { setPortalTitles } from "@/lib/jobdesk/portal-titles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { roles?: unknown; skipSenior?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const roles = Array.isArray(body.roles) ? body.roles.map(String) : [];
  const ok = setPortalTitles(roles, body.skipSenior === true);
  return Response.json({ ok }, { status: ok ? 200 : 500 });
}
