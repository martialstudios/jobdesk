"use client";

// JobDesk branded builds: a back button at the top of every page (the app
// is a window with no browser toolbar). With nothing to go back to, Find jobs.
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/" || pathname === "/welcome") return null;
  return (
    <div className="px-5 pt-4 md:px-8">
      <button
        onClick={() => (window.history.length > 1 ? router.back() : router.push("/find"))}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm text-muted hover:border-brand/40 hover:text-foreground"
        style={{ background: "var(--bg)" }}
      >
        <ArrowLeft className="size-4" /> Back
      </button>
    </div>
  );
}
