// JobDesk branded builds: the answers she approved on a form ("Fill the real
// form") are kept for the next one (lib/jobdesk/answers.ts).

import type { ApplyField } from "@/lib/apply/extract";
import { learnFrom } from "@/lib/jobdesk/answers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { fields?: ApplyField[]; answers?: Record<string, string>; company?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (!Array.isArray(body.fields) || !body.answers || typeof body.answers !== "object") return Response.json({ error: "fields and answers" }, { status: 400 });
  learnFrom(body.fields, body.answers, String(body.company || ""));
  return Response.json({ ok: true });
}
