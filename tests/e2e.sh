#!/bin/bash
# End to end: install JobDesk into a throwaway HOME, start it, use the web UI's
# API, re-run the installer, optionally update an older career-ops, and
# uninstall. Needs the network. CI runs it on macOS (with /bin/bash 3.2, and
# JobDesk.app checks) and on Linux.
#
#   /bin/bash tests/e2e.sh
#   E2E_OLD_CAREER_OPS=1.33.0 /bin/bash tests/e2e.sh   # also test updating

set -u
set -o pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SHELL_UNDER_TEST="$BASH"
TMP_ROOT=${TMPDIR:-/tmp}   # macOS's ends in "/"
HOME=$(mktemp -d "${TMP_ROOT%/}/jobdesk-e2e.XXXXXX")
export HOME
J="$HOME/.jobdesk/bin/jobdesk"
APP=""

step() { printf '\n### %s\n' "$*"; }
fail() {
  printf '\nE2E FAILED: %s\n' "$*" >&2
  if [ -f "$HOME/.jobdesk/logs/install.log" ]; then
    printf '\n--- install.log (tail) ---\n' >&2
    tail -n 80 "$HOME/.jobdesk/logs/install.log" >&2
  fi
  if [ -f "$HOME/.jobdesk/logs/server.log" ]; then
    printf '\n--- server.log (tail) ---\n' >&2
    tail -n 40 "$HOME/.jobdesk/logs/server.log" >&2
  fi
  exit 1
}
cleanup() {
  [ -x "$J" ] && "$J" stop >/dev/null 2>&1
  if [ -n "$APP" ] && [ -d "$APP" ]; then
    pkill -f "$APP/Contents/MacOS/" 2>/dev/null
    rm -rf "$APP"
  fi
  rm -rf "$HOME"
}
trap cleanup EXIT

port() { cat "$HOME/.jobdesk/run/server.port"; }
http_code() { curl -s -o /dev/null -w '%{http_code}' --max-time 30 "http://127.0.0.1:$(port)$1"; }
# shellcheck disable=SC1091  # written by the installer at test time
config_value() { ( . "$HOME/.jobdesk/config.env"; eval "printf '%s' \"\${$1}\"" ); }

wait_for() {  # seconds command...
  local secs="$1" i=0
  shift
  while [ "$i" -lt "$secs" ]; do
    "$@" && return 0
    sleep 1
    i=$(( i + 1 ))
  done
  return 1
}

check_web_ui() {
  "$J" start || fail "jobdesk start"
  "$J" status --quiet || fail "jobdesk status after start"
  curl -fsS "http://127.0.0.1:$(port)/api/version" | grep -q '"coreVersion"' || fail "/api/version"
  [ "$(http_code /)" = 200 ] || fail "home page"
  [ "$(http_code /pipeline)" = 200 ] || fail "pipeline page"
  [ "$(http_code /config)" = 200 ] || fail "config page"
  curl -fsS "http://127.0.0.1:$(port)/api/doctor" | grep -q '"onboardingNeeded"' || fail "/api/doctor"
  printf 'web UI OK on port %s\n' "$(port)"
}

printf 'Testing with %s (%s), HOME=%s\n' "$SHELL_UNDER_TEST" "$BASH_VERSION" "$HOME"

step "Fresh install"
JOBDESK_CAREER_OPS_VERSION="${E2E_OLD_CAREER_OPS:-}" \
  "$SHELL_UNDER_TEST" "$ROOT/install.sh" --yes --ai=none --no-launch || fail "installer"
[ -f "$HOME/career-ops/VERSION" ] || fail "career-ops wasn't downloaded"
[ -f "$HOME/.jobdesk/ui/current/web/.next/BUILD_ID" ] || fail "web UI wasn't built"
[ -z "$(git -C "$HOME/career-ops" status --porcelain)" ] || fail "the installer modified the career-ops checkout"
for leftover in "$HOME"/.career-ops.jobdesk-partial.*; do
  [ -e "$leftover" ] && fail "a partial download was left behind: $leftover"
done
[ "$(config_value JOBDESK_AI)" = none ] || fail "config: AI"
FIRST_VERSION=$(awk 'NR==1 {print $1}' "$HOME/career-ops/VERSION")
if [ -n "${E2E_OLD_CAREER_OPS:-}" ]; then
  [ "$FIRST_VERSION" = "$E2E_OLD_CAREER_OPS" ] || fail "expected career-ops $E2E_OLD_CAREER_OPS, got $FIRST_VERSION"
