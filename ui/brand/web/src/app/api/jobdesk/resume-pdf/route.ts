// JobDesk branded builds: download the person's own resume as a PDF.
import fs from "node:fs";
import path from "node:path";
import { resumePdf } from "@/lib/jobdesk/resume-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const pdf = await resumePdf();
  if (!pdf) return Response.json({ error: "Couldn't make a PDF of your resume." }, { status: 500 });
  return new Response(new Uint8Array(fs.readFileSync(pdf)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${path.basename(pdf)}"`,
    },
  });
}
