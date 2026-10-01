# CLAUDE.md — JobDesk (standalone; assume you've read nothing else)

JobDesk is a one-line Mac installer plus a Mac app for the web UI of
[career-ops](https://github.com/career-ops-hq/career-ops), an open-source AI
job-search system. Paste in job links and career-ops scores each one against
your CV, writes a tailored CV and cover letter per company, fills in the
application form for you to review, and tracks every application.

- **Owner:** `martialstudios` (a personal GitHub account, not an org).
- **Who it's for:** the owner and a friend, each on their own Mac with their
  own AI account. Their data is never shared.
- **Origin:** built 2026-09-27/28 in a Claude Code cloud session.

---

## ⏱️ Status (read first)

- **0.2.0 adds the DMG edition** (2026-09-28; see "The DMG edition" below).
  - `tests/dmg-e2e.sh` passes on an Apple Silicon Mac for both halves, arm64
    and x64 (the latter under Rosetta). The real app was also driven by hand:
    progress window, browser opening, quit after `stop`, the "move to
    Applications" dialog.
  - Not yet done: a build with the owner's real key tried against Anthropic,
    and an Intel Mac or the "Open Anyway" flow on a second Mac.

- **Version 0.1.0 is code complete.** The first publish goes to the empty repo
  `martialstudios/jobdesk`, as a PR onto an empty root commit on `main`.
  - The owner has to create that repo. The Claude GitHub App gets
    `403 Resource not accessible by integration` on `POST /user/repos`, so a
    session can't create repos.
- **Tested so far:**
  - `tests/unit.sh`: 99 checks, all passing on bash 5.2 (Linux) and on
    macOS's own `/bin/bash` 3.2.57.
  - `tests/e2e.sh`: passes on Linux, and on a real Apple Silicon Mac
    (macOS 26, 2026-09-28): the full app check (`osacompile`, `plutil`,
    `codesign`, launching via `open`, quitting when idle) and the update from
    career-ops 1.33.0 to 1.34.0.
  - Three rounds of adversarial testing found about 25 defects. All are fixed,
    and the last round found nothing.
  - Concurrency stress test: 3 simultaneous starts, 0 of 12 rounds ended with
    two servers.
- **The first real-Mac run found two bugs** (both fixed):
  - macOS's `$TMPDIR` ends in `/`, so temp paths carried `//`. Every
    `mktemp -d` now strips it.
  - A `stop` landing while the app's `open` was still waiting for the server
    made `start` report a failure. The applet then showed a modal "couldn't
    start" dialog, which blocks `on idle`, so it never quit. Now `stop` marks
    the pid it takes down (`run/stopping`). `start` then exits with code 3
    (`EXIT_STOPPED`), and the applet quits quietly on 3.
- **Not yet run:** Intel Macs.

---

## What the user gets

```
curl -fsSL https://raw.githubusercontent.com/martialstudios/jobdesk/main/install.sh | bash
```

This one line, pasted into Terminal, installs everything with no sudo:
1. git. If it's missing, Apple's Command Line Tools install prompt appears.
2. Its own copy of Node 24 in `~/.jobdesk`, checked against nodejs.org's SHA-256.
3. career-ops, cloned at its latest release tag into `~/career-ops`. The user's
   CV, tracker, reports and PDFs live here.
4. career-ops's official web UI, built from **the same release tag** into
   `~/.jobdesk/ui` and pointed at `~/career-ops` via `CAREER_OPS_ROOT`.
5. The AI tool the user picks: Claude Code (Anthropic's official installer),
   Codex (`@openai/codex`), or Gemini CLI (`@google/gemini-cli`). The last two
   go into `~/.jobdesk/tools`. The installer then offers to log in and checks
   the login.
6. `JobDesk.app` in `/Applications` (or `~/Applications`), compiled **on the
   user's Mac** with `osacompile`.

Running the same line again, or `jobdesk update`, updates and repairs.

The app is a stay-open AppleScript applet:
- Clicking it runs `jobdesk open`, which starts the local server and opens the
  browser.
- Quitting it from the Dock runs `jobdesk stop`.
- Every 30 s its `on idle` handler runs `jobdesk alive` and quits if the server
  is gone.

The career-ops web UI (Next.js, alpha) provides:
- a pipeline and tracker
- per-job evaluation reports and 1–5 scores
- tailored CV and cover-letter PDFs
- Apply: prefills the application form in Google Chrome and **never
  submits**. That is a hard career-ops rule, kept on purpose.
- a built-in assistant for onboarding

---

## Architecture decisions (don't relitigate)

- **Named "JobDesk", not "career-ops-something".** career-ops's `TRADEMARK.md`
  requires permission for product names containing "career-ops". JobDesk says
  it "works with" career-ops and is unaffiliated.
- **Use career-ops's official web UI (`web/`), with one small patch.** Don't fork
  it, and don't use the community GUIs (small, and third-party code touching CVs).
  - Since 2026-09-29, one line is patched at build time (`patch_web_ui` in
    `install.sh`). The owner's non-technical test found drop-CV-to-results far
    too slow, so the first scan after saving a CV skips Workday. Its boards sit
    behind one host and took ~5 of ~6 minutes, with nothing shown until every
    board finished; without it, results arrive in ~1 minute. Workday is still
    in "Refine search".
  - The DMG build refuses to finish if the line changed; the Terminal installer
    warns and builds unpatched. Keep any further patches this small and checked.
- **JobDesk's start page** (`ui/jobdesk-start.html`, added as a static file in
  `web/public/`). career-ops keeps the chosen AI CLI in the browser's
  localStorage, and its PDF CV import doesn't fall back to the only installed
  CLI: without a choice it sends people to Config first.
  - `jobdesk open` opens `/jobdesk-start.html?cli=$JOBDESK_AI`, which saves that
    choice when none exists yet, then goes to `/`.
  - Next.js only indexes `public/` at server start, so a running server needs a
    restart to serve a newly added start page.
- **JobDesk keeps its own copy of `web/`.** It's extracted from the career-ops
  release tag matching the core's `VERSION`, and run with `CAREER_OPS_ROOT`
  pointing at the user's checkout. Why:
  - career-ops's updater (`update-system.mjs`) does not update `web/`.
  - Building inside the user's checkout would dirty it.
  - A missing tag is fetched into a **throwaway bare repo** under the
    installer's temp dir. The user's repo is only ever read, which keeps a full
    clone from turning into a shallow one.
- **career-ops is installed and updated its own documented way.**
  - Install is `git clone --depth=1 --branch career-ops-vX.Y.Z`, the same as
    `npx @santifer/career-ops init`. It goes into a sibling
    `.career-ops.jobdesk-partial.<pid>` folder and is renamed into place only
    once complete.
  - Updates run `node update-system.mjs apply --confirm`. That touches system
    files only, never `cv.md`, `data/`, `reports/` or `output/`.
  - If the Mac has no git identity, the updater gets `GIT_AUTHOR_*` and
    `GIT_COMMITTER_*` variables for that one run; their git config is never
    changed.
- **Private Node, no Homebrew, no sudo.** `GIT_TERMINAL_PROMPT=0` is set so git
  can never hang on a password prompt.
- **The app is compiled on the user's Mac, not downloaded.** Gatekeeper
  therefore never quarantines it, with no notarization needed. After editing
  the icon and Info.plist it gets an ad-hoc `codesign`.
  - The applet has **no properties or globals**. An applet saves those into
    itself on quit, which breaks its signature.
  - The `jobdesk` path lives in a handler.
- **The server:**
  - `next start -H 127.0.0.1` on port 4788, or the next free one.
  - It runs in its own process group (`set -m`).
  - `stop` signals every process group led by a process in the server's
    descendant tree. This matters because the web UI starts Codex runs
    detached.
  - Health checks use `curl --noproxy '*'`.
- **Locks and PID files:**
  - Locks are **symlinks** whose target is `pid|start time`, so creating one is
    atomic. A stale one is removed only if it still names the same dead owner.
  - The server's PID file holds `pid\nstart time`.
  - Start times come from `LC_ALL=C TZ=UTC0 ps -o lstart=`, which doesn't vary
    with locale or time zone.
- **Uninstall deletes only what JobDesk owns.** That is the fixed
  `OWNED_ENTRIES` list inside a folder carrying the `.jobdesk-home` marker. It
  compares physical paths, and refuses outright if the career-ops folder, or
  anything that looks like career-ops data (`cv.md`,
  `*/data/applications.md`), is inside `~/.jobdesk`. It never deletes
  `~/career-ops` or Claude Code.
- **Paths are normalized** (`normalize_path`): symlinks are resolved in the part
  that exists, and `..`, `.` and `//` lexically in the rest. Any folder
  comparison has to go through it.
- **Everything is bash 3.2** (macOS `/bin/bash`), shellcheck-clean and BSD-tool
  safe. So no `sed -i`, `readlink -f`, `timeout`, `sort -V`, associative arrays
  or `$BASHPID`, and no empty arrays under `set -u`.
- **The Playwright MCP is not set up.** The web UI's apply flow uses its own
  Playwright and Chrome; only the CLI `apply` mode would use the MCP. PDFs need
  Playwright's Chromium, which is installed via `npx playwright install
  chromium` and is non-fatal.

## The DMG edition (0.2.0): no Terminal, no logins

Asked for by the owner on 2026-09-28: a non-technical friend has to be able to
open JobDesk and use it straight away, with no Terminal, no git or developer
tools prompt, no downloads and no AI login. `tools/build-dmg.sh` builds
`dist/JobDesk-<version>.dmg` on the owner's Mac.

- **Claude access is the owner's Anthropic API key, not their Claude login.**
  (Decided 2026-09-28; don't relitigate.)
  - A Claude Pro/Max login is personal. Anthropic's terms don't allow sharing
    it, and a token baked into a DMG could be pulled out and reused.
  - An API key is the supported way to let others use Claude through your
    account. The owner makes one just for JobDesk, with a Console spend limit,
    and stores it in the Keychain (`jobdesk-anthropic-api-key`).
  - The build reads it from there, never prints it, and writes it only into the
    app's `payload/secrets.env`. Setup copies that to `~/.jobdesk/secrets.env`
    (mode 600). `bin/jobdesk`'s `dmg_server_env` exports it to the server only.
  - **The key is extractable from the DMG.** So the DMG is shared privately and
    never published, CI builds use a fake key, and the key never enters the repo.
- **No local model.** career-ops runs Claude Code as a file-editing agent. Models
  that fit a typical 8–16 GB Mac are too weak for that, and they'd mean a
  5–20 GB download.
- **Unsigned, with a one-time "Open Anyway".** The owner chose not to buy an
  Apple Developer ID ($99/yr) for now. The app is ad-hoc signed, so on first
  open macOS blocks it until the user clicks Open Anyway in System Settings →
  Privacy & Security. `assets/dmg/How to open JobDesk.png`
  (`tools/make_dmg_guide.py`) walks them through it. With a Developer ID,
  add signing and notarization to `build-dmg.sh` and the guide goes away.
- **Universal, with everything pre-built.** The app's `Contents/Resources/payload/`
  holds `common.tar.gz` (a career-ops release checkout with `node_modules`, plus
  the built web UI) and `arm64.tar.gz` / `x64.tar.gz` (Node, the Claude Code
  binary, Playwright's headless Chromium). Everything is checksum-verified at
  build time.
  - The web UI is built once, then `npm prune --omit=dev`, with the SWC
    compiler and `.next/cache` removed. The other architecture's `sharp`
    binaries are added with `npm pack`.
  - A moved `.next` build runs fine (checked 2026-09-28).
  - The Intel headless Chromium comes via
    `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=mac15`.
- **First open runs `macos/dmg-setup.sh`**, via the applet →
  `Contents/Resources/launch setup-start`. It sources `install.sh`'s helpers
  (locks, paths, `write_config`, `install_jobdesk_files`) and lays out the same
  `~/.jobdesk` + `~/career-ops` as the Terminal install. It reports
  `PERCENT|what` to a status file, which the applet shows in its progress window.
  - It never replaces an existing career-ops folder.
  - It strips quarantine from what it unpacked; the app itself was already
    approved.
  - It writes `.dmg-build`, so a newer DMG sets up again, keeping the user's data.
- **git shim.** On a Mac without Apple's developer tools, `/usr/bin/git` pops up
  their install dialog. career-ops's `/api/version`, its doctor (called by the
  home page) and Claude Code all call git by name. So `~/.jobdesk/shims/git` is
  first on the server's PATH. It runs a real git if there is one, and otherwise
  answers "not installed" without a dialog.
- **Claude Code settings live in `~/.jobdesk/claude`** (`CLAUDE_CONFIG_DIR`), with
  `DISABLE_AUTOUPDATER=1`, so uninstall removes them and the bundled binary
  never changes.
- **In the DMG edition, `jobdesk update` and `login` only explain themselves.**
  Updating means a newer DMG. `JOBDESK_EDITION=dmg` in `config.env` marks it.
- **The applet refuses to run from the disk image** (`/Volumes/…`) or from a
  translocated path, and asks the user to drag it to Applications first.
- **Size:** about 500 MB DMG, about 550 MB app, about 1 GB unpacked for one
  architecture. First-run setup takes about 15–30 s.
- **Known limits:**
  - A web UI error for a revoked, exhausted or wrong key reads "(no output — is
    the CLI authenticated?)". The owner checks the Console.
  - A newer DMG doesn't update an existing `~/career-ops`'s system files (that
    needs git); only the web UI, Node and Claude Code move forward.
  - The Apply feature still needs Google Chrome installed.

## Brand builds (2026-09-29)

`tools/build-dmg.sh --brand=brands/<name>.env` builds a personalized DMG for
one person. The owner's first one is `brands/asal.env` ("Asal’s Amazing Job
Application Software From Ryan"). It's git-ignored because it's personal, so
it lives only on the owner's Mac.

- **`tools/brand_web.py`** rebrands career-ops's web UI before it's built.
  - Every *visible* "career-ops" becomes the brand name. File paths, storage
    keys, URLs and the prompts that drive Claude are kept; Claude is told to
    use the brand name.
  - The "co" logo and favicon become the app icon, the version pill and its
    "Report a bug" link are dropped, and the home intro and the empty-pipeline
    Terminal tip are rewritten.
  - Each targeted edit must find its anchor, or the build fails.
- **The CV-to-results overlay.** `ui/brand/jobdesk-fun.tsx` is mounted in the
  app shell and driven by `jobdesk:fun` window events. cv-ingest sends
  `start`, and in brand builds skips its review step (auto-saves once);
  explore-provider sends `done`, and an error sends `stop`.
  - Scripted lines come from `BRAND_FUN_LINES`. A last `null`-duration line
    holds until the results are in, then `BRAND_FUN_REVEAL` shows briefly.
  - Measured on Asal's build: 0/2/4/6/16 s as scripted, 👀 at 47 s, 101 roles
    at 49 s.
- **The rest of the app is branded too.** The app name (bundle name, file
  name, every applet dialog: the build substitutes "JobDesk" in the
  AppleScript's strings, so no handler name may contain "JobDesk"), the disk
  image name, and the picture guide (`make_dmg_guide.py --name --from`).
- **Simple screens** (`ui/brand/web/src`, 2026-10-01; replace the "next step"
  card from PR #5). The owner's non-technical test: evaluation as the focal
  point was slow and cluttered, YAML and Markdown were everywhere, and there
  was no way to act on many jobs at once.
  - They are new files only; `brand_web.py` refuses to overwrite career-ops's.
    career-ops's own screens stay reachable under **Advanced**.
  - **Find jobs** (`/find`, home once there's a resume; `/` redirects there).
    career-ops's free scan, best fits first (by career-ops's own title-vs-profile
    `fit` band), "only near <city> or remote" on by default (falls back to all
    when fewer than 5), a checkbox per job, "Add to my list" or "Add and score
    them".
  - **My list** (`/my-list`, stored in `.career-ops-web/jobdesk-list.json`).
    - **Apply to these** walks through the jobs one at a time: career-ops's
      apply opens the real form pre-filled, she submits it herself, then
      "I submitted it, next" (also sets the tracker to Applied when it was
      scored).
    - **Score / Tailor for a group** goes through `components/jobdesk/tasks.tsx`:
      a localStorage queue worked through by career-ops's own `startJob`, 2
      scorings and 1 tailoring at a time. Tailoring needs a score first.
  - **Job page** (`/job/<n>`) leads with an encouraging match label
    (`match.ts`: Great ≥4.0, Good ≥3.3, Worth a shot ≥2.5, else Stretch role;
    the real number is only inside "Read why"), then where you shine (the
    report's `top_strengths`), how to make your application stronger (section
    E's customization plan), and what they ask for that the resume doesn't
    show yet (`hard_stops`), plus the cover letter draft. Owner's ask: never a
    bare "1/5". Don't inflate numbers; the framing does the encouraging.
  - **My resume** (`/resume`) shows the resume as a document, with four
    actions: **Edit** (a form; bullets shown as •, and lines left unchanged
    keep their exact Markdown), **Ask for a change** (`/api/jobdesk/cv-change`,
    Claude returns a full revision to approve; nothing saves without
    approval), **Upload a new one** (career-ops's CvIngest), and **Download
    PDF** (`lib/jobdesk/resume-pdf.ts`).
  - **Apply attaches her own resume** when there's no tailored CV:
    `/api/apply/fill` falls back to `resumePdf()`, which renders cv.md with
    career-ops's Playwright and is cached until cv.md changes.
- **Profile from the CV.** career-ops 1.35 refuses to evaluate until
  `config/profile.yml`, `modes/_profile.md` and `portals.yml` exist: the
  evaluation agent stops with "setup isn't finished"; 1.34 only warned.
  - Brand builds call `/api/profile` (career-ops's merge-safe writer) when the
    CV is saved: name, email, location, target roles.
  - `dmg-setup.sh` starts the other two from career-ops's own templates, and
    only when they're missing.
  - The plain editions still get the profile from the assistant's onboarding.
- **Her folder** is `~/<BRAND_DATA_DIR>` (via `payload/brand.env`) on a fresh
  install; an existing install keeps its folder.
- **Uninstall** recognizes a renamed app by its bundle id (`is_jobdesk_app`).
- **Still visible after branding:** Claude-written evaluation reports can
  mention career-ops's file names, and the MIT `LICENSE` stays in her folder
  (required).

## Files

| Path | What it is |
|---|---|
| `install.sh` | Installer / updater / repairer. Everything is in functions, with `main "$@"` last. It ends with the marker `__JOBDESK_INSTALLER_END__`, and `jobdesk update` refuses a download without it. |
| `bin/jobdesk` | Control script, installed to `~/.jobdesk/bin` and linked from `~/.local/bin`. Subcommands: `open`, `start`, `stop`, `restart`, `status`, `alive`, `login`, `update`, `doctor`, `logs`, `uninstall`, `version`. It finds its install from its own path. |
| `macos/JobDesk.applescript` | Applet source. `__JOBDESK_BIN__` is replaced at install time. |
| `macos/JobDeskDMG.applescript` | The DMG edition's applet: first-run setup with a progress window, then the same open/idle/quit behavior. |
| `macos/dmg/launch` | Inside the DMG app (`Contents/Resources`): `where`, `needs-setup`, `setup-start`, `setup-status`, and passes everything else to `jobdesk`. A `test-home` file next to it (test builds only) redirects HOME. |
| `macos/dmg-setup.sh` | The DMG edition's first-run setup (see above). `JOBDESK_DMG_ARCH=x64` sets up the Intel parts, for testing under Rosetta. |
| `macos/shims/git` | The git shim. |
| `tools/build-dmg.sh` | Builds `dist/JobDesk-<version>.dmg`. Flags: `--key-file`, `--no-key`, `--test-home`, `--career-ops`. |
| `tools/make_dmg_guide.py`, `assets/dmg/` | The DMG's picture guide. |
| `tests/dmg-e2e.sh` | Builds a test DMG (fake key, throwaway home), copies the app out, runs setup, starts, checks the web UI, the key and PDF browser, re-setup and uninstall. |
| `assets/JobDesk.icns`, `.png` | Icon, rendered by `tools/make_icon.py` (Pillow). |
| `assets/screenshots/*` | README images, taken from career-ops's own sample fixture. |
| `tests/unit.sh` | Offline unit checks; `JOBDESK_SOURCE_ONLY=1` sources the scripts. |
| `tests/e2e.sh` | Real install into a throwaway HOME: start, HTTP checks, re-run, uninstall. On macOS it also checks the app. `E2E_OLD_CAREER_OPS=1.33.0` adds an update test. |
| `.github/workflows/ci.yml` | shellcheck + unit tests (ubuntu); unit + e2e on macOS and ubuntu (macOS under `/bin/bash` 3.2); update test on macOS; the DMG build + DMG e2e on macOS. |

**Settings on the user's Mac:** `~/.jobdesk/config.env`, which the installer
writes with `printf %q` quoting.

**Environment variables:**
- For users: `JOBDESK_HOME`, `JOBDESK_REPO`, `JOBDESK_REF`.
- For tests and power users: `JOBDESK_SRC_DIR`, `JOBDESK_CAREER_OPS_VERSION`,
  `JOBDESK_CAREER_OPS_GIT`, `JOBDESK_NODE_VERSION`, `JOBDESK_ALLOW_ROOT`,
  `JOBDESK_YES`, `JOBDESK_NO_LAUNCH`, `JOBDESK_AI_CHOICE`.

## Testing

```bash
shellcheck -x -s bash install.sh bin/jobdesk tests/*.sh macos/dmg-setup.sh macos/dmg/launch macos/shims/git tools/build-dmg.sh
bash tests/unit.sh                                     # offline, ~20 s
JOBDESK_ALLOW_ROOT=1 bash tests/e2e.sh                 # network, ~50 s; root needs ALLOW_ROOT
/bin/bash tests/dmg-e2e.sh                             # macOS + network, ~8 min (builds the DMG)
```

- **Testing under bash 3.2 on Linux (optional):** the authoritative check is CI,
  which runs everything under the real macOS `/bin/bash` 3.2.
  - For a local check, the 2026-09 session built Apple's bash from
    `https://github.com/apple-oss-distributions/bash`. That repo uses Apple's
    own tag numbers (e.g. `bash-99`); its `bash-3.2` tree is what macOS ships
    as 3.2.57.
  - Building that old C code on Linux needed a few small shims plus permissive
    flags, e.g. `CFLAGS="-std=gnu89 -fcommon -Wno-implicit-function-declaration
    -Wno-implicit-int -Wno-int-conversion"`.
  - GNU's download mirrors are blocked in the cloud sandbox, but `git clone`
    from GitHub works.
  - Then run `/path/to/bash tests/unit.sh`.
- **Cloud sandbox network:**
  - Works: `nodejs.org`, `registry.npmjs.org`, `raw.githubusercontent.com`, and
    `git clone`/`ls-remote` of public GitHub repos.
  - Blocked: `api.github.com`, `codeload.github.com`, GitHub HTTP downloads, and
    Playwright's browser CDN.
  - So in the sandbox, "Installing the browser career-ops uses to make PDFs"
    fails (expected), career-ops's own update check reports offline (expected),
    and `jobdesk update` can't fetch its tarball (use a local checkout).
- **Running as root:** `JOBDESK_ALLOW_ROOT=1` is required.
- **Don't `pkill -f` with a pattern that appears in your own command line.** It
  kills your shell. Kill by PID.

## Hardening history (what's already been adversarially verified)

Three rounds of an adversarial reviewer ran the real code against constructed
states. Everything below was reproduced, fixed, and re-verified; the final
round found nothing.
- **Data safety:**
  - Uninstall with career-ops inside `~/.jobdesk`, reached directly, via `..`
    through a missing folder, or via a symlink.
  - Tampered `config.env`, stale `JOBDESK_APP`, and an old app in a folder that
    isn't writable.
  - A full clone made shallow.
- **Partial failures:**
  - SIGKILL during the clone, `npm ci` or the build, followed by an immediate
    re-run.
  - A failed rebuild, where the previous UI is kept and the server restarted.
  - `ui/current` becoming a real directory.
  - Missing `node_modules`.
  - An unreachable AI installer, which is now a warning.
- **Processes:**
  - Concurrent `start`/`open`, and a `stop` during a start.
  - Stale locks and PID files whose PID is reused, or that are in the old
    format.
  - Time-zone or locale changes between writing and reading a start time.
  - Detached AI runs surviving `stop`.
  - Closing Terminal or Ctrl-C mid-step. Each step runs in its own process
    group, and cleanup escalates to SIGKILL after 3 s.
  - `http_proxy` set.
- **Input and update:**
  - Bad ports, including leading zeros and 20 digits.
  - `--dir=.`, relative `..`, `//`, and a `JOBDESK_HOME` that is `$HOME`,
    inside career-ops, or not empty.
  - Files planted next to a downloaded installer: now it only trusts a git
    checkout.
  - A non-default `JOBDESK_HOME` during update.
  - `--help` when piped.

## Publishing (first time)

1. The owner creates an **empty public** repo at
   `https://github.com/new?owner=martialstudios&name=jobdesk&visibility=public`,
   and gives the Claude GitHub App access at https://claude.ai/connect-github.
2. The session attaches it (`add_repo` with `access: push`) and pushes `main`
   (the empty root commit) plus the feature branch, then opens a **draft PR**
   onto `main`.
3. Get CI green. macOS is where surprises would be: `osacompile -s` output,
   `plutil` keys, `codesign --verify --deep --strict`, the app launching under
   `open` in CI, and the idle quit within 90 s.
   - If `open` can't launch apps on the runner, the e2e prints a warning and
     skips that check.
4. The owner merges. From then on, the one-line install in `README.md` is live.

## Open items / ideas (not started)

- A signed and notarized `.dmg`. It needs an Apple Developer ID ($99/yr); not
  needed today because the app is built locally.
- Intel Mac coverage in CI. The macOS images' labels change over time, so check
  current GitHub runner labels first.
- Scoring the first few scan results automatically, so the first thing a new
  user sees is scored roles. Today they click Evaluate on a role, which spends
  tokens. It would need another web UI patch, and it's a cost decision for the owner.
- Optional Playwright MCP setup, for people who also use career-ops's CLI
  `apply` mode.
- Checking for updates from the app itself.
