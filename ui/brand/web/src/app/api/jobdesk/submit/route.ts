// JobDesk branded builds: Approve & submit (lib/jobdesk/submit.ts). Only ever
// called after her confirmation in the app, for a form she has reviewed:
// the Apply screen, or Apply to all. With `extra` (answers she gave in the
// app for questions the form still had empty) and `code` (a security code the
// job site emailed her). What she typed is kept for the next form.

import type { ApplyField } from "@/lib/apply/extract";
import { learnFrom } from "@/lib/jobdesk/answers";
import { submitSession } from "@/lib/jobdesk/submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(req: Request) {
  let body: { sessionId?: string; confirm?: boolean; extra?: Record<string, string>; fields?: ApplyField[]; code?: string; company?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!body.sessionId || body.confirm !== true) return Response.json({ error: "Approve & submit needs her confirmation." }, { status: 400 });
  const extra = body.extra && typeof body.extra === "object" ? body.extra : {};
  const fields = Array.isArray(body.fields) ? body.fields : undefined;
  if (fields && Object.keys(extra).length) {
    try {
      learnFrom(fields.filter((f) => f.id in extra), extra, String(body.company || ""));
    } catch {
      /* learning never blocks sending */
    }
  }
  try {
    return Response.json(await submitSession(body.sessionId, { extra, fields, code: typeof body.code === "string" ? body.code : undefined }));
  } catch (e) {
    return Response.json({ ok: false, reason: "unclear", message: e instanceof Error ? e.message : "Submit failed." });
  }
}
