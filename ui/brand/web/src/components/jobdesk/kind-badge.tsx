// JobDesk branded builds: how a job's application gets done, at a glance
// (apply-kind.ts): Auto-apply / Auto-fill · you send / On their site.
import { Copy, Wand2 } from "lucide-react";
import { applyKind } from "./apply-kind";

export function KindBadge({ url, ats, className = "" }: { url: string; ats?: string; className?: string }) {
  const kind = applyKind(url, ats);
  if (kind === "auto")
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] text-brand-text ${className}`} title="The app fills in and sends this application for you (after you approve)">
        <Wand2 className="size-3" /> Auto-apply
      </span>
    );
  if (kind === "assist")
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-700 dark:text-sky-300 ${className}`} title="The app writes every answer; you paste them into the form in your Chrome and send it">
        <Copy className="size-3" /> Auto-fill · you send
      </span>
    );
  return (
    <span className={`rounded-full bg-surface px-2 py-0.5 text-[11px] text-muted ${className}`} title="This company's own site, with an account first: you apply there">
      On their site
    </span>
  );
}
