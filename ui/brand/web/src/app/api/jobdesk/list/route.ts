// JobDesk branded builds: "My list" (see lib/jobdesk/list.ts).
import { listView, addToList, updateItem, removeItem, type ListItem } from "@/lib/jobdesk/list";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ items: listView() });
}

/** { add: offers[] } adds; { url, status } updates; { url, remove: true } removes. */
export async function POST(req: Request) {
  let body: { add?: Partial<ListItem>[]; url?: string; status?: ListItem["status"]; remove?: boolean };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (Array.isArray(body.add)) return Response.json({ added: addToList(body.add), items: listView() });
  if (body.url && body.remove) return Response.json({ ok: removeItem(body.url), items: listView() });
  if (body.url && body.status) return Response.json({ ok: updateItem(body.url, { status: body.status }), items: listView() });
  return Response.json({ error: "nothing to do" }, { status: 400 });
}
