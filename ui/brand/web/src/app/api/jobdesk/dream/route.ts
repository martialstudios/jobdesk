// JobDesk branded builds: the dream-job helper (see lib/jobdesk/dream.ts).
//   {step: "ask", dream}            -> follow-up questions
//   {step: "plan", dream, answers}  -> the plan, kept for scoring and tailoring
//   {step: "clear"}                 -> forget it (search from the resume again)
import { ask, askPrompt, cleanAsk, cleanPlan, extractJson, planPrompt, readResume, writeGoal, type DreamAnswer } from "@/lib/jobdesk/dream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

const SORRY = "That didn't work this time. Try again, or say it a little differently.";

export async function POST(req: Request) {
  let body: { step?: string; dream?: string; answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  if (body.step === "clear") {
    writeGoal(null);
    return Response.json({ ok: true });
  }
  const dream = String(body.dream || "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (!dream) return Response.json({ error: "Tell me about the job you'd love." }, { status: 400 });
  const resume = readResume();

  try {
    if (body.step === "ask") {
      const out = cleanAsk(extractJson(await ask(askPrompt(dream, resume))));
      return out ? Response.json(out) : Response.json({ error: SORRY }, { status: 502 });
    }
    if (body.step === "plan") {
      const answers: DreamAnswer[] = (Array.isArray(body.answers) ? body.answers : [])
        .map((x) => ({ q: String((x as DreamAnswer)?.q || "").slice(0, 200), a: String((x as DreamAnswer)?.a || "").slice(0, 400) }))
        .filter((x) => x.q && x.a)
        .slice(0, 6);
      const plan = cleanPlan(extractJson(await ask(planPrompt(dream, answers, resume))));
      if (!plan) return Response.json({ error: SORRY }, { status: 502 });
      writeGoal({ dream, answers, plan, at: new Date().toISOString() });
      return Response.json({ plan });
    }
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : SORRY }, { status: 500 });
  }
  return Response.json({ error: "unknown step" }, { status: 400 });
}
