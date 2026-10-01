#!/bin/bash
# The DMG edition, end to end on a Mac: build JobDesk.dmg (a test build with a
# fake Claude key that sets up in a throwaway home), copy the app out of it
# like a person dragging it to Applications, run the app's first-run setup,
# start JobDesk, check the web UI, the key and PDF browser reaching it, that
# Claude Code runs on the key without a login, a PDF, a second setup keeping
# your data, and uninstall. Needs the network (for the build and for Claude).
#
#   /bin/bash tests/dmg-e2e.sh                 # builds the DMG first (~5 min)
#   DMG_E2E_DMG=path.dmg DMG_E2E_HOME=dir /bin/bash tests/dmg-e2e.sh
#       # reuse a test build made with --test-home=dir

set -u
set -o pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ "$(uname -s)" = Darwin ] || { printf 'The DMG edition is macOS only.\n'; exit 0; }
TMP_ROOT=${TMPDIR:-/tmp}   # macOS's ends in "/"
W=$(mktemp -d "${TMP_ROOT%/}/jobdesk-dmg-e2e.XXXXXX")
H="${DMG_E2E_HOME:-$W/home}"
mkdir -p "$H"
H=$(cd -P "$H" && pwd -P)
J="$H/.jobdesk/bin/jobdesk"
APP="$W/Applications/JobDesk.app"
L="$APP/Contents/Resources/launch"
MNT=""
FAKE_KEY="sk-ant-api03-jobdesk-dmg-e2e-not-a-real-key"
export TMPDIR="$W/tmp"   # the launcher's status files
mkdir -p "$TMPDIR"

step() { printf '\n### %s\n' "$*"; }
fail() {
  printf '\nDMG E2E FAILED: %s\n' "$*" >&2
  for f in "$H/.jobdesk/logs/install.log" "$H/.jobdesk/logs/server.log" "$TMPDIR/jobdesk-setup.out"; do
    [ -f "$f" ] && { printf '\n--- %s (tail) ---\n' "$f" >&2; tail -n 60 "$f" >&2; }
  done
  exit 1
}
cleanup() {
  [ -x "$J" ] && HOME="$H" "$J" stop >/dev/null 2>&1
  [ -n "$MNT" ] && hdiutil detach -quiet "$MNT" >/dev/null 2>&1
  rm -rf "$W"
  [ -z "${DMG_E2E_HOME:-}" ] || rm -rf "${DMG_E2E_HOME:?}/.jobdesk" "${DMG_E2E_HOME:?}/career-ops"
}
trap cleanup EXIT
port() { cat "$H/.jobdesk/run/server.port"; }
# The job scanner must be reachable: /api/explore answers 400 straight away
# when the web UI can't find career-ops's scripts (career-ops 1.35 moved that
# lookup), and streams a scan otherwise.
scan_code() {
  curl -s --noproxy '*' -o /dev/null -w '%{http_code}' --max-time 8 -X POST \
    -H 'Content-Type: application/json' -H "Origin: http://127.0.0.1:$(port)" -H 'Sec-Fetch-Site: same-origin' \
    "http://127.0.0.1:$(port)/api/explore" -d '{"ats":["lever"],"positive":["engineer"],"limitPerAts":1}'
}
http_code() { curl -s --noproxy '*' -o /dev/null -w '%{http_code}' --max-time 30 "http://127.0.0.1:$(port)$1"; }

if [ -n "${DMG_E2E_DMG:-}" ]; then
  DMG="$DMG_E2E_DMG"
  [ -n "${DMG_E2E_HOME:-}" ] || fail "DMG_E2E_DMG needs DMG_E2E_HOME (the build's --test-home)"
else
  step "Building a test JobDesk.dmg"
  printf '%s\n' "$FAKE_KEY" > "$W/key"
  /bin/bash "$ROOT/tools/build-dmg.sh" --key-file="$W/key" --test-home="$H" --out="$W/dist" || fail "build-dmg.sh"
  DMG=$(ls "$W"/dist/JobDesk-*-test.dmg)
fi
size=$(du -h "$DMG" | awk '{print $1}')
printf 'DMG: %s, %s\n' "$DMG" "$size"

