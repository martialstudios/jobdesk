"use client";

// JobDesk branded builds: one job she sends from her own Chrome (Ashby, or a
// form that flagged the app's send as spam). The app reads the form, drafts
// every answer from her resume and My info, and lays them out to copy.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { instrumentSerif } from "@/lib/fonts";
import type { ApplyField } from "@/lib/apply/extract";
import { BrandLogo, prettyCompany } from "./brand-logo";
import { CopyPanel } from "./copy-panel";
import { draftOnly } from "./draft";

export function AssistView() {
  const sp = useSearchParams();
  const url = sp.get("url") || "";
  const title = sp.get("title") || "";
  const company = sp.get("company") || "";
  const n = sp.get("n") || undefined;
  const [state, setState] = useState<{ fields: ApplyField[]; answers: Record<string, string> } | { error: string } | null>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    void draftOnly(url).then((d) => live && setState(d));
    return () => {
      live = false;
    };
  }, [url]);

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 md:px-8">
      <div className="flex items-center gap-3">
        <BrandLogo name={prettyCompany(company)} size={44} />
        <div>
          <h1 className={`${instrumentSerif.className} text-3xl text-landing md:text-4xl`}>{title || "Apply"}</h1>
          <p className="text-muted">{prettyCompany(company)}</p>
        </div>
      </div>
      {!state && (
        <p className="mt-8 flex items-center gap-2 text-muted">
          <Loader2 className="size-4 animate-spin" /> Reading the form and writing your answers… (about 20 seconds)
        </p>
      )}
      {state && "error" in state && <p className="mt-8 rounded-xl bg-amber-500/10 p-4 text-amber-800 dark:text-amber-200">{state.error}</p>}
      {state && !("error" in state) && <CopyPanel url={url} company={company} n={n} fields={state.fields} answers={state.answers} />}
    </div>
  );
}
