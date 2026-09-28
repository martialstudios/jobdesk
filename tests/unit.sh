#!/bin/bash
# Fast, offline checks of install.sh and bin/jobdesk helpers.
# Run with the shell you care about; CI runs it under macOS's /bin/bash 3.2:
#   /bin/bash tests/unit.sh

# Subshells isolate each block, and variables set here are read by the sourced
# functions, which shellcheck can't see.
# shellcheck disable=SC1091,SC2030,SC2031,SC2034,SC2088,SC2153

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PASSED=0
FAILED=0
SCRATCH=$(mktemp -d "${TMPDIR:-/tmp}/jobdesk-unit.XXXXXX")
trap 'rm -rf "$SCRATCH"; [ -n "${LISTENER:-}" ] && kill "$LISTENER" 2>/dev/null' EXIT

pass() { PASSED=$(( PASSED + 1 )); }
fail() { FAILED=$(( FAILED + 1 )); printf 'FAIL: %s\n' "$*"; }
expect_eq() { if [ "$2" = "$3" ]; then pass; else fail "$1: expected [$3], got [$2]"; fi; }
expect_true() { local label="$1"; shift; if "$@"; then pass; else fail "$label"; fi; }
expect_false() { local label="$1"; shift; if "$@"; then fail "$label"; else pass; fi; }

printf 'bash %s\n' "$BASH_VERSION"

# ── install.sh ────────────────────────────────────────────────────────────
(
  export HOME="$SCRATCH/home"
  mkdir -p "$HOME"
  # shellcheck source=../install.sh
  JOBDESK_SOURCE_ONLY=1 . "$ROOT/install.sh"
  setup_colors

  expect_true "14.6.1 >= 13.5" version_ge 14.6.1 13.5
  expect_true "13.5 >= 13.5" version_ge 13.5 13.5
  expect_true "13.5.0 >= 13.5" version_ge 13.5.0 13.5
  expect_true "26.0 >= 13.5" version_ge 26.0 13.5
  expect_false "13.4.1 < 13.5" version_ge 13.4.1 13.5
  expect_false "12.7.6 < 13.5" version_ge 12.7.6 13.5
  expect_true "1.10.0 >= 1.9.0" version_ge 1.10.0 1.9.0

  # parse_args rejects bad values (exit 2) and accepts good ones.
  ( parse_args --ai=robot >/dev/null 2>&1 ); expect_eq "--ai=robot exit" "$?" 2
  ( parse_args --port=80 >/dev/null 2>&1 ); expect_eq "--port=80 exit" "$?" 2
  ( parse_args --port=abc >/dev/null 2>&1 ); expect_eq "--port=abc exit" "$?" 2
  ( parse_args --bogus >/dev/null 2>&1 ); expect_eq "--bogus exit" "$?" 2
  ( parse_args --ai=gemini --port=5000 --yes --no-launch --update && [ "$OPT_AI" = gemini ] &&
    [ "$OPT_PORT" = 5000 ] && [ "$OPT_YES" = 1 ] && [ "$OPT_LAUNCH" = 0 ] && [ "$OPT_UPDATE" = 1 ] )
  expect_eq "good options parse" "$?" 0

  # resolve_settings: default, ~, relative, trailing slash, remembered folder.
  ( OPT_DIR=""; EXISTING_DIR=""; resolve_settings; [ "$CAREER_OPS_DIR" = "$HOME/career-ops" ] && [ "$PORT" = 4788 ] )
  expect_eq "default folder and port" "$?" 0
  ( OPT_DIR="~/jobs/co/"; resolve_settings; [ "$CAREER_OPS_DIR" = "$HOME/jobs/co" ] )
  expect_eq "~ expansion + trailing slash" "$?" 0
  ( cd "$SCRATCH" && OPT_DIR="rel dir"; resolve_settings; [ "$CAREER_OPS_DIR" = "$SCRATCH/rel dir" ] )
  expect_eq "relative folder" "$?" 0
  ( OPT_DIR=""; EXISTING_DIR="/data/co"; EXISTING_PORT=4999; resolve_settings;
    [ "$CAREER_OPS_DIR" = /data/co ] && [ "$PORT" = 4999 ] )
  expect_eq "remembers folder and port" "$?" 0

  # latest_release_tag sorts versions numerically and ignores other tags.
  mkdir -p "$SCRATCH/fakebin"
  cat > "$SCRATCH/fakebin/git" <<'EOF'
#!/bin/sh
printf 'a1\trefs/tags/career-ops-v1.9.0\n'
printf 'a2\trefs/tags/career-ops-v1.34.0\n'
printf 'a3\trefs/tags/career-ops-v1.10.2\n'
printf 'a4\trefs/tags/career-ops-v2.0.0-beta.1\n'
printf 'a5\trefs/tags/web-v0.12.0\n'
EOF
  chmod +x "$SCRATCH/fakebin/git"
  LOG_FILE="$SCRATCH/log"
  got=$(PATH="$SCRATCH/fakebin:$PATH" latest_release_tag)
  expect_eq "latest release tag" "$got" 1.34.0

  # write_config round-trips awkward paths.
  JOBDESK_HOME="$SCRATCH/jd"
  mkdir -p "$JOBDESK_HOME"
  CAREER_OPS_DIR="$SCRATCH/it's a \"folder\" \$HOME"
  PORT=4790; AI=codex; APP_PATH="$SCRATCH/Apps/JobDesk.app"
  write_config
  (
    # shellcheck source=/dev/null
    . "$JOBDESK_HOME/config.env"
    [ "$JOBDESK_CAREER_OPS_DIR" = "$SCRATCH/it's a \"folder\" \$HOME" ] && [ "$JOBDESK_PORT" = 4790 ] &&
      [ "$JOBDESK_AI" = codex ] && [ "$JOBDESK_APP" = "$SCRATCH/Apps/JobDesk.app" ]
  )
  expect_eq "config round trip" "$?" 0

  # is_career_ops_dir needs the real markers, not just any folder.
  mkdir -p "$SCRATCH/co" "$SCRATCH/notco"
  printf '1.34.0 # x\n' > "$SCRATCH/co/VERSION"
  : > "$SCRATCH/co/update-system.mjs"
  printf '{\n  "name": "career-ops",\n  "version": "1.34.0"\n}\n' > "$SCRATCH/co/package.json"
  printf '{ "name": "something-else" }\n' > "$SCRATCH/notco/package.json"
  expect_true "career-ops folder detected" is_career_ops_dir "$SCRATCH/co"
  expect_false "other folder rejected" is_career_ops_dir "$SCRATCH/notco"
  expect_eq "core version parsed" "$(core_version_of "$SCRATCH/co")" 1.34.0

  printf 'install.sh: %s passed, %s failed\n' "$PASSED" "$FAILED"
  [ "$FAILED" = 0 ]
) || FAILED=$(( FAILED + 1 ))