step "Opening the disk image and dragging JobDesk to Applications"
MNT="$W/mnt"
mkdir -p "$MNT"
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$MNT" "$DMG" || fail "hdiutil attach"
[ -d "$MNT/JobDesk.app" ] || fail "no JobDesk.app on the disk image"
[ -L "$MNT/Applications" ] || fail "no Applications shortcut on the disk image"
[ -f "$MNT/How to open JobDesk.png" ] || fail "no picture guide on the disk image"
codesign --verify --deep --strict "$MNT/JobDesk.app" || fail "the app's signature is broken on the disk image"
mkdir -p "$W/Applications"
ditto "$MNT/JobDesk.app" "$APP" || fail "copying the app"
hdiutil detach -quiet "$MNT" && MNT=""
codesign --verify --deep --strict "$APP" || fail "the app's signature broke when copied"
[ "$(plutil -extract CFBundleIdentifier raw "$APP/Contents/Info.plist")" = com.martialstudios.jobdesk ] || fail "bundle id"
[ "$("$L" where)" = ok ] || fail "the app thinks it isn't in Applications"

step "First-run setup (what the app's progress window runs)"
[ "$("$L" needs-setup)" = yes ] || fail "a fresh Mac should need setup"
"$L" setup-start || fail "setup-start"
i=0
while :; do
  s=$("$L" setup-status)
  case "$s" in
    done\|*) break ;;
    failed\|*) fail "setup failed: $s" ;;
  esac
  [ $i -lt 600 ] || fail "setup took over 5 minutes (last: $s)"
  sleep 0.5
  i=$(( i + 1 ))
done
printf 'setup finished in about %ss\n' $(( i / 2 ))
[ "$("$L" needs-setup)" = no ] || fail "setup didn't record its build"
cfg="$H/.jobdesk/config.env"
grep -qx 'JOBDESK_EDITION=dmg' "$cfg" || fail "config: edition"
grep -qx 'JOBDESK_AI=claude' "$cfg" || fail "config: AI"
grep -q "JOBDESK_APP=.*Applications/JobDesk.app" "$cfg" || fail "config: app path"
[ "$(stat -f %Lp "$H/.jobdesk/secrets.env")" = 600 ] || fail "secrets.env must be private (600)"
grep -q "$FAKE_KEY" "$H/.jobdesk/secrets.env" || fail "the key didn't make it into secrets.env"
"$H/.jobdesk/node/bin/node" --version >/dev/null || fail "node doesn't run"
want_arch=arm64
[ "$(sysctl -in hw.optional.arm64 2>/dev/null)" = 1 ] || want_arch=x86_64
[ "${JOBDESK_DMG_ARCH:-}" = x64 ] && want_arch=x86_64
for b in "$H/.jobdesk/node/bin/node" "$H/.jobdesk/tools/bin/claude"; do
  file -b "$b" | grep -q "$want_arch" || fail "$b isn't built for $want_arch: $(file -b "$b")"
done
printf 'Node.js and Claude Code for %s\n' "$want_arch"
"$H/.jobdesk/tools/bin/claude" --version >/dev/null 2>&1 || fail "claude doesn't run"
[ -f "$H/career-ops/VERSION" ] || fail "no career-ops folder"
[ -d "$H/career-ops/node_modules/playwright" ] || fail "career-ops came without its dependencies"
"$H/.jobdesk/shims/git" --version >/dev/null 2>&1 || fail "the git shim doesn't reach this Mac's git"
if xattr -lr "$H/.jobdesk" 2>/dev/null | grep -q com.apple.quarantine; then fail "files still quarantined"; fi

step "Starting JobDesk"
HOME="$H" "$L" start || fail "start"
curl -fsS --noproxy '*' "http://127.0.0.1:$(port)/api/version" | grep -q '"coreVersion"' || fail "/api/version"
for p in / /pipeline /config; do [ "$(http_code "$p")" = 200 ] || fail "page $p"; done
curl -fsS --noproxy '*' "http://127.0.0.1:$(port)/api/doctor" | grep -q '"onboardingNeeded"' || fail "/api/doctor"
[ "$(scan_code)" != 400 ] || fail "the web UI can't find career-ops's job scanner"
curl -fsS --noproxy '*' "http://127.0.0.1:$(port)/api/clis" | grep -q "\"path\":\"$H/.jobdesk/tools/bin/claude\"" ||
  fail "the web UI doesn't see the bundled Claude Code"
