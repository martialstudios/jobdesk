#!/usr/bin/env python3
"""Brand career-ops's web UI for a personalized JobDesk.dmg (tools/build-dmg.sh --brand).

    python3 tools/brand_web.py WEB_DIR ICON_PNG

Brand values come from the environment (the brand file, exported by
build-dmg.sh): BRAND_NAME, BRAND_CV_PLACEHOLDER, BRAND_FUN_LINES (JSON),
BRAND_FUN_REVEAL, BRAND_FUN_REVEAL_SECONDS.

What it does, before `npm run build`:
- every *visible* "career-ops" becomes BRAND_NAME. File paths, storage keys,
  package names, URLs and the prompts that drive Claude keep theirs, since
  renaming those would break the app or confuse Claude;
- the "co" logo and the favicon become the JobDesk icon, the sidebar fits the
  longer name, the version pill with its "Report a bug" link is left out;
- the assistant introduces itself by BRAND_NAME;
- the CV box gets BRAND_CV_PLACEHOLDER, skips its review step, and drives the
  JobdeskFun overlay (ui/brand/jobdesk-fun.tsx) until the first results;
- simple screens replace the menu (ui/brand/web/src, new files only): Find
  jobs (home), My list (apply to many, score/tailor a group), a job page that
  leads with strengths, and My resume (form editor, "ask for a change",
  upload, PDF); career-ops's own screens move under Advanced;
- applying with no tailored CV attaches a PDF of their own resume.

Every targeted edit must find its anchor, or this exits 1: a career-ops update
that moves things fails the build instead of shipping a half-branded app.
"""

import base64
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")

# Files whose "career-ops" is instructions to Claude or plumbing, not UI text.
KEEP_FILES = {
    "src/lib/run-prompts.mjs",
    "src/app/api/cv/ingest/route.ts",
    "src/app/api/explore/ai/route.ts",
}
KEEP_DIRS = ("src/lib/core/",)
# "career-ops" as a word: not part of a path, key, flag, package or domain.
NAME = re.compile(r"(?<![A-Za-z0-9_./@:\[-])career-ops(?![A-Za-z0-9_/:-]|\.[A-Za-z0-9])")


def die(msg):
    print(f"brand_web: {msg}", file=sys.stderr)
    sys.exit(1)


def edit(web, rel, old, new, count=1):
    path = os.path.join(web, rel)
    with open(path, encoding="utf-8") as f:
        s = f.read()
    if s.count(old) != count:
        die(f"{rel}: expected {count} of {old[:70]!r}, found {s.count(old)}")
    with open(path, "w", encoding="utf-8") as f:
        f.write(s.replace(old, new))