fi
printf 'career-ops %s installed\n' "$FIRST_VERSION"

step "Web UI"
check_web_ui

if [ "$(uname -s)" = Darwin ]; then
  step "JobDesk.app"
  APP=$(config_value JOBDESK_APP)
  [ -d "$APP" ] || fail "JobDesk.app wasn't created (config says: $APP)"
  codesign --verify --deep --strict "$APP" || fail "JobDesk.app's signature is invalid"
  [ "$(plutil -extract CFBundleIdentifier raw "$APP/Contents/Info.plist")" = com.martialstudios.jobdesk ] ||
    fail "bundle id"
  [ -f "$APP/Contents/Resources/applet.icns" ] || fail "icon missing"
  if plutil -extract CFBundleIconName raw "$APP/Contents/Info.plist" >/dev/null 2>&1; then
    fail "CFBundleIconName would override our icon"
  fi
  printf 'app bundle OK: %s\n' "$APP"

  step "Opening JobDesk.app starts the server; stopping it quits the app"
  "$J" stop >/dev/null
  if open "$APP"; then
    wait_for 120 "$J" status --quiet || fail "the app didn't start the server"
    printf 'app started the server on port %s\n' "$(port)"
    "$J" stop >/dev/null
    # The app polls every 30s and quits once the server is gone.
    wait_for 90 sh -c "! pgrep -f '$APP/Contents/MacOS/' >/dev/null" || fail "the app kept running after the server stopped"
    printf 'app quit on its own\n'
    # An applet that saved state into itself on quit would break its signature.
    codesign --verify --deep --strict "$APP" || fail "JobDesk.app's signature broke after it ran"
  else
    printf '::warning::open(1) could not launch apps on this runner; skipped the app launch check\n'
  fi
  "$J" start >/dev/null || fail "restart after app check"
fi

step "Re-running the installer (update/repair) keeps settings and restarts"
"$SHELL_UNDER_TEST" "$ROOT/install.sh" --yes --no-launch || fail "re-run"
[ "$(config_value JOBDESK_AI)" = none ] || fail "re-run forgot the AI choice"
"$J" status --quiet || fail "server wasn't restarted after the re-run"
check_web_ui

if [ -n "${E2E_OLD_CAREER_OPS:-}" ]; then
  step "Updating career-ops $E2E_OLD_CAREER_OPS"
  "$SHELL_UNDER_TEST" "$ROOT/install.sh" --update --no-launch || fail "update"
  NEW_VERSION=$(awk 'NR==1 {print $1}' "$HOME/career-ops/VERSION")
  if [ "$NEW_VERSION" = "$E2E_OLD_CAREER_OPS" ]; then
    if grep -q "Couldn't check for career-ops updates" "$HOME/.jobdesk/logs/install.log"; then
      printf '::warning::career-ops update check was offline or rate-limited; skipped the version assertion\n'
    else
      fail "career-ops stayed at $NEW_VERSION after --update"
    fi
  else
    printf 'career-ops updated %s -> %s\n' "$E2E_OLD_CAREER_OPS" "$NEW_VERSION"
    grep -q "career-ops-v$NEW_VERSION\|worktree" "$HOME/.jobdesk/ui/current/.jobdesk-built" ||
      fail "the web UI wasn't rebuilt for $NEW_VERSION"
  fi
  [ -f "$HOME/career-ops/VERSION" ] || fail "update lost the checkout"
  check_web_ui
fi

step "Uninstall keeps the user's data"
printf 'my CV\n' > "$HOME/career-ops/cv.md"
"$J" uninstall --yes || fail "uninstall"
[ ! -e "$HOME/.jobdesk" ] || fail "$HOME/.jobdesk still exists"
[ "$(cat "$HOME/career-ops/cv.md")" = "my CV" ] || fail "uninstall touched cv.md"
if [ -n "$APP" ]; then
  [ ! -e "$APP" ] || fail "JobDesk.app still exists"
fi
if pgrep -f next-server >/dev/null 2>&1; then
  fail "a web server is still running after uninstall"
fi

printf '\nE2E PASSED\n'
