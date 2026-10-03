# JobDesk handoff — Asal's build (2026-10-02)

Read this first if you're picking up JobDesk. `CLAUDE.md` is the long-form
reference (architecture, hardening history, the DMG edition); this file says
**what exists now, where it lives, how to ship it, and what's still open.**

## State in one paragraph

`main` builds a personalized Mac app for one person from a brand file. The
owner (Ryan) built one for a friend, **Asal**: *Asal’s Amazing Application
Software from Ryan (AAA)*. It's a native Mac app (WebKit window) around a
rebranded career-ops web UI plus JobDesk's own simple screens. The final DMG
is `~/Downloads/Asal’s Amazing Application Software from Ryan.dmg` on the
owner's Mac. **Asal hasn't been given any version yet**, so the DMG she gets
is her first install; in-app updates take over from there.

## Ship it

```bash
tools/build-dmg.sh --brand=brands/asal.env          # → dist/<BRAND_VOLUME>.dmg
tools/publish-update.sh --brand=brands/asal.env --notes="- What's new"   # only once she has a copy
```

- The Claude key comes from the Keychain item `jobdesk-anthropic-api-key`
  (or `--key-file=PATH`, deleted after the build; never commit or print it).
  The read-only update token comes from Keychain `jobdesk-update-token`.
- **The DMG contains the key**: share it privately, only with her.
- `brands/` is git-ignored (personal files): `asal.env`, her pictures, the
  song. Only `brands/example.env` is tracked and documents every setting.
- Updates: private repo `martialstudios/jobdesk-updates`, channel `asal`,
  releases tagged `asal-<UTC stamp>`. Her app checks a few seconds after
  opening and every 6 h, shows "A new version is ready", and installs in about
  a minute keeping all her data (`macos/updater.mjs`).
- Merge flow: branch → PR → CI (5 jobs incl. a real DMG build + e2e on macOS)
  → merge → verify `main`'s SHA. PRs #8–#21 followed it.

## Test it (the way it was verified)

Install a copy into a throwaway home, never over the owner's real app:

```bash
T=$(mktemp -d); mkdir -p "$T/home" "$T/apps"
MNT=$(hdiutil attach -nobrowse -readonly "dist/<name>.dmg" | tail -1 | awk -F'\t' '{print $NF}')
cp -R "$MNT"/*.app "$T/apps/" && hdiutil detach -quiet "$MNT"
A=$(ls -d "$T"/apps/*.app); printf '%s' "$T/home" > "$A/Contents/Resources/test-home"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.martialstudios.jobdesk.apptest" "$A/Contents/Info.plist"
codesign --force --deep -s - "$A"; open "$A"     # server URL is in $T/home/.jobdesk/logs/server.log
```

- The different bundle ID keeps it from colliding with the owner's installed
  copy. Use a fake resume; **never open or submit a real application form**
  (the Apply buttons do).
- Also: `bash tests/unit.sh`, `bash tests/brand-check.sh` (every brand edit
  still finds its anchor in career-ops 1.35.0, both themes).

## Where everything is

