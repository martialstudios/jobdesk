// JobDesk branded builds: a clean PDF of the person's own resume (cv.md), for
// "Download PDF" and for applying to a job that has no tailored CV. career-ops
// only attaches a CV tailored to a scored job; without one, nothing would be
// attached. Rendered with career-ops's own Playwright and the headless Chromium
// JobDesk ships (PLAYWRIGHT_BROWSERS_PATH), and redone only when cv.md changes.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { careerOpsRoot } from "@/lib/career-ops";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s: string): string {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
}

/** The small slice of Markdown a resume uses: headings, bullets, bold, links. */
export function resumeHtml(md: string): string {
  const out: string[] = [];
  let list = false;
  const close = () => {
    if (list) out.push("</ul>");
    list = false;
  };
  for (const raw of md.split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const b = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (h) {
      close();
      const level = Math.min(h[1].length, 3);
      const text = level === 1 ? h[2].replace(/^CV\s*[-—–:]+\s*/i, "") : h[2];
      out.push(`<h${level}>${inline(text)}</h${level}>`);
    } else if (b) {
      if (!list) out.push("<ul>");
      list = true;
      out.push(`<li>${inline(b[1])}</li>`);
    } else if (!line.trim() || /^-{3,}$/.test(line.trim())) {
      close();
    } else {
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  close();
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: Letter; margin: 0.6in 0.65in; }
body { font: 10.5pt/1.42 -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1c2028; }
h1 { font-size: 22pt; margin: 0 0 4pt; letter-spacing: -0.01em; }
h2 { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.08em; color: #12707a;
     border-bottom: 1px solid #d5dbe2; padding-bottom: 3pt; margin: 14pt 0 6pt; }
h3 { font-size: 11pt; margin: 9pt 0 2pt; }
p { margin: 2pt 0; }
ul { margin: 3pt 0 4pt 16pt; padding: 0; }
li { margin: 1.5pt 0; }
a { color: inherit; text-decoration: none; }
</style></head><body>${out.join("\n")}</body></html>`;
}

function render(html: string, pdf: string): Promise<boolean> {
  const root = careerOpsRoot();
  const htmlFile = `${pdf}.html`;
  fs.writeFileSync(htmlFile, html);
  const script = `
const { chromium } = require(${JSON.stringify(path.join(/* turbopackIgnore: true */ root, "node_modules", "playwright"))});
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file://" + process.argv[1]);
  await p.pdf({ path: process.argv[2], format: "Letter", printBackground: true });
  await b.close();
})().catch((e) => { console.error(e && e.message); process.exit(1); });`;
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["-e", script, htmlFile, pdf], { cwd: root, env: process.env, stdio: "ignore" });
    const timer = setTimeout(() => child.kill("SIGKILL"), 90_000);
    child.on("close", (code) => {
      clearTimeout(timer);
      fs.rmSync(htmlFile, { force: true });
      resolve(code === 0 && fs.existsSync(pdf));
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

/** Path to an up-to-date PDF of cv.md, or null when there's no CV or it can't render. */
export async function resumePdf(): Promise<string | null> {
  const root = careerOpsRoot();
  const cv = path.join(/* turbopackIgnore: true */ root, "cv.md");
  if (!fs.existsSync(cv)) return null;
  const outDir = path.join(/* turbopackIgnore: true */ root, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const md = fs.readFileSync(cv, "utf8");
  const name = (/^#\s*(?:CV\s*[-—–:]+\s*)?(.+)$/m.exec(md)?.[1] || "resume")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const pdf = path.join(outDir, `${name || "resume"}-resume.pdf`);
  try {
    if (fs.statSync(pdf).mtimeMs >= fs.statSync(cv).mtimeMs) return pdf;
  } catch {
    /* not rendered yet */
  }
  return (await render(resumeHtml(md), pdf)) ? pdf : null;
}
