// JobDesk branded builds: Apply to all's "Show in Chrome": brings one filled
// form's window to the front.

import { handoffSession } from "@/lib/apply/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { sessionId } = (await req.json().catch(() => ({}))) as { sessionId?: string };
  if (!sessionId) return Response.json({ error: "sessionId" }, { status: 400 });
  try {
    await handoffSession(sessionId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "not open" }, { status: 404 });
  }
}
