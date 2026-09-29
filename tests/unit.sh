#!/bin/bash
# Fast, offline checks of install.sh and bin/jobdesk helpers.
# Run with the shell you care about; CI runs it under macOS's /bin/bash 3.2:
#   /bin/bash tests/unit.sh

# Subshells isolate each block, and variables set here are read by the sourced
# functions, which shellcheck can't see.
# shellcheck disable=SC1091,SC2016,SC2030,SC2031,SC2034,SC2088,SC2153

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
PASSED=0
FAILED=0
# macOS's $TMPDIR ends in "/"; drop it so expected paths match normalized ones.
TMP_ROOT=${TMPDIR:-/tmp}
SCRATCH=$(mktemp -d "${TMP_ROOT%/}/jobdesk-unit.XXXXXX")
trap 'rm -rf "$SCRATCH"' EXIT

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
  # Paths come back physical (on macOS, /var and /tmp are symlinks).
  SP=$(cd -P "$SCRATCH" && pwd -P)
  HP=$(cd -P "$HOME" && pwd -P)

  expect_true "14.6.1 >= 13.5" version_ge 14.6.1 13.5
  expect_true "13.5 >= 13.5" version_ge 13.5 13.5
  expect_true "13.5.0 >= 13.5" version_ge 13.5.0 13.5
  expect_true "26.0 >= 13.5" version_ge 26.0 13.5
  expect_false "13.4.1 < 13.5" version_ge 13.4.1 13.5
  expect_false "12.7.6 < 13.5" version_ge 12.7.6 13.5
  expect_true "1.10.0 >= 1.9.0" version_ge 1.10.0 1.9.0

  expect_true "port 4788" valid_port 4788
  expect_true "port 65000" valid_port 65000
  expect_false "port 80" valid_port 80
  expect_false "port 08080 (leading zero)" valid_port 08080
  expect_false "port 99999999999999999999" valid_port 99999999999999999999
  expect_false "port 65001" valid_port 65001
  expect_false "port empty" valid_port ""

  # parse_args rejects bad values (exit 2) and accepts good ones.
  ( parse_args --ai=robot >/dev/null 2>&1 ); expect_eq "--ai=robot exit" "$?" 2
  ( parse_args --port=80 >/dev/null 2>&1 ); expect_eq "--port=80 exit" "$?" 2
  ( parse_args --port=abc >/dev/null 2>&1 ); expect_eq "--port=abc exit" "$?" 2
  ( parse_args --port=08080 >/dev/null 2>&1 ); expect_eq "--port=08080 exit" "$?" 2
  ( parse_args --bogus >/dev/null 2>&1 ); expect_eq "--bogus exit" "$?" 2
  ( parse_args --ai=gemini --port=5000 --yes --no-launch --update && [ "$OPT_AI" = gemini ] &&
    [ "$OPT_PORT" = 5000 ] && [ "$OPT_YES" = 1 ] && [ "$OPT_LAUNCH" = 0 ] && [ "$OPT_UPDATE" = 1 ] )
  expect_eq "good options parse" "$?" 0
  out=$( ( parse_args --help ) 2>&1 )
  case "$out" in *--dir=PATH*--port=N*) pass ;; *) fail "--help lists the options" ;; esac

  # resolve_settings: default, ~, relative, trailing slash, remembered folder.
  ( OPT_DIR=""; EXISTING_DIR=""; resolve_settings; [ "$CAREER_OPS_DIR" = "$HP/career-ops" ] && [ "$PORT" = 4788 ] )
  expect_eq "default folder and port" "$?" 0
  ( OPT_DIR="~/jobs/co/"; resolve_settings; [ "$CAREER_OPS_DIR" = "$HP/jobs/co" ] )
  expect_eq "~ expansion + trailing slash" "$?" 0
  ( cd "$SCRATCH" && OPT_DIR="rel dir"; resolve_settings; [ "$CAREER_OPS_DIR" = "$SP/rel dir" ] )
  expect_eq "relative folder" "$?" 0
  ( OPT_DIR=""; EXISTING_DIR="/data/co"; EXISTING_PORT=4999; resolve_settings;
    [ "$CAREER_OPS_DIR" = /data/co ] && [ "$PORT" = 4999 ] )
  expect_eq "remembers folder and port" "$?" 0
  # Data safety: uninstall removes JobDesk's folder, so career-ops can't live in it.
  ( JOBDESK_HOME="$HOME/.jobdesk"; OPT_DIR="$HOME/.jobdesk/career-ops"; resolve_settings ) >/dev/null 2>&1
  expect_eq "career-ops inside JOBDESK_HOME refused" "$?" 1
  ( JOBDESK_HOME="$HOME/co/.jobdesk"; OPT_DIR="$HOME/co"; resolve_settings ) >/dev/null 2>&1
  expect_eq "JOBDESK_HOME inside career-ops refused" "$?" 1
  ( JOBDESK_HOME="$HOME/.jobdesk"; OPT_DIR="$HOME/.jobdesk-other/co"; resolve_settings ) >/dev/null 2>&1
  expect_eq "a sibling with a common prefix is fine" "$?" 0

  # Paths are normalized before any comparison.
  expect_eq "normalize //, /. and trailing /" "$(normalize_path "$SCRATCH//a/./b/")" "$SP/a/b"
  expect_eq "normalize ~/" "$(normalize_path "~/x")" "$HP/x"
  mkdir -p "$SCRATCH/dotdir"
  expect_eq "normalize . inside a folder" "$(cd "$SCRATCH/dotdir" && normalize_path .)" "$SP/dotdir"
  expect_eq "normalize .. through a missing folder" "$(normalize_path "$SCRATCH/typo/../x/./y")" "$SP/x/y"
  expect_eq "normalize a relative path with .." "$(cd "$SCRATCH/dotdir" && normalize_path ../z)" "$SP/z"
  mkdir -p "$HOME/.jobdesk"
  ln -s "$HOME/.jobdesk" "$HOME/jdlink"
  expect_eq "normalize through a symlink" "$(normalize_path "$HOME/jdlink/tools")" "$HP/.jobdesk/tools"
  ( JOBDESK_HOME="$HOME/.jobdesk"; OPT_DIR="$HOME//.jobdesk/./career-ops"; resolve_settings ) >/dev/null 2>&1
  expect_eq "odd spellings can't sneak career-ops into JOBDESK_HOME" "$?" 1
  ( JOBDESK_HOME="$HOME/.jobdesk"; OPT_DIR="~/typo/../.jobdesk/tools"; resolve_settings ) >/dev/null 2>&1
  expect_eq "neither can .. through a missing folder" "$?" 1
  ( JOBDESK_HOME="$HOME/.jobdesk"; OPT_DIR="~/jdlink/tools"; resolve_settings ) >/dev/null 2>&1
  expect_eq "nor a symlink into JOBDESK_HOME" "$?" 1
  rm -rf "$HOME/jdlink" "$HOME/.jobdesk"

  # check_home_location refuses $HOME and folders that hold other files...
  ( JOBDESK_HOME="$HOME"; check_home_location ) >/dev/null 2>&1
  expect_eq "JOBDESK_HOME=\$HOME refused" "$?" 1
  ( JOBDESK_HOME="$HOME/"; check_home_location ) >/dev/null 2>&1
  expect_eq "JOBDESK_HOME=\$HOME/ refused" "$?" 1
  mkdir -p "$SCRATCH/busy" && : > "$SCRATCH/busy/notes.txt"
  ( JOBDESK_HOME="$SCRATCH/busy"; check_home_location ) >/dev/null 2>&1
  expect_eq "non-empty foreign folder refused" "$?" 1
  # ...but not Finder's .DS_Store, or an install from before the marker.
  mkdir -p "$SCRATCH/finder" && : > "$SCRATCH/finder/.DS_Store"
  ( JOBDESK_HOME="$SCRATCH/finder"; check_home_location ) >/dev/null 2>&1
  expect_eq "a folder with only .DS_Store is fine" "$?" 0
  mkdir -p "$SCRATCH/legacy/bin" && : > "$SCRATCH/legacy/bin/jobdesk" && : > "$SCRATCH/legacy/config.env"
  ( JOBDESK_HOME="$SCRATCH/legacy"; check_home_location ) >/dev/null 2>&1
  expect_eq "an unmarked older install is adopted" "$?" 0
  ( JOBDESK_HOME="$SCRATCH/fresh-home"; prepare_home && [ -f "$SCRATCH/fresh-home/.jobdesk-home" ] ) >/dev/null 2>&1
  expect_eq "new JOBDESK_HOME gets its marker" "$?" 0

  # A refused layout leaves nothing behind (it used to create the folder first).
  ( JOBDESK_ALLOW_ROOT=1 JOBDESK_HOME="$SCRATCH/n4/co/.jd" "$BASH" "$ROOT/install.sh" --yes --no-launch --dir="$SCRATCH/n4/co" ) >/dev/null 2>&1
  expect_eq "JOBDESK_HOME inside career-ops refused by the installer" "$?" 1
  expect_false "refusal created nothing" test -e "$SCRATCH/n4"

  # Start times don't depend on the time zone or language.
  a=$(TZ=Asia/Tokyo proc_start $$)
  b=$(exec 2>/dev/null; TZ=UTC LC_ALL=de_DE.UTF-8 LANG=de_DE.UTF-8 proc_start $$)
  expect_eq "proc_start is TZ/locale independent" "$a" "$b"
  # Spelled out: a range like [ -~] collates by locale (en_US.UTF-8 rejects ASCII).
  case "$a" in
    ''|*[!\ :0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz]*) fail "proc_start format: [$a]" ;;
    *) pass ;;
  esac

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

  # Install locks are symlinks "pid|start time". A stale one whose PID now
  # belongs to another process is taken over...
  JOBDESK_HOME="$SCRATCH/lockhome"
  mkdir -p "$JOBDESK_HOME"
  sleep 60 &
  other=$!
  ln -s "$other|Mon Jan  1 00:00:00 2001" "$JOBDESK_HOME/.install-lock"
  ( acquire_lock && case "$(readlink "$JOBDESK_HOME/.install-lock")" in "$$|"*) exit 0 ;; esac; exit 1 ) >/dev/null 2>&1
  expect_eq "stale lock with a reused PID is taken over" "$?" 0
  # ...but a live holder is respected...
  rm -f "$JOBDESK_HOME/.install-lock"
  ln -s "$(lock_value "$other")" "$JOBDESK_HOME/.install-lock"
  ( acquire_lock ) >/dev/null 2>&1
  expect_eq "live lock holder respected" "$?" 1
  expect_eq "...and its lock left alone" "$(readlink "$JOBDESK_HOME/.install-lock")" "$(lock_value "$other")"
  # ...and a lock folder from an earlier JobDesk is stale.
  rm -f "$JOBDESK_HOME/.install-lock"
  mkdir -p "$JOBDESK_HOME/.install-lock" && printf '%s\n' "$other" > "$JOBDESK_HOME/.install-lock/pid"
  ( acquire_lock && [ -L "$JOBDESK_HOME/.install-lock" ] ) >/dev/null 2>&1
  expect_eq "old lock folder replaced" "$?" 0
  kill "$other" 2>/dev/null
  wait "$other" 2>/dev/null

  # Files planted next to a downloaded installer (no .git) are never used.
  plant="$SCRATCH/plant"
  mkdir -p "$plant/bin" "$plant/macos" "$SCRATCH/nocurl"
  cp "$ROOT/install.sh" "$plant/install.sh"
  printf '#!/bin/sh\necho planted\n' > "$plant/bin/jobdesk"
  : > "$plant/macos/JobDesk.applescript"
  printf '6.6.6\n' > "$plant/VERSION"
  printf '#!/bin/sh\nexit 22\n' > "$SCRATCH/nocurl/curl"
  chmod +x "$SCRATCH/nocurl/curl"
  out=$( (
    unset JOBDESK_SRC_DIR
    JOBDESK_SOURCE_ONLY=1 . "$plant/install.sh"
    setup_colors
    WORK_DIR="$SCRATCH/work"; LOG_FILE=""
    mkdir -p "$WORK_DIR"
    PATH="$SCRATCH/nocurl:$PATH" fetch_source
    printf 'SRC=%s' "$SRC_DIR"
  ) 2>&1 )
  case "$out" in
    *"Couldn't download JobDesk"*) pass ;;
    *) fail "planted source was trusted: $out" ;;
  esac

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
  listener=$!
  i=0
  while ! port_in_use "$port" && [ $i -lt 50 ]; do sleep 0.1; i=$(( i + 1 )); done
  expect_true "listener detected" port_in_use "$port"
  expect_eq "pick_port skips busy port" "$(pick_port "$port")" $(( port + 1 ))
  kill "$listener" 2>/dev/null
  wait "$listener" 2>/dev/null

  # is_server_pid only trusts Next.js server processes.
  expect_false "own shell isn't a server" is_server_pid $$
  expect_false "junk pid" is_server_pid "12abc"
  expect_false "empty pid" is_server_pid ""
  bash -c 'exec -a next-server sleep 30' &
  fake=$!
  sleep 0.3
  expect_true "next-server process recognized" is_server_pid "$fake"

  # The PID file carries the start time: a reused PID isn't "our" server.
  mkdir -p "$RUN_DIR"
  write_pid_file "$PID_FILE" "$fake"
  expect_eq "running_pid with a matching start time" "$(running_pid)" "$fake"
  printf '%s\nMon Jan  1 00:00:00 2001\n' "$fake" > "$PID_FILE"
  expect_false "running_pid rejects a reused PID" running_pid
  printf '%s\n' "$fake" > "$PID_FILE"
  expect_false "running_pid rejects a PID file without a start time" running_pid
  write_pid_file "$PID_FILE" "$fake"
  expect_eq "...and accepts it again with the right start time" "$(TZ=Pacific/Auckland running_pid)" "$fake"
  kill "$fake" 2>/dev/null
  wait "$fake" 2>/dev/null
  printf '999999\n' > "$PID_FILE"
  expect_false "stale pid file" running_pid

  # `stop` marks the pid it takes down, so a `start` still waiting on that
  # server exits quietly instead of reporting a failure.
  bash -c 'exec -a next-server sleep 30' &
  fake=$!
  sleep 0.3
  write_pid_file "$PID_FILE" "$fake"
  rm -f "$STOP_MARK"
  expect_false "no stop requested yet" stopped_on_request "$fake"
  ( QUIET=1 cmd_stop ) >/dev/null
  wait "$fake" 2>/dev/null
  expect_false "stop took the server down" kill -0 "$fake" 2>/dev/null
  expect_true "stop marked the pid it stopped" stopped_on_request "$fake"
  expect_false "the mark names only that pid" stopped_on_request 999999
  expect_false "an empty pid never matches" stopped_on_request ""
  rm -f "$STOP_MARK"
  expect_false "nothing healthy on a closed port" healthy 47399

  # stop_pid takes down the whole tree, including a child in its own process
  # group (how Codex runs are started).
  bash -c 'set -m; sleep 300 & echo $! > "$1"; wait' _ "$SCRATCH/child.pid" &
  server=$!
  i=0
  while [ ! -s "$SCRATCH/child.pid" ] && [ $i -lt 50 ]; do sleep 0.1; i=$(( i + 1 )); done
  child=$(cat "$SCRATCH/child.pid")
  expect_eq "test child has its own process group" "$(ps -o pgid= -p "$child" | tr -d ' ')" "$child"
  case " $(descendants_of "$server") " in
    *" $child "*) pass ;;
    *) fail "descendants_of finds the child" ;;
  esac
  stop_pid "$server"
  wait "$server" 2>/dev/null
  expect_false "server stopped" kill -0 "$server" 2>/dev/null
  expect_false "detached child stopped too" kill -0 "$child" 2>/dev/null

  # A stale start lock (dead owner) doesn't hold up `start`.
  mkdir -p "$RUN_DIR"
  ln -s "999999|Mon Jan  1 00:00:00 2001" "$START_LOCK"
  ( acquire_start_lock && case "$(readlink "$START_LOCK")" in "$$|"*) exit 0 ;; esac; exit 1 ) >/dev/null 2>&1
  expect_eq "stale start lock replaced" "$?" 0
  rm -f "$START_LOCK"

  expect_true "valid config port" valid_port 4788
  expect_false "config port with a leading zero" valid_port 08080

  JOBDESK_AI=gemini
  expect_eq "ai bin name" "$(ai_bin_name)" gemini
  JOBDESK_AI=none
  expect_false "no ai bin for none" ai_bin_name

  # The installed layout: JOBDESK_HOME comes from the script's own location,
  # even when reached through a symlink and with a different $HOME.
  inst="$SCRATCH/inst/.jobdesk"
  mkdir -p "$inst/bin" "$SCRATCH/links"
  cp "$ROOT/bin/jobdesk" "$inst/bin/jobdesk"
  : > "$inst/.jobdesk-home"
  printf 'JOBDESK_PORT=4999\n' > "$inst/config.env"
  ln -s "$inst/bin/jobdesk" "$SCRATCH/links/jobdesk"
  got=$(HOME=/nonexistent JOBDESK_SOURCE_ONLY=1 "$BASH" -c '. "$1"; printf "%s %s" "$JOBDESK_HOME" "$JOBDESK_PORT"' _ "$SCRATCH/links/jobdesk")
  expect_eq "self-locating install" "$got" "$inst 4999"
  printf 'JOBDESK_PORT=08080\n' > "$inst/config.env"
  got=$(JOBDESK_SOURCE_ONLY=1 "$BASH" -c '. "$1"; printf "%s" "$JOBDESK_PORT"' _ "$inst/bin/jobdesk")
  expect_eq "a bad port in config.env falls back to the default" "$got" 4788

  # Uninstall removes only JobDesk's own files...
  u="$SCRATCH/uninst"
  mkdir -p "$u/home/.jobdesk/bin" "$u/home/.jobdesk/ui/build-1" "$u/home/.jobdesk/runtime" "$u/home/career-ops"
  cp "$ROOT/bin/jobdesk" "$u/home/.jobdesk/bin/jobdesk"
  : > "$u/home/.jobdesk/.jobdesk-home"
  printf 'my notes\n' > "$u/home/.jobdesk/notes.txt"
  printf 'MY CV\n' > "$u/home/career-ops/cv.md"
  printf 'JOBDESK_CAREER_OPS_DIR=%s\n' "$u/home/career-ops" > "$u/home/.jobdesk/config.env"
  HOME="$u/home" "$BASH" "$u/home/.jobdesk/bin/jobdesk" uninstall --yes >/dev/null 2>&1
  expect_eq "uninstall exit" "$?" 0
  expect_false "JobDesk's own files removed" test -e "$u/home/.jobdesk/bin"
  expect_eq "unrelated file in JobDesk's folder kept" "$(cat "$u/home/.jobdesk/notes.txt" 2>/dev/null)" "my notes"
  expect_true "folder stays marked, so reinstalling works" test -f "$u/home/.jobdesk/.jobdesk-home"
  expect_eq "career-ops data kept" "$(cat "$u/home/career-ops/cv.md" 2>/dev/null)" "MY CV"

  # ...refuses when career-ops lives inside JobDesk's folder...
  v="$SCRATCH/uninst2"
  mkdir -p "$v/home/.jobdesk/bin" "$v/home/.jobdesk/career-ops"
  cp "$ROOT/bin/jobdesk" "$v/home/.jobdesk/bin/jobdesk"
  : > "$v/home/.jobdesk/.jobdesk-home"
  printf 'MY CV\n' > "$v/home/.jobdesk/career-ops/cv.md"
  printf 'JOBDESK_CAREER_OPS_DIR=%s\n' "$v/home/.jobdesk/career-ops" > "$v/home/.jobdesk/config.env"
  HOME="$v/home" "$BASH" "$v/home/.jobdesk/bin/jobdesk" uninstall --yes >/dev/null 2>&1
  expect_eq "uninstall refuses with data inside" "$?" 1
  expect_eq "data inside JobDesk's folder kept" "$(cat "$v/home/.jobdesk/career-ops/cv.md" 2>/dev/null)" "MY CV"

  # ...refuses when a symlink hides career-ops inside JobDesk's folder...
  y="$SCRATCH/uninst4"
  mkdir -p "$y/home/.jobdesk/bin" "$y/home/.jobdesk/tools"
  cp "$ROOT/bin/jobdesk" "$y/home/.jobdesk/bin/jobdesk"
  : > "$y/home/.jobdesk/.jobdesk-home"
  printf 'MY CV\n' > "$y/home/.jobdesk/tools/cv.md"
  ln -s "$y/home/.jobdesk" "$y/home/jdlink"
  printf 'JOBDESK_CAREER_OPS_DIR=%s\n' "$y/home/jdlink/tools" > "$y/home/.jobdesk/config.env"
  HOME="$y/home" "$BASH" "$y/home/.jobdesk/bin/jobdesk" uninstall --yes >/dev/null 2>&1
  expect_eq "uninstall refuses a symlinked nesting" "$?" 1
  expect_eq "symlinked data kept" "$(cat "$y/home/.jobdesk/tools/cv.md" 2>/dev/null)" "MY CV"
  # ...refuses when any of its folders holds what looks like career-ops data...
  printf 'JOBDESK_CAREER_OPS_DIR=%s\n' "$y/home/elsewhere" > "$y/home/.jobdesk/config.env"
  HOME="$y/home" "$BASH" "$y/home/.jobdesk/bin/jobdesk" uninstall --yes >/dev/null 2>&1
  expect_eq "uninstall refuses to delete a folder with a cv.md" "$?" 1
  expect_eq "that cv.md kept" "$(cat "$y/home/.jobdesk/tools/cv.md" 2>/dev/null)" "MY CV"

  # ...and refuses without the install marker.
  w="$SCRATCH/uninst3"
  mkdir -p "$w/home/.jobdesk/bin"
  cp "$ROOT/bin/jobdesk" "$w/home/.jobdesk/bin/jobdesk"
  printf 'x\n' > "$w/home/.jobdesk/keep.txt"
  HOME="$w/home" JOBDESK_HOME="$w/home/.jobdesk" "$BASH" "$w/home/.jobdesk/bin/jobdesk" uninstall --yes >/dev/null 2>&1
  expect_eq "uninstall refuses without the marker" "$?" 1
  expect_true "nothing removed without the marker" test -f "$w/home/.jobdesk/keep.txt"

  printf 'bin/jobdesk: %s passed, %s failed\n' "$PASSED" "$FAILED"
  [ "$FAILED" = 0 ]
) || FAILED=$(( FAILED + 1 ))

