// JobDesk branded builds: "My list" (see lib/jobdesk/list.ts).
import { listView, addToList, updateItem, removeItem, type ListItem, type ListPatch } from "@/lib/jobdesk/list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ items: listView() });
}

/** { add: offers[] } adds; { url, remove: true } removes; { url, ...patch }
 *  updates (status, followedUp, outcome, nextAt, notes). */
export async function POST(req: Request) {
  let body: { add?: Partial<ListItem>[]; url?: string; remove?: boolean } & ListPatch;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (Array.isArray(body.add)) return Response.json({ added: addToList(body.add), items: listView() });
  if (body.url && body.remove) return Response.json({ ok: removeItem(body.url), items: listView() });
  if (body.url) {
    const { status, followedUp, outcome, nextAt, notes } = body;
    if (status || followedUp || outcome || nextAt !== undefined || typeof notes === "string") {
      return Response.json({ ok: updateItem(body.url, { status, followedUp, outcome, nextAt, notes }), items: listView() });
    }
  }
  return Response.json({ error: "nothing to do" }, { status: 400 });
}
