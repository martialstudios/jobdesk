// JobDesk branded builds: the original screens, for anyone who wants them.
import Link from "next/link";
import { instrumentSerif } from "@/lib/fonts";

export const dynamic = "force-dynamic";

const SCREENS: [string, string, string][] = [
  ["/explore", "Detailed job search", "Every search setting: job boards, how far back, scan depth, AI search."],
  ["/pipeline", "Tracker", "Every job you've scored, with its status and full report."],
  ["/followups", "Follow-ups", "When to check in on applications you've sent."],
  ["/portals", "Company list", "The companies the job search watches."],
  ["/analytics", "Analytics", "How your search is going over time."],
  ["/cv", "Resume (raw text)", "Your resume as the plain text the AI reads."],
  ["/config", "Settings", "Which AI helper is used, and other settings."],
];

export default function AdvancedPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 md:px-8">
      <h1 className={`${instrumentSerif.className} text-4xl text-landing`}>Advanced</h1>
      <p className="mt-2 text-muted">The detailed screens. You don&apos;t need any of these to find jobs and apply.</p>
      <ul className="mt-6 flex flex-col gap-2.5">
        {SCREENS.map(([href, label, desc]) => (
          <li key={href}>
            <Link href={href} className="block rounded-2xl border border-border p-4 transition hover:border-brand/40">
              <div className="font-medium text-foreground">{label}</div>
              <div className="mt-0.5 text-sm text-muted">{desc}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