# ── DMG edition: server env, launcher, setup config ───────────────────────
(
  PASSED=0
  FAILED=0
  d="$SCRATCH/dmg"
  mkdir -p "$d/home/.jobdesk/bin" "$d/home/.jobdesk/shims" "$d/home/.jobdesk/browsers"
  cp "$ROOT/bin/jobdesk" "$d/home/.jobdesk/bin/jobdesk"
  : > "$d/home/.jobdesk/.jobdesk-home"
  printf 'JOBDESK_EDITION=dmg\n' > "$d/home/.jobdesk/config.env"
  printf 'ANTHROPIC_API_KEY=%q\n' "sk-ant-test key" > "$d/home/.jobdesk/secrets.env"
  printf 'ANTHROPIC_CUSTOM_HEADERS=%q\n' "anthropic-workspace-id: wrkspc_test" >> "$d/home/.jobdesk/secrets.env"
  env_of() {  # the server's env, as dmg_server_env sets it up
    HOME="$d/home" JOBDESK_SOURCE_ONLY=1 "$BASH" -c '. "$1"; dmg_server_env; env' _ "$d/home/.jobdesk/bin/jobdesk"
  }
  expect_true "the key reaches the server" sh -c 'grep -qx "ANTHROPIC_API_KEY=sk-ant-test key"' < <(env_of)
  case "$(env_of)" in *"ANTHROPIC_CUSTOM_HEADERS=anthropic-workspace-id: wrkspc_test"*) pass ;; *) fail "the workspace header reaches the server" ;; esac
  case "$(env_of)" in *"PLAYWRIGHT_BROWSERS_PATH=$d/home/.jobdesk/browsers"*) pass ;; *) fail "the PDF browser path reaches the server" ;; esac
  case "$(env_of)" in *"CLAUDE_CONFIG_DIR=$d/home/.jobdesk/claude"*) pass ;; *) fail "Claude keeps its settings inside JobDesk's folder" ;; esac
  case "$(env_of)" in *"DISABLE_AUTOUPDATER=1"*) pass ;; *) fail "Claude never updates itself in the DMG edition" ;; esac
  got=$(HOME="$d/home" JOBDESK_SOURCE_ONLY=1 "$BASH" -c '. "$1"; server_path' _ "$d/home/.jobdesk/bin/jobdesk")
  case "$got" in "$d/home/.jobdesk/shims:"*) pass ;; *) fail "shims come first on the server's PATH: $got" ;; esac

  # The Terminal edition has none of it.
  t="$SCRATCH/dmg-terminal"
  mkdir -p "$t/home/.jobdesk/bin"
  cp "$ROOT/bin/jobdesk" "$t/home/.jobdesk/bin/jobdesk"
  : > "$t/home/.jobdesk/.jobdesk-home"
  got=$(HOME="$t/home" ANTHROPIC_API_KEY='' CLAUDE_CONFIG_DIR='' JOBDESK_SOURCE_ONLY=1 "$BASH" -c '. "$1"; dmg_server_env; printf "%s|%s|%s" "${ANTHROPIC_API_KEY:-}" "${CLAUDE_CONFIG_DIR:-}" "$(server_path)"' _ "$t/home/.jobdesk/bin/jobdesk")
  case "$got" in "||$t/home/.jobdesk/node/bin:"*) pass ;; *) fail "Terminal edition: no key, no Claude dir, no shims: $got" ;; esac

  # `update` and `login` point a DMG user at the DMG, and change nothing.
  got=$(HOME="$d/home" "$BASH" "$d/home/.jobdesk/bin/jobdesk" update 2>&1)
  expect_eq "DMG update exits 0" "$?" 0
  case "$got" in *"JobDesk.dmg"*) pass ;; *) fail "DMG update explains itself: $got" ;; esac
  got=$(HOME="$d/home" "$BASH" "$d/home/.jobdesk/bin/jobdesk" login 2>&1 < /dev/null)
  expect_eq "DMG login exits 0" "$?" 0

  # write_config: the edition line only when there is one.
  (
    PASSED=0
    FAILED=0
    export HOME="$d/cfg"
    mkdir -p "$HOME/.jobdesk"
    # shellcheck source=../install.sh
    JOBDESK_SOURCE_ONLY=1 . "$ROOT/install.sh"
    JOBDESK_HOME="$HOME/.jobdesk" CAREER_OPS_DIR="$HOME/career-ops" PORT=4788 AI=claude APP_PATH=/Applications/JobDesk.app
    EDITION=""
    ( write_config ) >/dev/null 2>&1
    expect_eq "write_config without an edition succeeds" "$?" 0
    expect_false "...and writes no edition" grep -q JOBDESK_EDITION "$JOBDESK_HOME/config.env"
    EDITION=dmg
    ( write_config ) >/dev/null 2>&1
    expect_eq "write_config with an edition succeeds" "$?" 0
    expect_true "...and records it" grep -qx 'JOBDESK_EDITION=dmg' "$JOBDESK_HOME/config.env"
    printf '%s %s\n' "$PASSED" "$FAILED" > "$d/cfg.result"
  )
  read -r p f < "$d/cfg.result"
  PASSED=$(( PASSED + p )); FAILED=$(( FAILED + f ))

  # The launcher, in a fake app with a test home.
  app="$d/Apps/JobDesk.app"
  res="$app/Contents/Resources"
  mkdir -p "$res/payload" "$d/lhome" "$d/tmp"
  cp "$ROOT/macos/dmg/launch" "$res/launch"
  printf '%s\n' "$d/lhome" > "$res/test-home"
  printf 'build-1\n' > "$res/payload/build-id"
  L() { TMPDIR="$d/tmp" "$BASH" "$res/launch" "$@"; }
  expect_eq "launcher: an app in a normal folder" "$(L where)" ok
  expect_eq "launcher: nothing set up yet" "$(L needs-setup)" yes
  mkdir -p "$d/lhome/.jobdesk/bin"
  printf '#!/bin/bash\nprintf "ran:%%s" "$*"\n' > "$d/lhome/.jobdesk/bin/jobdesk"
  chmod 755 "$d/lhome/.jobdesk/bin/jobdesk"
  printf 'build-0\n' > "$d/lhome/.jobdesk/.dmg-build"
  expect_eq "launcher: set up from an older build" "$(L needs-setup)" yes
  printf 'build-1\n' > "$d/lhome/.jobdesk/.dmg-build"
  expect_eq "launcher: set up from this build" "$(L needs-setup)" no
  expect_eq "launcher: passes commands to jobdesk" "$(L alive)" "ran:alive"
  printf '40|Unpacking\n' > "$d/tmp/jobdesk-setup.status"
  rm -f "$d/tmp/jobdesk-setup.status.pid"
  case "$(L setup-status)" in failed\|*) pass ;; *) fail "launcher: a setup that died reports failure" ;; esac
  sleep 30 &
  printf '%s\n' "$!" > "$d/tmp/jobdesk-setup.status.pid"
  expect_eq "launcher: a running setup reports progress" "$(L setup-status)" "40|Unpacking"
  kill "$!" 2>/dev/null
  wait "$!" 2>/dev/null
  printf 'done|\n' > "$d/tmp/jobdesk-setup.status"
  expect_eq "launcher: a finished setup" "$(L setup-status)" "done|"
  got=$(HOME="$d/lhome" TMPDIR="$d/tmp" "$BASH" -c 'unset HOME; "$BASH" "$1" where' _ "$res/launch")
  expect_eq "launcher: works with no HOME (do shell script)" "$got" ok

  printf 'DMG edition: %s passed, %s failed\n' "$PASSED" "$FAILED"
  [ "$FAILED" = 0 ]
) || FAILED=$(( FAILED + 1 ))

if [ "$FAILED" = 0 ]; then
  printf 'All unit tests passed.\n'
else
  printf 'Unit tests FAILED.\n'
  exit 1
fi
