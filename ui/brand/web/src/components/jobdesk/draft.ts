// JobDesk branded builds: read a job's application form and draft her
// answers (career-ops's apply session + pre-fill, which uses her resume and
// My info), for the assisted send-it-yourself path and Apply to all.

import type { ApplyField } from "@/lib/apply/extract";

const CONFIG_KEY = "career-ops:config";

export const cliId = (): string | null => {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}").cliId || null;
  } catch {
    return null;
  }
};

export const post = (url: string, body: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// career-ops's pre-fill streams NDJSON; the answers come in its "done" event(s).
export async function draftAnswers(sessionId: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const r = await post("/api/apply/prefill", { sessionId, cliId: cliId() });
  if (!r.body) return out;
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const ev = JSON.parse(line) as { t?: string; answers?: Record<string, { value?: string }> };
        if (ev.t === "done") for (const [id, v] of Object.entries(ev.answers || {})) if (v?.value) out[id] = v.value;
      } catch {
        /* a partial line */
      }
    }
  }
  return out;
}

export type Opened = { id: string; fields: ApplyField[] } | { error: string };

/** Opens the real form (to read its questions). */
export async function openForm(url: string): Promise<Opened> {
  try {
    const d = await (await post("/api/apply/session", { url, cliId: cliId() })).json();
    const block = (d.issues || []).find((i: { level?: string }) => i.level === "block");
    if (d.error || block || d.needsDrive || !d.id) {
      if (d.id) void post("/api/apply/close", { sessionId: d.id });
      return { error: block?.message || d.error || "This form needs a person to get to it. Apply on their site." };
    }
    return { id: d.id, fields: d.fields || [] };
  } catch {
    return { error: "Couldn't open the form. Try again in a minute." };
  }
}

/** Reads the form and drafts every answer, then closes it (she sends it herself). */
export async function draftOnly(url: string): Promise<{ fields: ApplyField[]; answers: Record<string, string> } | { error: string }> {
  const o = await openForm(url);
  if ("error" in o) return o;
  try {
    const answers = await draftAnswers(o.id);
    return { fields: o.fields, answers };
  } finally {
    void post("/api/apply/close", { sessionId: o.id });
  }
}
