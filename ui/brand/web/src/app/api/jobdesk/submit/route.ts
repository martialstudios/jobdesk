// JobDesk branded builds: Approve & submit (lib/jobdesk/submit.ts). Only ever
// called from the Apply screen's confirm step, for the form she just reviewed.

import { submitSession } from "@/lib/jobdesk/submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { sessionId?: string; confirm?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.sessionId || body.confirm !== true) return Response.json({ error: "Approve & submit needs her confirmation." }, { status: 400 });
  try {
    return Response.json(await submitSession(body.sessionId));
  } catch (e) {
    return Response.json({ ok: false, reason: "unclear", message: e instanceof Error ? e.message : "Submit failed." });
  }
}
