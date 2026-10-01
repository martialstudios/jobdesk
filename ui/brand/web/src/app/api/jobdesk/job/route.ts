// JobDesk branded builds: one scored job, in plain language (lib/jobdesk/report.ts).
import { findApplication, readReport, pdfReadyForReport } from "@/lib/career-ops";
import { parseReport } from "@/lib/jobdesk/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const n = new URL(req.url).searchParams.get("n") || "";
  if (!/^\d+$/.test(n)) return Response.json({ error: "no such job" }, { status: 400 });
  const report = readReport(n);
  if (!report) return Response.json({ error: "no such job" }, { status: 404 });
  const app = findApplication(n);
  const insight = parseReport(report.content);
  return Response.json({
    n,
    ...insight,
    company: app?.company || insight.company,
    role: app?.role || insight.role,
    status: app?.status || "",
    tailored: await pdfReadyForReport(n),
  });
}