| Feature (what Asal sees) | Code | Setting |
|---|---|---|
| Name everywhere, icon, DMG name | `tools/brand_web.py`, `tools/build-dmg.sh` | `BRAND_NAME`, `BRAND_VOLUME`, `BRAND_ICON` |
| Native app window | `macos/app/main.swift` | — |
| Resume box line ("Ryan says to put your damn resume here…") | `brand_web.py` (cv-ingest edit) | `BRAND_CV_PLACEHOLDER` |
| Loading screen with lines + progress while the resume is read; it holds until the last timed line (the breathing one) has had 4 s, then the quick questions show. The search itself uses Find's own castle-crossing-the-meadow scene. | `ui/brand/web/src/components/jobdesk-fun.tsx`, `components/howl/scene.tsx` | `BRAND_FUN_LINES`, `BRAND_FUN_REVEAL*`, `BRAND_FUN_DOTS` |
| Songs: one on the upload loading screen, another on every job search (Find sends `jobdesk:music` "search"; stop button) | `components/jobdesk/music.tsx`, `find-view.tsx` | `BRAND_MUSIC` (+ `_CLIP`, `_TITLE`), `BRAND_MUSIC_SEARCH` |
| Kiki floating top-right; flies across the loading screen with wind gusts, glides back | `components/jobdesk/brand-art.tsx` | `BRAND_ART` |
| Howl's-castle theme (sky, meadow, flame, track) | `components/howl/*` | `BRAND_THEME=howl` |
| Step 1: "What job would you love?" (survey → plan) | `jobdesk/welcome-view.tsx`, `dream-card.tsx`, `api/jobdesk/dream`, `lib/jobdesk/dream.ts` | — |
| Step 2: job titles, where/how far, salary | `welcome-view.tsx` → `/api/profile`, `/api/jobdesk/personalize` | — |
| Find jobs: US only, mile radius, dream titles first, 3 per company, real names + logos | `jobdesk/find-view.tsx`, `brand-logo.tsx`, `lib/jobdesk/where.ts` (+ `public/jobdesk-us-places.tsv` Census data) | — |
| Quick read per job (synopsis, company, perks, fit vs. dream) | `use-synopses.ts`, `api/jobdesk/synopsis`, `lib/jobdesk/synopsis.ts` (Haiku, cached in `.career-ops-web/jobdesk-synopsis`) | — |
| My list (apply, score, tailor), job page | `my-list-view.tsx`, `job-view.tsx`, `lib/jobdesk/list.ts` | — |
| Apply: her Chrome opens on-screen and fills the real form (Greenhouse, Lever, Ashby); her saved answers fill matching fields, the AI drafts the rest; she checks it, then **Approve & submit** (confirm step) clicks the form's own Submit and reports what the page said; sent = marked applied. Nothing is sent without that click. | `brand_web.py` (apply patches: prefill, apply-provider, session window, apply-view), `approve-submit.tsx`, `lib/jobdesk/submit.ts`, `api/jobdesk/submit` | — |
| Apply to all: picked jobs (2+) fill side by side, two at a time, each in its own Chrome window; one review page (ready / needs answers / apply on their site); answers typed there fill every card asking the same thing, go into the form when sent and into My info; send one, or "Submit all ready" after one confirm listing them; a site's emailed security code gets a box on that card (never bypassed) | `apply-all-view.tsx`, `app/apply-all`, `api/jobdesk/show`, `api/jobdesk/submit` (`extra`, `code`), session TTL 60 min (`brand_web.py`) | — |
| My info: what applications ask beyond the resume (contact, address, work authorization, sponsorship, start date, pay, education, how she heard, demographics with "I don't wish to answer"), every answer learned from forms (editable), and questions forms asked that she left empty | `my-info-view.tsx`, `my-info-nudge.tsx`, `lib/jobdesk/answers.ts` (`.career-ops-web/jobdesk-answers.json`), `api/jobdesk/answers`, `api/jobdesk/answers/learn` | — |
| "Ryan says, You got this!" (first application only, with a celebration) | `cheer.tsx` | `BRAND_CHEER` |
| Follow-ups (by next step / all applications, email drafts, outcomes, notes) | `follow-ups-view.tsx`, `plan.ts`, `api/jobdesk/followup-email` | — |
| Tracker tiles (applied, waiting, follow up now, interviews, offers) on My list + Follow-ups | `applied-tracker.tsx` | — |
| Blank slate: career-ops's example search (AI/ML titles in, "Junior"/"Intern" out) is emptied on a new install; her saved titles become the scan filter | `lib/jobdesk/portal-titles.ts`, `api/jobdesk/titles`, `api/jobdesk/me` | — |
| My resume (edit, ask for a change, replace, PDF, Start fresh → dated backup, never deletes) | `resume-view.tsx`, `lib/jobdesk/reset.ts` | — |
| Assistant "Asal’s Assistant (Bitch)" + greeting (old saved chats get the new greeting) | `brand_web.py` (assistant-console edits) | `BRAND_ASSISTANT`, `BRAND_ASSISTANT_HELLO` |
| Update notice | `update-notice.tsx`, `api/jobdesk/update`, `macos/updater.mjs` | `BRAND_UPDATE_REPO`, `BRAND_UPDATE_CHANNEL` |
| career-ops's own screens (portal health etc.) | under **Advanced** | — |
| AI model | — | `BRAND_MODEL` (Asal: `claude-sonnet-5-5`) |

`ui/brand/web/` holds new files only; `brand_web.py` refuses to overwrite a
career-ops file and fails the build if an edit's anchor is missing.

## Asset provenance (keep it this way)

- **Kiki** (`brands/asal-kiki.png`): the owner's own ink drawing, colored.
- **Songs** (`brands/asal-music.m4a`, `brands/asal-music-search.m4a`): cut
  from the owner's **iTunes purchase** (Joe Hisaishi, "Merry-Go-Round of
  Life", *FREEDOM PIANO STORIES 4*): 4:08–4:45 for the upload screen and
  0:49–1:29 for the search, each with a 4 s fade baked in. Private use, never
  committed.
- **Icon**: original art (`brands/asal-icon.svg`).
- **Declined, on purpose:** YouTube rips of a cover (video, mp3, a re-cut WAV
  from Discord, all the same recording) and Totoro images (film frames, fan
  art). Don't add ripped audio or copyrighted characters' images to a build;
  original drawings or the owner's own work only. Unused original drawings
  from that discussion: `brands/asal-cat.png`, `brands/asal-spirit.png`.

## What a new install contains (verified 2026-10-02)

Nothing from the owner's own sessions: the DMG carries career-ops's published
code, JobDesk, the runtime and the brand settings. A fresh install has no
resume, profile, name, location, job titles, list, follow-ups or dream plan;
the one inherited default (career-ops's example search filter) is emptied.
"Start fresh" on My resume returns to this state (old data moves to a dated
backup folder).

## Open items

- **Approve & submit** was verified end to end on a local test form (filled,
  sent, "Thank you for applying", celebration). Never test it on a real
  employer's form; use a local page like the one in `docs/HANDOFF.md`'s test
  notes. Ashby may refuse automated submits: then she presses Submit in
  Chrome and Mark applied.

- **Give Asal the DMG** (owner). Recommend she moves the app to Applications;
  first launch sets itself up (a few minutes).
- **Rotate the secrets pasted in chat** during the build sessions (an
  Anthropic key and the GitHub update token) and rebuild; the Keychain is the
  only place they should live.
- **Lesser-known companies** sometimes show a tidied web handle
  ("Destinationknot") and a letter badge; no better name/logo was found.
- **The fly-across happens even if the resume reads fast**; she may finish
  her flight over the first questions page (by design: same 14 s either way).
- **Unsigned app**: first open needs right-click → Open (or "Open Anyway" in
  Privacy & Security). Notarizing needs an Apple Developer ID.
- Ideas not started: score the first results automatically (a cost call);
  Intel Mac coverage in CI.
