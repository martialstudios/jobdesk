// JobDesk branded builds: where jobs are, for Find jobs (see lib/jobdesk/where.ts).
//   POST {home: "Huntington Beach, CA", locations: [...]}
//   -> {home: found?, items: {[location]: {us, remote, miles}}}
import { placeOf, where, type Where } from "@/lib/jobdesk/where";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { home?: string; locations?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const home = placeOf(String(body.home || ""));
  const locations = (Array.isArray(body.locations) ? body.locations : []).map((l) => String(l ?? "").slice(0, 400)).slice(0, 1000);
  const items: Record<string, Where> = {};
  for (const l of locations) items[l] = where(l, home);
  return Response.json({ home: !!home, items });
}
