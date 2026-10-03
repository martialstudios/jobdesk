// JobDesk branded builds: My info. GET: the survey questions, her saved
// answers, what forms taught it, and what forms asked that she hasn't answered.
// POST: save basics, change or forget a learned answer, answer a missing one.

import { BASICS, answersForForms, keyOf, readAnswers, writeAnswers } from "@/lib/jobdesk/answers";
import { scrubExampleProfile } from "@/lib/jobdesk/scrub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  scrubExampleProfile();
  const store = answersForForms();
  const basics = store.basics;
  return Response.json({
    questions: BASICS.map(({ key, label, section, options, placeholder, hint }) => ({ key, label, section, options, placeholder, hint })),
    basics,
    learned: Object.entries(store.learned)
      .map(([k, v]) => ({ key: k, ...v }))
      .sort((a, b) => b.at.localeCompare(a.at)),
    missing: Object.entries(store.missing).map(([k, v]) => ({ key: k, ...v })),
  });
}

export async function POST(req: Request) {
  let body: { basics?: Record<string, string>; learned?: { key: string; label?: string; value?: string; remove?: boolean }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const store = readAnswers();
  const known = new Set(BASICS.map((b) => b.key));
  for (const [k, v] of Object.entries(body.basics || {})) if (known.has(k)) store.basics[k] = String(v ?? "").slice(0, 300);
  const now = new Date().toISOString();
  for (const l of body.learned || []) {
    const k = keyOf(l.key || l.label || "");
    if (!k) continue;
    if (l.remove) {
      delete store.learned[k];
      delete store.missing[k];
      continue;
    }
    const value = String(l.value ?? "").trim().slice(0, 300);
    if (!value) continue;
    const label = l.label || store.learned[k]?.label || store.missing[k]?.label || k;
    store.learned[k] = { label, value, at: now, uses: store.learned[k]?.uses ?? 0 };
    delete store.missing[k];
  }
  writeAnswers(store);
  return Response.json({ ok: true });
}