def main():
    if len(sys.argv) != 3:
        die("usage: brand_web.py WEB_DIR ICON_PNG")
    web, icon = sys.argv[1], sys.argv[2]
    name = os.environ.get("BRAND_NAME", "").strip()
    placeholder = os.environ.get("BRAND_CV_PLACEHOLDER", "").strip()
    reveal = os.environ.get("BRAND_FUN_REVEAL", "👀")
    try:
        lines = json.loads(os.environ.get("BRAND_FUN_LINES", "[]"))
        reveal_secs = float(os.environ.get("BRAND_FUN_REVEAL_SECONDS", "2"))
    except ValueError as e:
        die(f"BRAND_FUN_LINES / BRAND_FUN_REVEAL_SECONDS: {e}")
    for label, value in (("BRAND_NAME", name), ("BRAND_CV_PLACEHOLDER", placeholder)):
        if not value:
            die(f"{label} is empty")
        if re.search(r"[\"'`\\$<>{}]", value):
            die(f"{label} can't contain \" ' ` \\ $ < > {{ }} (use a curly ’ for apostrophes)")
    if not lines or not all(isinstance(l, list) and len(l) == 2 and isinstance(l[0], str) for l in lines):
        die("BRAND_FUN_LINES must be a JSON list of [text, seconds] pairs")

    # 1. Targeted edits first, while their anchors still say career-ops.
    edit(web, "src/app/layout.tsx",
         'title: "career-ops — official web experience",', f'title: "{name}",')
    edit(web, "src/app/layout.tsx",
         'description: "The official, local-first web experience for career-ops.",', f'description: "{name}",')
    edit(web, "src/app/api/assistant/route.ts",
         "You are the career-ops assistant —",
         f"You are the {name} assistant (always call this app “{name}”, never by the name of the "
         "open-source project it's built on; talk like a friendly person, never mention files, YAML, "
         "Markdown, modes or commands, and call the CV \"your resume\") —")
    # The sidebar and mobile header: the long name at a size that fits.
    edit(web, "src/components/app-shell.tsx",
         "relative -top-px text-2xl font-normal tracking-tight text-landing",
         "relative text-lg leading-tight font-normal tracking-tight text-landing")
    edit(web, "src/components/mobile-nav.tsx",
         "relative -top-px text-xl text-landing", "relative text-base leading-tight text-landing")
    # The version pill + "Report a bug" (a career-ops GitHub link) stays out,
    # and the overlay goes in.
    edit(web, "src/components/app-shell.tsx", "        <BetaBanner />\n",
         "        <JobdeskFun />\n        <TaskRunner />\n")
    edit(web, "src/components/app-shell.tsx",
         'import { BetaBanner } from "@/components/beta/beta-banner";',
         'import { JobdeskFun } from "@/components/jobdesk-fun";\nimport { TaskRunner } from "@/components/jobdesk/tasks";')
    # career-ops's first-score popup leads with the raw grade; the job page
    # leads with strengths instead.
    edit(web, "src/components/app-shell.tsx", "        <FirstScoreView />\n", "")
    edit(web, "src/components/app-shell.tsx",
         'import { FirstScoreView } from "@/components/explore/first-score-view";\n', "")

    # The sidebar's worker list (raw scores, token counts, dollar costs) and
    # usage meter are power-user detail; My list and the job page show
    # progress in plain words instead.
    edit(web, "src/components/app-shell.tsx", "          <WorkerPills />\n", "")
    edit(web, "src/components/app-shell.tsx", "            <UsageMeter />\n", "")
    edit(web, "src/components/mobile-nav.tsx", "          <WorkerPills />\n", "")
    edit(web, "src/components/mobile-nav.tsx", "          <UsageMeter />\n", "")

    # The simple screens (ui/brand/web/src, added as new files: career-ops's
    # own screens stay intact under Advanced). Find jobs is home once there's
    # a resume; a saved resume lands there.
    edit(web, "src/lib/nav-items.ts",
         '''  { href: "/", label: "Today", icon: LayoutDashboard },
  { href: "/explore", label: "Explore", icon: Compass, chip: "New" },
  { href: "/pipeline", label: "Pipeline", icon: ListChecks },
  { href: "/followups", label: "Follow-ups", icon: Send },
  { href: "/portals", label: "Portals", icon: Radar },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/cv", label: "CV", icon: FileText },
  { href: "/config", label: "Config", icon: Settings },
''', '''  { href: "/find", label: "Find jobs", icon: Compass },
  { href: "/my-list", label: "My list", icon: ListChecks },
  { href: "/resume", label: "My resume", icon: FileText },
  { href: "/advanced", label: "Advanced", icon: Settings },
''')
    edit(web, "src/app/page.tsx", '  if (phase === "first-run") return <FirstRunHome />;\n',
         '  if (phase === "first-run") return <FirstRunHome />;\n  redirect("/find");\n')
    edit(web, "src/app/page.tsx", 'import { FirstRunHome } from "@/components/home/first-run-home";',
         'import { FirstRunHome } from "@/components/home/first-run-home";\nimport { redirect } from "next/navigation";')
    edit(web, "src/components/cv/cv-ingest.tsx",
         '    router.push(`/explore?${qs}${qs ? "&" : ""}run=1`);', '    router.push(`/find?${qs}${qs ? "&" : ""}run=1`);')
    # Applying to a job with no tailored CV attaches their own resume (a PDF
    # made from it) rather than nothing.
    edit(web, "src/app/api/apply/fill/route.ts",
         "(application ? null : await resolveTailoredCv(companyFromTitle(session?.title))) ?? undefined;",
         "(application ? null : await resolveTailoredCv(companyFromTitle(session?.title))) ?? (await resumePdf()) ?? undefined;")
    edit(web, "src/app/api/apply/fill/route.ts",
         'import { resolveTailoredCv, companyFromTitle } from "@/lib/apply/cv";',
         'import { resolveTailoredCv, companyFromTitle } from "@/lib/apply/cv";\nimport { resumePdf } from "@/lib/jobdesk/resume-pdf";')
    # The logo: the JobDesk icon instead of "co".
    comark = os.path.join(web, "src/components/co-mark.tsx")
    with open(comark, encoding="utf-8") as f:
        src = f.read()
    m = re.search(r"export function CoMark\(\{ size = (\d+) \}: \{ size\?: number \}\) \{.*?\n\}\n", src, re.S)
    if not m:
        die("src/components/co-mark.tsx: CoMark not found")
    src = src[:m.start()] + (
        f"export function CoMark({{ size = {m.group(1)} }}: {{ size?: number }}) {{\n"
        "  // eslint-disable-next-line @next/next/no-img-element\n"
        '  return <img src="/jobdesk-mark.png" alt="" aria-hidden="true" width={size} height={size} '
        'className="shrink-0 rounded-md" />;\n'
        "}\n") + src[m.end():]
    src = re.sub(r"^import \{ instrumentSerif \} from \"@/lib/fonts\";\n", "", src, flags=re.M)
    with open(comark, "w", encoding="utf-8") as f:
        f.write(src)
    shutil.copyfile(icon, os.path.join(web, "public", "jobdesk-mark.png"))
    with open(icon, "rb") as f:
        png = base64.b64encode(f.read()).decode()
    with open(os.path.join(web, "src/app/icon.svg"), "w", encoding="utf-8") as f:
        f.write('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
                'viewBox="0 0 64 64"><image width="64" height="64" '
                f'xlink:href="data:image/png;base64,{png}"/></svg>\n')

    # The home page's CV box.
    cv = "src/components/cv/cv-ingest.tsx"
    edit(web, cv, "Paste your CV here — or drop a PDF / .md file below. Even a rough paste works; we'll clean it up.",
         placeholder)
    edit(web, cv, 'import { useCallback, useRef, useState } from "react";',
         'import { useCallback, useEffect, useRef, useState } from "react";')
    edit(web, cv, '''    setPhase("parsing");
    setTrace("Reading your CV…");''', '''    setPhase("parsing");
    autoSaved.current = false;
    window.dispatchEvent(new CustomEvent("jobdesk:fun", { detail: "start" }));
    setTrace("Reading your CV…");''')
    edit(web, cv, '''  const fileRef = useRef<HTMLInputElement>(null);
''', '''  const fileRef = useRef<HTMLInputElement>(null);
  const autoSaved = useRef(false);
''')
    edit(web, cv, "  // ── INPUT ──\n", '''  // JobDesk: no review step. A read CV is saved and the first scan starts right
  // away, with the JobdeskFun overlay up. Back at review means that save failed:
  // then the overlay steps aside so the error shows (and it never loops).
  useEffect(() => {
    if (phase === "error") {
      window.dispatchEvent(new CustomEvent("jobdesk:fun", { detail: "stop" }));
    } else if (phase === "review") {
      if (autoSaved.current) {
        window.dispatchEvent(new CustomEvent("jobdesk:fun", { detail: "stop" }));
      } else {
        autoSaved.current = true;
        void save();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── INPUT ──
''')
    # The empty pipeline's Terminal tip means nothing to someone who never opens Terminal.
    pipe = os.path.join(web, "src/components/pipeline-view.tsx")
    with open(pipe, encoding="utf-8") as f:
        s = f.read()
    s2, n = re.subn(r"\n\s*<p className=\"mx-auto mt-4 max-w-sm text-xs text-muted\">\s*Prefer the terminal\?.*?</p>",
                    "", s, count=1, flags=re.S)
    if n != 1:
        die("src/components/pipeline-view.tsx: the Terminal tip wasn't found")
    with open(pipe, "w", encoding="utf-8") as f:
        f.write(s2)

    # career-ops (1.35+) won't evaluate a job until config/profile.yml exists.
    # Start it from the CV with career-ops's own merge-safe writer (/api/profile,
    # what the assistant's setProfile uses): name, email, location, target roles.
    edit(web, cv, "    onSaved?.();\n", '''    try {
      const who = md.match(/^#\\s*(?:CV\\s*[-—–:]+\\s*)?(.+)$/m)?.[1]?.trim();
      const email = md.match(/[\\w.+-]+@[\\w-]+\\.[\\w.-]+/)?.[0];
      const roles = seed?.roles?.length ? seed.roles : seed?.title ? [seed.title] : undefined;
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: who, email, location: seed?.location || undefined, roles }),
      });
      // Then, in the background, Claude makes the rest of the profile theirs
      // (real contact details, targeting that fits): /api/jobdesk/personalize.
      void fetch("/api/jobdesk/personalize", { method: "POST" }).catch(() => {});
    } catch {
      /* the assistant can still set it up */
    }
    onSaved?.();
''')

    # The first scan's end, whatever it found: the overlay's cue.
    edit(web, "src/components/explore/explore-provider.tsx",
         '  const [phase, setPhase] = useState<Phase>("idle");\n',
         '''  const [phase, setPhase] = useState<Phase>("idle");
  useEffect(() => {
    if (phase !== "idle" && phase !== "casting" && phase !== "scanning") {
      window.dispatchEvent(new CustomEvent("jobdesk:fun", { detail: "done" }));
    }
  }, [phase]);
''')
    # The scan's progress for the overlay's bar: each board counts the same,
    # a finished board as 1, a running one as companies scanned / total.
    edit(web, "src/components/explore/explore-provider.tsx",
         "  const [matchCount, setMatchCount] = useState(0);\n",
         '''  const [matchCount, setMatchCount] = useState(0);
  useEffect(() => {
    const all = Object.values(sources);
    if (!all.length) return;
    const fraction = all.reduce((sum, s) => {
      if (!s) return sum;
      if (s.state === "swept" || s.state === "noisy") return sum + 1;
      return sum + (s.total ? Math.min(1, (s.done ?? 0) / s.total) : 0);
    }, 0) / all.length;
    window.dispatchEvent(new CustomEvent("jobdesk:fun", { detail: { kind: "progress", fraction, found: matchCount } }));
  }, [sources, matchCount]);
''')
    # The home page's intro talks about .md files and setting up an AI in
    # Config; JobDesk has done that, so it just says what to do.
    home = os.path.join(web, "src/components/home/first-run-home.tsx")
    with open(home, encoding="utf-8") as f:
        s = f.read()
    s2, n = re.subn(r"(<p className=\"mt-4 max-w-xl[^\"]*\">)\s*No account\..*?(</p>)",
                    r"\1\n            Drop your resume (a PDF is fine) or paste it, then press Read my CV. Finding jobs "
                    r"is free; scoring one uses a little AI.\n          \2", s, count=1, flags=re.S)
    if n != 1:
        die("src/components/home/first-run-home.tsx: the intro paragraph wasn't found")
    with open(home, "w", encoding="utf-8") as f:
        f.write(s2)

    # JobDesk's start page shows its title for a moment while it redirects.
    edit(web, "public/jobdesk-start.html", "<title>JobDesk</title>", f"<title>{name}</title>")

    # 2. The simple screens and the overlay: new files only, never over career-ops's.
    tree = os.path.join(ROOT, "ui", "brand", "web")
    for dirpath, _, files in os.walk(tree):
        for fn in files:
            src = os.path.join(dirpath, fn)
            rel = os.path.relpath(src, tree)
            dst = os.path.join(web, rel)
            if os.path.exists(dst):
                die(f"{rel} already exists in this career-ops version; JobDesk won't overwrite it")
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(src, dst)
    try:
        dots = json.loads(os.environ.get("BRAND_FUN_DOTS", "[]"))
    except ValueError as e:
        die(f"BRAND_FUN_DOTS: {e}")
    if not isinstance(dots, list) or not all(isinstance(d, str) for d in dots):
        die("BRAND_FUN_DOTS must be a JSON list of lines")
    fun = {"lines": [[t, s] for t, s in lines], "reveal": reveal, "revealSeconds": reveal_secs, "dots": dots}
    with open(os.path.join(web, "src", "lib", "jobdesk-brand.ts"), "w", encoding="utf-8") as f:
        f.write("// Written by JobDesk's tools/brand_web.py from the brand file.\n")
        f.write("export const JOBDESK_BRAND_NAME = " + json.dumps(name, ensure_ascii=False) + ";\n")
        f.write("export const JOBDESK_FUN: { lines: [string, number | null][]; reveal: string; "
                "revealSeconds: number; dots: string[] } = " + json.dumps(fun, ensure_ascii=False) + ";\n")

    # 3. Every other visible "career-ops".
    total = 0
    for dirpath, _, files in os.walk(os.path.join(web, "src")):
        for fn in files:
            if not fn.endswith((".ts", ".tsx", ".mjs", ".js")):
                continue
            path = os.path.join(dirpath, fn)
            rel = os.path.relpath(path, web).replace(os.sep, "/")
            if rel in KEEP_FILES or rel.startswith(KEEP_DIRS):
                continue
            with open(path, encoding="utf-8") as f:
                s = f.read()
            s2, n = NAME.subn(name, s)
            if n:
                total += n
                with open(path, "w", encoding="utf-8") as f:
                    f.write(s2)
    print(f"brand_web: renamed {total} mentions to {name!r}")


if __name__ == "__main__":
    main()