# ── bin/jobdesk ───────────────────────────────────────────────────────────
(
  PASSED=0
  FAILED=0
  export HOME="$SCRATCH/home2"
  mkdir -p "$HOME"
  # shellcheck source=../bin/jobdesk
  JOBDESK_SOURCE_ONLY=1 . "$ROOT/bin/jobdesk"

  expect_eq "falls back to ~/.jobdesk outside an install" "$JOBDESK_HOME" "$HOME/.jobdesk"

  # pick_port skips a port something is listening on.
  port=47311
  python3 - "$port" <<'EOF' &
import socket, sys, time
s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("127.0.0.1", int(sys.argv[1]))); s.listen(16); s.settimeout(30)
deadline = time.time() + 30
while time.time() < deadline:
    try:
        conn, _ = s.accept()  # accept and close, like a real server would
        conn.close()
    except socket.timeout:
        break
EOF
  LISTENER=$!
  i=0
  while ! port_in_use "$port" && [ $i -lt 50 ]; do sleep 0.1; i=$(( i + 1 )); done
  expect_true "listener detected" port_in_use "$port"
  expect_eq "pick_port skips busy port" "$(pick_port "$port")" $(( port + 1 ))
  kill "$LISTENER" 2>/dev/null
  wait "$LISTENER" 2>/dev/null

  # is_server_pid only trusts Next.js server processes.
  expect_false "own shell isn't a server" is_server_pid $$
  expect_false "junk pid" is_server_pid "12abc"
  expect_false "empty pid" is_server_pid ""
  bash -c 'exec -a next-server sleep 30' &
  fake=$!
  sleep 0.3
  expect_true "next-server process recognized" is_server_pid "$fake"
  kill "$fake" 2>/dev/null
  wait "$fake" 2>/dev/null

  # A stale pid file never counts as running.
  mkdir -p "$RUN_DIR"
  printf '999999\n' > "$PID_FILE"
  expect_false "stale pid file" running_pid
  expect_false "nothing healthy on a closed port" healthy 47399

  JOBDESK_AI=gemini
  expect_eq "ai bin name" "$(ai_bin_name)" gemini
  JOBDESK_AI=none
  expect_false "no ai bin for none" ai_bin_name

  # The installed layout: JOBDESK_HOME comes from the script's own location,
  # even when reached through a symlink and with a different $HOME.
  inst="$SCRATCH/inst/.jobdesk"
  mkdir -p "$inst/bin" "$SCRATCH/links"
  cp "$ROOT/bin/jobdesk" "$inst/bin/jobdesk"
  printf 'JOBDESK_PORT=4999\n' > "$inst/config.env"
  ln -s "$inst/bin/jobdesk" "$SCRATCH/links/jobdesk"
  got=$(HOME=/nonexistent JOBDESK_SOURCE_ONLY=1 bash -c '. "$1"; printf "%s %s" "$JOBDESK_HOME" "$JOBDESK_PORT"' _ "$SCRATCH/links/jobdesk")
  expect_eq "self-locating install" "$got" "$inst 4999"

  printf 'bin/jobdesk: %s passed, %s failed\n' "$PASSED" "$FAILED"
  [ "$FAILED" = 0 ]
) || FAILED=$(( FAILED + 1 ))

if [ "$FAILED" = 0 ]; then
  printf 'All unit tests passed.\n'
else
  printf 'Unit tests FAILED.\n'
  exit 1
fi
