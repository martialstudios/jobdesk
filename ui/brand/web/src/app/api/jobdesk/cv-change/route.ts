// JobDesk branded builds: "Ask for a change". The person says what to change
// in plain words; Claude returns the whole revised resume, which the page
// shows for approval. Nothing is saved here (the page saves through /api/cv).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { careerOpsRoot } from "@/lib/career-ops";
import { resolveCli } from "@/lib/clis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: Request) {
  let body: { instruction?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const instruction = String(body.instruction || "").trim().slice(0, 4000);
  if (!instruction) return Response.json({ error: "Say what you'd like to change." }, { status: 400 });
  let current = String(body.content || "");
  if (!current) {
    try {
      current = fs.readFileSync(path.join(/* turbopackIgnore: true */ careerOpsRoot(), "cv.md"), "utf8");
    } catch {
      return Response.json({ error: "There's no resume yet. Add one first." }, { status: 400 });
    }
  }
  const cli = resolveCli("claude");
  if (!cli) return Response.json({ error: "Claude isn't set up." }, { status: 500 });

  const prompt = [
    "You edit resumes. Apply the requested change to the resume below.",
    "Rules: keep every fact true; never invent employers, dates, titles, numbers or skills that aren't",
    "given in the resume or the request; keep the same Markdown layout (# name, ## sections, ### entries,",
    "- bullets); change nothing else unless the request asks for it.",
    "Reply with ONLY the complete revised resume between the lines <<<RESUME and RESUME>>>.",
    "",
    `Requested change: ${instruction}`,
    "",
    "Resume:",
    current,
  ].join("\n");

  const out = await new Promise<{ code: number | null; text: string }>((resolve) => {
    const child = spawn(cli.binPath, ["-p", prompt, "--output-format", "text"], {
      cwd: os.tmpdir(),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let text = "";
    child.stdout.on("data", (d) => (text += d));
    child.stderr.on("data", (d) => (text += d));
    const timer = setTimeout(() => child.kill("SIGKILL"), 170_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, text });
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve({ code: 1, text: "" });
    });
  });
  const revised = /<<<RESUME\s*\n([\s\S]*?)\n?RESUME>>>/.exec(out.text)?.[1]?.trim();
  if (!revised) {
    return Response.json({ error: "That didn't work this time. Try saying it a little differently." }, { status: 502 });
  }
  return Response.json({ content: revised });
}
