// JobDesk branded builds: "Start fresh" (see lib/jobdesk/reset.ts).
//   POST {confirm: "start fresh"} -> {backup, moved}
import { startFresh } from "@/lib/jobdesk/reset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  // Never by accident: the page sends this only after they confirm.
  if (body.confirm !== "start fresh") return Response.json({ error: "not confirmed" }, { status: 400 });
  try {
    return Response.json(startFresh());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Couldn't start fresh." }, { status: 500 });
  }
}
