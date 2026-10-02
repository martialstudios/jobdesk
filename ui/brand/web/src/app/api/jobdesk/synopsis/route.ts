// JobDesk branded builds: quick reads of a few jobs (see lib/jobdesk/synopsis.ts).
//   POST {jobs: [{url, title, company, location}]}  (at most 5)
//   -> {items: {[url]: synopsis | null}}  null: the posting couldn't be read;
//      a job missing from items: try again later.
import { synopses, type SynopsisJob } from "@/lib/jobdesk/synopsis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  let body: { jobs?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const jobs: SynopsisJob[] = (Array.isArray(body.jobs) ? body.jobs : [])
    .map((j) => j as Record<string, unknown>)
    .filter((j) => typeof j.url === "string" && /^https?:\/\//.test(j.url))
    .map((j) => ({
      url: String(j.url),
      title: String(j.title || "").slice(0, 200),
      company: String(j.company || "").slice(0, 120),
      location: String(j.location || "").slice(0, 160),
    }))
    .slice(0, 5);
  if (!jobs.length) return Response.json({ items: {} });
  return Response.json({ items: await synopses(jobs) });
}