printf 'web UI OK on port %s\n' "$(port)"

step "The server passes JobDesk's Claude setup on"
# next-server rewrites its process title, so ps can't show its environment.
# Ask the web UI's assistant instead: the Claude Code it starts keeps its
# settings where dmg_server_env (which also exports the key) points it.
curl -s --noproxy '*' --max-time 120 -X POST -H 'Content-Type: application/json' \
  -H "Origin: http://127.0.0.1:$(port)" -H 'Sec-Fetch-Site: same-origin' \
  "http://127.0.0.1:$(port)/api/assistant" -d '{"message":"Reply with one word: ready","cliId":"claude","history":[]}' \
  > "$W/assistant.out" || fail "the assistant API didn't answer"
[ -d "$H/.jobdesk/claude" ] || fail "Claude Code didn't get JobDesk's settings folder from the server"
[ ! -e "$H/.claude" ] || fail "Claude Code wrote into the home folder instead of JobDesk's"
printf 'the assistant ran Claude Code with JobDesk'"'"'s settings\n'

step "Claude Code runs on the key, with no login"
out=$(cd "$H/career-ops" && env -i HOME="$H" PATH="$H/.jobdesk/shims:/usr/bin:/bin" \
  ANTHROPIC_API_KEY="$FAKE_KEY" CLAUDE_CONFIG_DIR="$H/.jobdesk/claude" DISABLE_AUTOUPDATER=1 CLAUDE_CODE_MAX_RETRIES=0 \
  "$H/.jobdesk/tools/bin/claude" -p "Reply with one word: ready" < /dev/null 2>&1 | head -c 400)
printf 'claude says: %s\n' "$out"
case "$out" in
  *401*|*"API key is invalid"*|*[Ii]nvalid*[Kk]ey*) printf 'Claude Code used the (fake) key\n' ;;
  *[Ll]ogin*|*"log in"*) fail "Claude Code asked for a login instead of using the key" ;;
  *) fail "unexpected answer from Claude Code" ;;
esac

step "A PDF, with the browser that came in the DMG"
# Under Rosetta (JOBDESK_DMG_ARCH=x64 on Apple Silicon) Playwright still sees an
# Apple CPU and looks for the arm64 browser; tell it what a real Intel Mac says.
host_override=""
[ "${JOBDESK_DMG_ARCH:-}" = x64 ] && host_override=mac15
( cd "$H/career-ops" && PLAYWRIGHT_BROWSERS_PATH="$H/.jobdesk/browsers" PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="$host_override" \
  "$H/.jobdesk/node/bin/node" -e "
const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.setContent('<h1>JobDesk</h1>');await p.pdf({path:process.argv[1]});await b.close();})()
.catch(e=>{console.error(e.message);process.exit(1)})" "$W/test.pdf" ) || fail "PDF rendering"
head -c 5 "$W/test.pdf" | grep -q '%PDF' || fail "not a PDF"
printf 'PDF OK\n'

step "Opening a newer JobDesk.dmg keeps your data"
printf 'my CV\n' > "$H/career-ops/cv.md"
printf 'older build\n' > "$H/.jobdesk/.dmg-build"
[ "$("$L" needs-setup)" = yes ] || fail "a different build should need setup"
"$L" setup-start || fail "setup-start (again)"
i=0
while :; do
  s=$("$L" setup-status)
  case "$s" in done\|*) break ;; failed\|*) fail "second setup failed: $s" ;; esac
  [ $i -lt 600 ] || fail "second setup took over 5 minutes"
  sleep 0.5
  i=$(( i + 1 ))
done
[ "$(cat "$H/career-ops/cv.md")" = "my CV" ] || fail "setup touched cv.md"
HOME="$H" "$L" start >/dev/null || fail "start after the second setup"
[ "$(http_code /)" = 200 ] || fail "home page after the second setup"

step "Uninstall keeps the user's data"
HOME="$H" "$J" uninstall --yes || fail "uninstall"
[ ! -e "$H/.jobdesk" ] || fail "$H/.jobdesk still exists"
[ ! -e "$APP" ] || fail "JobDesk.app still exists"
[ "$(cat "$H/career-ops/cv.md")" = "my CV" ] || fail "uninstall touched cv.md"

printf '\nDMG E2E PASSED\n'
