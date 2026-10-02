// JobDesk branded builds: "Write a follow-up email" on Follow-ups. A short,
// warm note to the hiring team about one application, from what's true: the
// job, when they applied, their name and resume. Nothing is sent; the page
// shows it to copy or open in their mail app.
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { careerOpsRoot } from "@/lib/career-ops";
import { readList } from "@/lib/jobdesk/list";
import { fetchPosting, quick } from "@/lib/jobdesk/synopsis";
import { extractJson } from "@/lib/jobdesk/dream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const item = readList().find((i) => i.url === body.url);
  if (!item) return Response.json({ error: "That job isn't in your list." }, { status: 404 });

  const root = careerOpsRoot();
  let name = "";
  try {
    const p = yaml.load(fs.readFileSync(path.join(/* turbopackIgnore: true */ root, "config", "profile.yml"), "utf8")) as Record<string, any>;
    name = String(p?.candidate?.full_name || "");
  } catch {
    name = "";
  }
  let cv = "";
  try {
    cv = fs.readFileSync(path.join(/* turbopackIgnore: true */ root, "cv.md"), "utf8").slice(0, 2500);
  } catch {
    cv = "";
  }
  const posting = (await fetchPosting(item.url)).slice(0, 3000);
  const applied = item.appliedAt ? new Date(item.appliedAt).toDateString() : "recently";
  const nth = (item.followUps?.length || 0) + 1;

  const prompt = [
    "Write a short, warm, professional follow-up email about a job application. Plain text, 80 to 130 words.",
    "Polite and confident, never pushy or apologetic. Thank them, restate interest in the specific role, add",
    "one concrete reason they're a good fit taken ONLY from the resume below (never invent experience), and",
    "close by saying they'd love to talk. Address it to \"Hi there,\" unless a recruiter's name is in the posting.",
    nth > 1 ? "This is a second follow-up: keep it even shorter and gentle." : "",
    "",
    `Role: ${item.title} at ${item.company}`,
    `Applied: ${applied}`,
    name ? `Sign it: ${name}` : "Sign it with a placeholder [Your name].",
    "",
    "Reply with ONLY this JSON between the lines <<<JSON and JSON>>>:",
    '{"subject": "", "body": ""}',
    "",
    cv ? `Their resume:\n${cv}` : "",
    posting ? `The posting:\n${posting}` : "",
  ].filter((l) => l !== "").join("\n");

  const out = extractJson(await quick(prompt)) as { subject?: unknown; body?: unknown } | null;
  const subject = typeof out?.subject === "string" ? out.subject.trim().slice(0, 200) : "";
  const text = typeof out?.body === "string" ? out.body.trim().slice(0, 3000) : "";
  if (!text) return Response.json({ error: "That didn't work this time. Try again." }, { status: 502 });
  return Response.json({ subject: subject || `Following up: ${item.title}`, body: text });
}
