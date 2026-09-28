#!/bin/bash
# JobDesk installer: career-ops and its web UI on your Mac, opened from a JobDesk app.
#
#   curl -fsSL https://raw.githubusercontent.com/martialstudios/jobdesk/main/install.sh | bash
#
# Run the same line again any time to update or repair. Your CV, tracker,
# reports and PDFs are never touched. See usage() below for the options.
#
# What goes where: career-ops (with your data) in ~/career-ops; a private
# Node.js, the built web UI, logs and settings in ~/.jobdesk; JobDesk.app in
# /Applications (or ~/Applications). Nothing needs sudo.
#
# Everything is inside functions and runs from the last line, so a download
# cut off halfway does nothing. Stays compatible with macOS's bash 3.2.

set -u
set -o pipefail

JOBDESK_REPO="${JOBDESK_REPO:-martialstudios/jobdesk}"
JOBDESK_REF="${JOBDESK_REF:-main}"
JOBDESK_HOME="${JOBDESK_HOME:-$HOME/.jobdesk}"
NODE_MAJOR=24
MIN_MACOS=13.5
CAREER_OPS_GIT="${JOBDESK_CAREER_OPS_GIT:-https://github.com/career-ops-hq/career-ops.git}"
DEFAULT_PORT=4788
APP_BUNDLE_ID=com.martialstudios.jobdesk
NEED_KB=$(( 3 * 1024 * 1024 ))
# The only things JobDesk creates in JOBDESK_HOME; uninstall removes exactly these.
HOME_MARKER=".jobdesk-home"

# A git that can't reach a repo must fail, not wait for a password prompt.
export GIT_TERMINAL_PROMPT=0

OPT_AI=""
OPT_DIR=""
OPT_PORT=""
OPT_YES=0
OPT_LAUNCH=1
OPT_UPDATE=0

LOG_FILE=""
WORK_DIR=""
CURRENT_PID=""
CLAUDE_CHECK_OUTPUT=""
LOCK_DIR=""
SRC_DIR=""
JOBDESK_VERSION=""
PLATFORM=""
ARCH=""
CAREER_OPS_DIR=""
PORT=""
AI=""
AI_BIN=""
AI_NEW=0
APP_PATH=""
WAS_RUNNING=0
FINISHED=0
FIRST_INSTALL=0
FRESH_CAREER_OPS=0
EXISTING_DIR=""
EXISTING_PORT=""
EXISTING_AI=""
EXISTING_APP=""
ORIG_PATH="$PATH"

usage() {
  cat <<EOF
JobDesk installer: career-ops and its web UI on your Mac.

  curl -fsSL https://raw.githubusercontent.com/$JOBDESK_REPO/main/install.sh | bash

Options (after "bash -s --" when piping):
  --ai=claude|codex|gemini|none   AI helper to set up (default: ask; Claude)
  --dir=PATH                      your career-ops folder (default: ~/career-ops)
  --port=N                        local port for the web UI (default: $DEFAULT_PORT)
  --yes                           don't ask questions; use the defaults
  --no-launch                     don't open JobDesk at the end
  --update                        what "jobdesk update" runs

Run it again any time to update or repair; your data is never touched.
More: https://github.com/$JOBDESK_REPO
EOF
}

# ── output ────────────────────────────────────────────────────────────────

setup_colors() {
  if [ -t 1 ]; then
    BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'
    RED=$'\033[31m'; RESET=$'\033[0m'; CLEAR_EOL=$'\033[K'
  else
    BOLD=""; DIM=""; GREEN=""; YELLOW=""; RED=""; RESET=""; CLEAR_EOL=""
  fi
}

step() { printf '\n%s==>%s %s%s%s\n' "$GREEN" "$RESET" "$BOLD" "$*" "$RESET"; log "== $*"; }
info() { printf '    %s\n' "$*"; }
ok() { printf '    %s✓%s %s\n' "$GREEN" "$RESET" "$*"; log "ok: $*"; }
warn() { printf '    %s!%s %s\n' "$YELLOW" "$RESET" "$*"; log "warn: $*"; }
log() {
  if [ -n "$LOG_FILE" ]; then
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"
  fi
}

die() {
  log "FATAL: $*"
  printf '\n%s✗ %s%s\n' "$RED" "$*" "$RESET" >&2
  if [ -n "$LOG_FILE" ]; then
    printf '  Details are in the log: %s\n' "$LOG_FILE" >&2
  fi
  printf '  Re-running the same install command is safe; it picks up where it stopped.\n' >&2
  exit 1
}

# run_step "what" cmd...: run quietly (output goes to the log) with a timer.
run_step() {
  local what="$1" pid rc start now
  shift
  log "run: $*"
  start=$(date +%s)
  "$@" < /dev/null >> "$LOG_FILE" 2>&1 &
  pid=$!
  CURRENT_PID=$pid
  if [ -t 1 ]; then
    while kill -0 "$pid" 2>/dev/null; do
      now=$(( $(date +%s) - start ))
      printf '\r    %s %s%dm%02ds%s%s' "$what" "$DIM" $(( now / 60 )) $(( now % 60 )) "$RESET" "$CLEAR_EOL"
      sleep 1
    done
  fi
  if wait "$pid"; then rc=0; else rc=$?; fi
  CURRENT_PID=""
  now=$(( $(date +%s) - start ))
  if [ "$rc" -eq 0 ]; then
    printf '\r    %s✓%s %s %s(%ds)%s%s\n' "$GREEN" "$RESET" "$what" "$DIM" "$now" "$RESET" "$CLEAR_EOL"
  else
    printf '\r    %s✗%s %s%s\n' "$RED" "$RESET" "$what" "$CLEAR_EOL"
    log "exit $rc: $*"
  fi
  return "$rc"
}

# ── questions (read from the terminal even under `curl | bash`) ───────────

can_prompt() {
  [ "$OPT_YES" = 0 ] || return 1
  { : < /dev/tty; } 2>/dev/null
}

# ask "question" default → prints the answer
ask() {
  local answer=""
  if ! can_prompt; then
    printf '%s' "$2"
    return 0
  fi
  printf '%s ' "$1" > /dev/tty
  IFS= read -r answer < /dev/tty || answer=""
  printf '%s' "${answer:-$2}"
}

# ask_yn "question" Y|N → success for yes
ask_yn() {
  local hint="[y/N]" answer
  [ "$2" = Y ] && hint="[Y/n]"
  answer=$(ask "    $1 $hint" "$2")
  case "$answer" in
    y|Y|yes|Yes|YES) return 0 ;;
    n|N|no|No|NO) return 1 ;;
  esac
  [ "$2" = Y ]
}

# ── small helpers ─────────────────────────────────────────────────────────

# version_ge A B: true when dotted version A >= B.
version_ge() {
  local IFS=. i x y
  # shellcheck disable=SC2206  # word splitting on dots is the point
  local a=($1) b=($2)
  for i in 0 1 2; do
    x="${a[$i]:-0}"; y="${b[$i]:-0}"
    x="${x%%[!0-9]*}"; y="${y%%[!0-9]*}"
    [ "${x:-0}" -gt "${y:-0}" ] && return 0
    [ "${x:-0}" -lt "${y:-0}" ] && return 1
  done
  return 0
}

# A usable local port: digits only, no leading zero, 1024-65000.
valid_port() {
  case "$1" in ''|*[!0-9]*|0*|??????*) return 1 ;; esac
  [ "$1" -ge 1024 ] && [ "$1" -le 65000 ]
}

sha256_of() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

core_version_of() { awk 'NR==1 {print $1}' "$1/VERSION" 2>/dev/null; }

# is_inside CHILD PARENT: CHILD is PARENT or somewhere below it.
is_inside() {
  case "${1%/}/" in "${2%/}/"*) return 0 ;; esac
  return 1
}

find_cli() {
  local d
  for d in "$JOBDESK_HOME/tools/bin" "$HOME/.local/bin" /opt/homebrew/bin /usr/local/bin; do
    if [ -x "$d/$1" ]; then
      printf '%s' "$d/$1"
      return 0
    fi
  done
  command -v "$1" 2>/dev/null
}

# run_with_timeout SECONDS cmd...
run_with_timeout() {
  local secs="$1" pid i=0
  shift
  "$@" &
  pid=$!
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$i" -ge "$secs" ]; then
      kill -TERM "$pid" 2>/dev/null
      break
    fi
    sleep 1
    i=$(( i + 1 ))
  done
  wait "$pid"
}

# Start time of a process, so a PID the system has since reused isn't
# mistaken for the process that wrote a lock.
proc_start() { ps -o lstart= -p "$1" 2>/dev/null | sed 's/  */ /g; s/^ //; s/ $//'; }

# Every process descended from $1.
descendants_of() {
  local table queue next p child found=""
  table=$(ps -A -o pid=,ppid= 2>/dev/null) || return 0
  queue="$1"
  while [ -n "$queue" ]; do
    next=""
    for p in $queue; do
      for child in $(printf '%s\n' "$table" | awk -v pp="$p" '$2 == pp {print $1}'); do
        found="$found $child"
        next="$next $child"
      done
    done
    queue="$next"
  done
  printf '%s' "$found"
}

lock_holder_alive() {
  local pid start
  pid=$(sed -n 1p "$1/pid" 2>/dev/null)
  start=$(sed -n 2p "$1/pid" 2>/dev/null)
  case "$pid" in ''|*[!0-9]*) return 1 ;; esac
  kill -0 "$pid" 2>/dev/null || return 1
  [ -z "$start" ] || [ "$(proc_start "$pid")" = "$start" ]
}

# Background steps ignore Ctrl-C (no job control), and closing Terminal only
# reaches us, so stop a step still running, with everything it started.
kill_step() {
  local p
  [ -n "$CURRENT_PID" ] || return 0
  for p in $(descendants_of "$CURRENT_PID") "$CURRENT_PID"; do
    kill -TERM "$p" 2>/dev/null
  done
  CURRENT_PID=""
}

cleanup() {
  kill_step
  [ -n "$WORK_DIR" ] && rm -rf "$WORK_DIR"
  release_lock
  # A failed update shouldn't leave JobDesk stopped: bring the previous version back.
  if [ "$WAS_RUNNING" = 1 ] && [ "$FINISHED" = 0 ] && [ -x "$JOBDESK_HOME/bin/jobdesk" ]; then
    if "$JOBDESK_HOME/bin/jobdesk" start >/dev/null 2>&1; then
      printf '  JobDesk is running again with the version you had before.\n' >&2
    fi
  fi
}

release_lock() {
  if [ -n "$LOCK_DIR" ] && [ -d "$LOCK_DIR" ]; then
    if [ "$(sed -n 1p "$LOCK_DIR/pid" 2>/dev/null)" = "$$" ]; then
      rm -rf "$LOCK_DIR"
    fi
  fi
  LOCK_DIR=""
}

acquire_lock() {
  local lock="$JOBDESK_HOME/.install-lock"
  if ! mkdir "$lock" 2>/dev/null; then
    # A lock made a moment ago may not have its pid file yet.
    [ -f "$lock/pid" ] || sleep 1
    if lock_holder_alive "$lock"; then
      die "Another JobDesk install or update is already running (process $(sed -n 1p "$lock/pid")). Let it finish, then try again."
    fi
    rm -rf "$lock"
    mkdir "$lock" 2>/dev/null || die "Couldn't create $lock."
  fi
  { printf '%s\n' "$$"; proc_start "$$"; } > "$lock/pid"
  LOCK_DIR="$lock"
}

# ── steps ─────────────────────────────────────────────────────────────────

parse_args() {
  local arg
  for arg in "$@"; do
    case "$arg" in
      --ai=*) OPT_AI="${arg#--ai=}" ;;
      --dir=*) OPT_DIR="${arg#--dir=}" ;;
      --port=*) OPT_PORT="${arg#--port=}" ;;
      --yes|-y) OPT_YES=1 ;;
      --no-launch) OPT_LAUNCH=0 ;;
      --update) OPT_UPDATE=1 ;;
      --help|-h) usage; exit 0 ;;
      *) printf 'Unknown option: %s (try --help)\n' "$arg" >&2; exit 2 ;;
    esac
  done
  [ "${JOBDESK_YES:-0}" = 1 ] && OPT_YES=1
  [ "${JOBDESK_NO_LAUNCH:-0}" = 1 ] && OPT_LAUNCH=0
  [ -z "$OPT_AI" ] && OPT_AI="${JOBDESK_AI_CHOICE:-}"
  case "$OPT_AI" in
    ''|claude|codex|gemini|none) ;;
    *) printf 'Unknown --ai value: %s (use claude, codex, gemini or none)\n' "$OPT_AI" >&2; exit 2 ;;
  esac
  if [ -n "$OPT_PORT" ] && ! valid_port "$OPT_PORT"; then
    printf 'The port must be a whole number from 1024 to 65000.\n' >&2
    exit 2
  fi
}

detect_platform() {
  case "$(uname -s)" in
    Darwin) PLATFORM=darwin ;;
    Linux) PLATFORM=linux ;;
    *) die "JobDesk is made for macOS. This computer runs $(uname -s)." ;;
  esac
  if [ "$PLATFORM" = darwin ]; then
    # Rosetta reports x86_64 from uname; ask the hardware instead.
    if [ "$(sysctl -in hw.optional.arm64 2>/dev/null)" = 1 ]; then ARCH=arm64; else ARCH=x64; fi
    local mac
    mac=$(sw_vers -productVersion 2>/dev/null)
    version_ge "$mac" "$MIN_MACOS" ||
      die "JobDesk needs macOS $MIN_MACOS (Ventura) or newer, and this Mac has $mac. Update in System Settings → General → Software Update."
  else
    case "$(uname -m)" in
      x86_64|amd64) ARCH=x64 ;;
      aarch64|arm64) ARCH=arm64 ;;
      *) die "Unsupported processor: $(uname -m)" ;;
    esac
  fi
  if [ "$(id -u)" = 0 ] && [ "${JOBDESK_ALLOW_ROOT:-0}" != 1 ]; then
    die "Please run the installer as yourself, not with sudo."
  fi
}

# JobDesk's folder must be its own: uninstall deletes what's in it.
prepare_home() {
  case "${JOBDESK_HOME%/}" in
    ''|/|"${HOME%/}") die "JOBDESK_HOME can't be $JOBDESK_HOME; use a folder of its own, like ~/.jobdesk." ;;
  esac
  if [ -d "$JOBDESK_HOME" ] && [ ! -f "$JOBDESK_HOME/$HOME_MARKER" ] && [ -n "$(ls -A "$JOBDESK_HOME" 2>/dev/null)" ]; then
    die "$JOBDESK_HOME already has other files in it. Point JOBDESK_HOME at an empty or new folder."
  fi
  mkdir -p "$JOBDESK_HOME/logs" || die "Couldn't create $JOBDESK_HOME."
  : > "$JOBDESK_HOME/$HOME_MARKER"
}

check_requirements() {
  local tool avail
  for tool in curl tar awk sed grep ps; do
    command -v "$tool" >/dev/null 2>&1 || die "The '$tool' command is missing on this computer."
  done
  avail=$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
  if [ -n "$avail" ] && [ "$avail" -lt "$NEED_KB" ]; then
    warn "Only about $(( avail / 1024 / 1024 )) GB of disk space is free; JobDesk needs about 2 GB."
    ask_yn "Continue anyway?" N || die "Free up some disk space, then run the installer again."
  fi
}

load_existing_config() {
  local cfg="$JOBDESK_HOME/config.env"
  if [ ! -f "$cfg" ]; then
    FIRST_INSTALL=1
    return 0
  fi
  # shellcheck disable=SC1090
  EXISTING_DIR=$( . "$cfg" >/dev/null 2>&1; printf '%s' "${JOBDESK_CAREER_OPS_DIR:-}")
  # shellcheck disable=SC1090
  EXISTING_PORT=$( . "$cfg" >/dev/null 2>&1; printf '%s' "${JOBDESK_PORT:-}")
  # shellcheck disable=SC1090
  EXISTING_AI=$( . "$cfg" >/dev/null 2>&1; printf '%s' "${JOBDESK_AI:-}")
  # shellcheck disable=SC1090
  EXISTING_APP=$( . "$cfg" >/dev/null 2>&1; printf '%s' "${JOBDESK_APP:-}")
  valid_port "$EXISTING_PORT" || EXISTING_PORT=""
}

resolve_settings() {
  local dir="${OPT_DIR:-${EXISTING_DIR:-$HOME/career-ops}}"
  # shellcheck disable=SC2088  # matching a literal "~/" typed in --dir
  case "$dir" in
    "~") dir="$HOME" ;;
    "~/"*) dir="$HOME/${dir#\~/}" ;;
    /*) ;;
    *) dir="$PWD/$dir" ;;
  esac
  CAREER_OPS_DIR="${dir%/}"
  [ -n "$CAREER_OPS_DIR" ] || CAREER_OPS_DIR=/
  if is_inside "$CAREER_OPS_DIR" "$JOBDESK_HOME"; then
    die "Keep your career-ops folder outside $JOBDESK_HOME (JobDesk's own folder, which uninstall removes). For example: --dir=$HOME/career-ops"
  fi
  if is_inside "$JOBDESK_HOME" "$CAREER_OPS_DIR"; then
    die "$JOBDESK_HOME can't be inside your career-ops folder ($CAREER_OPS_DIR)."
  fi
  PORT="${OPT_PORT:-${EXISTING_PORT:-$DEFAULT_PORT}}"
}

# Get this project's files: the git checkout we're running from (tests, CI),
# or the repo tarball for the same ref (`curl | bash` and `jobdesk update`).
# Files that merely sit next to a downloaded installer are never trusted.
fetch_source() {
  local here=""
  if [ -n "${JOBDESK_SRC_DIR:-}" ]; then
    SRC_DIR="$JOBDESK_SRC_DIR"
  else
    if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
      here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
    fi
    if [ -n "$here" ] && [ -e "$here/.git" ] && [ -f "$here/bin/jobdesk" ] && [ -f "$here/macos/JobDesk.applescript" ]; then
      SRC_DIR="$here"
    else
      mkdir -p "$WORK_DIR/src"
      curl -fsSL --retry 3 -o "$WORK_DIR/src.tar.gz" \
        "https://codeload.github.com/$JOBDESK_REPO/tar.gz/$JOBDESK_REF" ||
        die "Couldn't download JobDesk from GitHub. Check your internet connection."
      tar -xzf "$WORK_DIR/src.tar.gz" -C "$WORK_DIR/src" --strip-components=1 ||
        die "Couldn't unpack the JobDesk download."
      SRC_DIR="$WORK_DIR/src"
    fi
  fi
  [ -f "$SRC_DIR/bin/jobdesk" ] || die "JobDesk's files are missing from $SRC_DIR."
  JOBDESK_VERSION=$(tr -d ' \n' < "$SRC_DIR/VERSION" 2>/dev/null)
  [ -n "$JOBDESK_VERSION" ] || JOBDESK_VERSION=unknown
}

choose_ai() {
  local choice
  if [ -n "$OPT_AI" ]; then
    AI="$OPT_AI"
  elif [ -n "$EXISTING_AI" ]; then
    AI="$EXISTING_AI"
  elif can_prompt; then
    printf '\n%sWhich AI should read job posts and write your cover letters?%s\n' "$BOLD" "$RESET"
    printf '  It runs on your own AI account; JobDesk never sees your data.\n\n'
    printf '    1) Claude (recommended): a Claude Pro or Max plan, or an Anthropic API key\n'
    printf '    2) ChatGPT (Codex): a ChatGPT Plus or Pro plan\n'
    printf '    3) Gemini: free with a Google account (lower daily limits)\n'
    printf '    4) Skip: I will set one up myself later\n\n'
    choice=$(ask "  Choose 1-4 [1]:" 1)
    case "$choice" in
      2) AI=codex ;;
      3) AI=gemini ;;
      4) AI=none ;;
      *) AI=claude ;;
    esac
  else
    AI=claude
  fi
  case "$AI" in claude|codex|gemini|none) ;; *) AI=claude ;; esac
}

confirm_plan() {
  [ "$OPT_UPDATE" = 1 ] && return 0
  [ "$FIRST_INSTALL" = 1 ] || return 0
  can_prompt || return 0
  local ai_line=""
  case "$AI" in
    claude) ai_line="Claude Code (Anthropic's official installer), if it isn't installed yet" ;;
    codex) ai_line="Codex CLI (OpenAI), if it isn't installed yet" ;;
    gemini) ai_line="Gemini CLI (Google), if it isn't installed yet" ;;
  esac
  printf '\n%sJobDesk will install:%s\n' "$BOLD" "$RESET"
  printf '  • career-ops (latest release) in %s: your CV, tracker and PDFs live here\n' "$CAREER_OPS_DIR"
  printf '  • a private Node.js and the career-ops web UI in %s\n' "$JOBDESK_HOME"
  [ -n "$ai_line" ] && printf '  • %s\n' "$ai_line"
  [ "$PLATFORM" = darwin ] && printf '  • the JobDesk app in your Applications folder\n'
  printf '\n  About 5–10 minutes and 2 GB of disk. No password needed.\n\n'
  ask_yn "Continue?" Y || { printf 'Nothing was installed.\n'; exit 0; }
}

stop_running() {
  if [ -x "$JOBDESK_HOME/bin/jobdesk" ]; then
    if "$JOBDESK_HOME/bin/jobdesk" alive >/dev/null 2>&1; then
      WAS_RUNNING=1
      info "Stopping JobDesk while it updates..."
      "$JOBDESK_HOME/bin/jobdesk" stop --quiet >/dev/null 2>&1 || true
    fi
  fi
}

ensure_git() {
  step "Checking for git"
  if [ "$PLATFORM" = darwin ]; then
    local g i=0
    if xcode-select -p >/dev/null 2>&1; then
      if ! git --version >/dev/null 2>&1; then
        die "git is installed but won't run: $(git --version 2>&1 | head -n 1). If it mentions a license, run: sudo xcodebuild -license accept"
      fi
      ok "git (Apple's developer tools)"
      return 0
    fi
    for g in /opt/homebrew/bin/git /usr/local/bin/git; do
      if [ -x "$g" ] && "$g" --version >/dev/null 2>&1; then
        PATH="$(dirname "$g"):$PATH"
        export PATH
        ok "git ($g)"
        return 0
      fi
    done
    can_prompt || die "Apple's command line developer tools are needed for git. Run: xcode-select --install, then run this installer again."
    info "career-ops needs git, which comes with Apple's free developer tools."
    info "A window will pop up: click ${BOLD}Install${RESET} (not \"Get Xcode\") and agree."
    info "It takes 5–15 minutes. This installer continues on its own afterwards."
    xcode-select --install >/dev/null 2>&1 || true
    while ! xcode-select -p >/dev/null 2>&1; do
      if [ "$i" -ge 3600 ]; then
        die "The developer tools still aren't installed. Run: xcode-select --install, then run this installer again."
      fi
      printf '\r    Waiting for the developer tools %s%dm%02ds%s%s' "$DIM" $(( i / 60 )) $(( i % 60 )) "$RESET" "$CLEAR_EOL"
      sleep 5
      i=$(( i + 5 ))
    done
    printf '\r%s' "$CLEAR_EOL"
    git --version >/dev/null 2>&1 || die "The developer tools installed, but git still won't run: $(git --version 2>&1 | head -n 1)"
    ok "git (Apple's developer tools)"
  else
    command -v git >/dev/null 2>&1 || die "git is required. Install it with your package manager (for example: sudo apt install git), then run this again."
    ok "git"
  fi
}

ensure_node() {
  local want current name url expected actual runtime d
  step "Node.js $NODE_MAJOR (a private copy, just for JobDesk)"
  want="${JOBDESK_NODE_VERSION:-}"
  if [ -z "$want" ]; then
    curl -fsSL --retry 3 -o "$WORK_DIR/node-index.json" https://nodejs.org/dist/index.json ||
      die "Couldn't reach nodejs.org. Check your internet connection."
    grep -o "\"version\":\"v${NODE_MAJOR}\.[0-9]*\.[0-9]*\"" "$WORK_DIR/node-index.json" > "$WORK_DIR/node-versions" || true
    want=$(sed -n '1s/.*"\(v[0-9.]*\)"$/\1/p' "$WORK_DIR/node-versions")
    [ -n "$want" ] || die "Couldn't find a Node.js $NODE_MAJOR release on nodejs.org."
  fi
  current=$("$JOBDESK_HOME/node/bin/node" --version 2>/dev/null || true)
  if [ "$current" = "$want" ]; then
    ok "Node.js $current"
  else
    name="node-$want-$PLATFORM-$ARCH"
    url="https://nodejs.org/dist/$want"
    run_step "Downloading Node.js $want" curl -fsSL --retry 3 -o "$WORK_DIR/$name.tar.gz" "$url/$name.tar.gz" ||
      die "Couldn't download Node.js from nodejs.org."
    curl -fsSL --retry 3 -o "$WORK_DIR/SHASUMS256.txt" "$url/SHASUMS256.txt" ||
      die "Couldn't download the Node.js checksums."
    expected=$(awk -v f="$name.tar.gz" '$2 == f {print $1}' "$WORK_DIR/SHASUMS256.txt")
    actual=$(sha256_of "$WORK_DIR/$name.tar.gz")
    if [ -z "$expected" ] || [ "$expected" != "$actual" ]; then
      die "The Node.js download didn't match its published checksum, so it wasn't installed."
    fi
    runtime="$JOBDESK_HOME/runtime"
    mkdir -p "$runtime"
    rm -rf "${runtime:?}/$name.partial" "${runtime:?}/$name"
    mkdir -p "$runtime/$name.partial"
    tar -xzf "$WORK_DIR/$name.tar.gz" -C "$runtime/$name.partial" --strip-components=1 ||
      die "Couldn't unpack Node.js."
    mv "$runtime/$name.partial" "$runtime/$name"
    if [ -e "$JOBDESK_HOME/node" ] && [ ! -L "$JOBDESK_HOME/node" ]; then
      rm -rf "$JOBDESK_HOME/node"
    fi
    ln -sfn "runtime/$name" "$JOBDESK_HOME/node"
    for d in "$runtime"/node-*; do
      [ "$d" = "$runtime/$name" ] || rm -rf "$d"
    done
    ok "Node.js $want"
  fi
  PATH="$JOBDESK_HOME/node/bin:$PATH"
  export PATH
  export npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false
  export NEXT_TELEMETRY_DISABLED=1
  node --version >/dev/null 2>&1 || die "The private Node.js won't run on this computer."
}

is_career_ops_dir() {
  [ -f "$1/VERSION" ] && [ -f "$1/update-system.mjs" ] && [ -f "$1/package.json" ] &&
    grep -q '"name": *"career-ops"' "$1/package.json"
}

# Newest release tag. career-ops tags every release career-ops-vX.Y.Z
# (release-please); asking git avoids GitHub's API rate limit.
latest_release_tag() {
  git ls-remote --tags --refs "$CAREER_OPS_GIT" 'career-ops-v*' 2>> "$LOG_FILE" |
    sed -n 's#.*refs/tags/career-ops-v\([0-9]*\.[0-9]*\.[0-9]*\)$#\1#p' |
    sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1
}

clone_career_ops() { git clone --quiet --depth=1 ${2:+--branch "$2"} "$CAREER_OPS_GIT" "$1"; }

ensure_career_ops() {
  local dir="$CAREER_OPS_DIR" parent partial version tag=""
  step "career-ops"
  if [ -d "$dir" ] && is_career_ops_dir "$dir"; then
    [ -d "$dir/.git" ] ||
      die "$dir has career-ops in it but isn't a git checkout, so it can't be updated safely. Install fresh with --dir=$HOME/career-ops-new and move your cv.md, config/, data/ and reports/ into it (see career-ops's DATA_CONTRACT.md)."
    ok "Using your career-ops folder: $dir (version $(core_version_of "$dir"))"
    update_career_ops "$dir"
    return 0
  fi
  if [ -L "$dir" ]; then
    die "$dir is a symbolic link. Pass the real folder with --dir=PATH."
  fi
  if [ -e "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
    die "$dir already exists and isn't a career-ops folder. Move it aside, or choose another folder with --dir=PATH."
  fi
  parent=$(dirname "$dir")
  mkdir -p "$parent" 2>/dev/null
  if [ ! -d "$parent" ] || [ ! -w "$parent" ]; then
    die "Can't create $dir: $parent isn't a folder you can write to."
  fi
  # Download next to the final folder and move it into place only once it's
  # complete, so an interrupted download never looks like an install.
  partial="$parent/.$(basename "$dir").jobdesk-partial"
  rm -rf "$partial"
  # career-ops's documented install: a git clone of the latest release (what
  # its own `npx @santifer/career-ops init` does); dependencies come next.
  version="${JOBDESK_CAREER_OPS_VERSION:-}"
  [ -n "$version" ] || version=$(latest_release_tag)
  if [ -n "$version" ]; then
    tag="career-ops-v$version"
  else
    warn "Couldn't list career-ops releases; downloading its main branch instead."
  fi
  if ! run_step "Downloading career-ops${version:+ $version}" clone_career_ops "$partial" "$tag" ||
     ! is_career_ops_dir "$partial"; then
    rm -rf "$partial"
    die "Couldn't download career-ops from GitHub (see the log). Check your internet connection and try again."
  fi
  if [ -d "$dir" ]; then
    rmdir "$dir" || { rm -rf "$partial"; die "Couldn't replace the empty folder $dir."; }
  fi
  mv "$partial" "$dir" || { rm -rf "$partial"; die "Couldn't move career-ops into $dir."; }
  FRESH_CAREER_OPS=1
  ok "career-ops $(core_version_of "$dir") in $dir"
}

# career-ops's updater records the update as a git commit; give it an
# identity if this Mac has none, without changing anyone's git settings.
updater() {
  cd "$1" || return 1
  if [ -z "$(git config user.email 2>/dev/null)" ] && [ -z "${EMAIL:-}" ]; then
    GIT_AUTHOR_NAME="JobDesk updater" GIT_AUTHOR_EMAIL="jobdesk@localhost" \
      GIT_COMMITTER_NAME="JobDesk updater" GIT_COMMITTER_EMAIL="jobdesk@localhost" \
      node update-system.mjs "$2" "$3"
  else
    node update-system.mjs "$2" "$3"
  fi
}

update_career_ops() {
  local dir="$1" out
  out=$(cd "$dir" && node update-system.mjs check --force 2>>"$LOG_FILE" | tail -n 1)
  log "career-ops update check: $out"
  case "$out" in
    *'"status":"update-available"'*|*'"status":"dismissed"'*)
      if [ "$OPT_UPDATE" = 1 ] || ask_yn "A newer career-ops is out. Update it? (Your CV, tracker and reports are never touched.)" Y; then
        run_step "Updating career-ops (program files only)" updater "$dir" apply --confirm ||
          die "career-ops's updater reported a problem (see the log). Your data was not changed."
        ok "career-ops is now version $(core_version_of "$dir")"
      fi
      ;;
    *'"status":"up-to-date"'*) ok "career-ops is up to date" ;;
    *'"status":"offline"'*) warn "Couldn't check for career-ops updates (offline?). Keeping version $(core_version_of "$dir")." ;;
    *) warn "Skipped the career-ops update check." ;;
  esac
}

npm_in() { cd "$1" && shift && npm "$@"; }
npx_in() { cd "$1" && shift && npx "$@"; }

install_core_deps() {
  run_step "Installing career-ops's dependencies" npm_in "$CAREER_OPS_DIR" install --no-audit --no-fund --ignore-scripts ||
    die "Installing career-ops's dependencies failed."
  if ! run_step "Installing the browser career-ops uses to make PDFs" npx_in "$CAREER_OPS_DIR" --yes playwright install chromium; then
    warn "The PDF browser didn't install. Everything else works; run 'jobdesk update' later to retry."
  fi
}

# JobDesk runs its own copy of career-ops's web/ folder, taken from the same
# release as your career-ops, and points it at your folder (CAREER_OPS_ROOT).
# career-ops's updater doesn't update web/, and this way the web UI is never
# built inside, or mixed into, the folder that holds your data. Your checkout
# is only ever read; a release it doesn't have locally is fetched into a
# throwaway repository instead.
resolve_ui_source() {
  local v="$1" t scratch="$WORK_DIR/career-ops-src.git"
  UI_REPO=""
  UI_TAG=""
  for t in "career-ops-v$v" "v$v"; do
    if git -C "$CAREER_OPS_DIR" rev-parse -q --verify "refs/tags/$t^{commit}" >/dev/null 2>&1; then
      UI_REPO="$CAREER_OPS_DIR"
      UI_TAG="$t"
      return 0
    fi
  done
  git init -q --bare "$scratch" >> "$LOG_FILE" 2>&1 || return 1
  for t in "career-ops-v$v" "v$v"; do
    if git -C "$scratch" fetch -q --depth=1 "$CAREER_OPS_GIT" "refs/tags/$t:refs/tags/$t" >> "$LOG_FILE" 2>&1; then
      UI_REPO="$scratch"
      UI_TAG="$t"
      return 0
    fi
  done
  return 1
}

build_ui() { cd "$1/web" && npm ci --no-audit --no-fund && npm run build; }

ui_ready() {
  [ -f "$1/web/.next/BUILD_ID" ] && [ -f "$1/web/node_modules/next/dist/bin/next" ]
}

ensure_ui() {
  local ui="$JOBDESK_HOME/ui" v stamp dir d
  step "career-ops web UI"
  v=$(core_version_of "$CAREER_OPS_DIR")
  if resolve_ui_source "$v"; then
    stamp="$UI_TAG node=$(node --version)"
  else
    stamp="worktree-$(git -C "$CAREER_OPS_DIR" rev-parse HEAD 2>/dev/null) node=$(node --version)"
  fi
  if [ -L "$ui/current" ] && [ -f "$ui/current/.jobdesk-built" ] &&
     [ "$(cat "$ui/current/.jobdesk-built")" = "$stamp" ] && ui_ready "$ui/current"; then
    ok "The web UI for career-ops $v is ready"
    return 0
  fi

  dir="$ui/build-$(date +%Y%m%d%H%M%S)"
  rm -rf "$dir"
  mkdir -p "$dir"
  if [ -n "$UI_TAG" ]; then
    git -C "$UI_REPO" archive --format=tar "$UI_TAG" web | tar -xf - -C "$dir" ||
      { rm -rf "$dir"; die "Couldn't unpack the web UI from career-ops $UI_TAG."; }
    git -C "$UI_REPO" show "$UI_TAG:VERSION" > "$dir/VERSION" 2>/dev/null ||
      cp "$CAREER_OPS_DIR/VERSION" "$dir/VERSION"
  else
    warn "No release tag found for career-ops $v; using the web UI from your folder as-is."
    ( cd "$CAREER_OPS_DIR" && tar -cf - --exclude='web/node_modules' --exclude='web/.next*' web ) | tar -xf - -C "$dir" ||
      { rm -rf "$dir"; die "Couldn't copy the web UI."; }
    cp "$CAREER_OPS_DIR/VERSION" "$dir/VERSION"
  fi
  [ -f "$dir/web/package.json" ] ||
    { rm -rf "$dir"; die "This career-ops version ($v) has no web UI. Update career-ops and try again."; }

  if ! run_step "Installing and building the web UI" build_ui "$dir"; then
    rm -rf "$dir"
    if [ -L "$ui/current" ] && ui_ready "$ui/current"; then
      die "The new web UI didn't build (see the log). Your previous version is still installed."
    fi
    die "The web UI didn't build (see the log)."
  fi
  printf '%s\n' "$stamp" > "$dir/.jobdesk-built"
  # `current` must be a link; anything else there would swallow the new one.
  if [ -e "$ui/current" ] && [ ! -L "$ui/current" ]; then
    rm -rf "$ui/current"
  fi
  ln -sfn "$(basename "$dir")" "$ui/current"
  if [ ! -L "$ui/current" ] || ! ui_ready "$ui/current"; then
    die "Couldn't switch to the new web UI."
  fi
  for d in "$ui"/build-*; do
    [ "$d" = "$dir" ] || rm -rf "$d"
  done
  ok "Web UI built for career-ops $v"
}

npm_global() { npm install -g --prefix "$JOBDESK_HOME/tools" --no-audit --no-fund "$1"; }

# The AI helper is optional (the web UI works without one), so a problem here
# is a warning; `jobdesk update` tries again.
ensure_ai() {
  local installer="$WORK_DIR/claude-install.sh" pkg label
  AI_BIN=""
  case "$AI" in
    none)
      step "AI helper"
      info "Skipped. JobDesk's Config page detects Claude Code, Codex, Gemini CLI and others once installed."
      return 0
      ;;
    claude)
      step "Claude Code"
      if AI_BIN=$(find_cli claude); then
        ok "Claude Code is installed ($AI_BIN)"
        return 0
      fi
      AI_BIN=""
      if ! curl -fsSL --retry 3 -o "$installer" https://claude.ai/install.sh; then
        warn "Couldn't download Claude Code's installer from claude.ai. JobDesk works without it;"
        info "install it later from https://claude.ai/code, or run: jobdesk update"
        return 0
      fi
      if ! run_step "Installing Claude Code (Anthropic's official installer)" bash "$installer"; then
        warn "Claude Code didn't install (see the log). Install it from https://claude.ai/code, or run: jobdesk update"
        return 0
      fi
      if ! AI_BIN=$(find_cli claude); then
        AI_BIN=""
        warn "Claude Code installed, but the claude command wasn't found. Try: jobdesk update"
        return 0
      fi
      AI_NEW=1
      ok "Claude Code installed ($AI_BIN)"
      ;;
    codex|gemini)
      pkg=@openai/codex
      label="Codex CLI"
      if [ "$AI" = gemini ]; then
        pkg=@google/gemini-cli
        label="Gemini CLI"
      fi
      step "$label"
      if AI_BIN=$(find_cli "$AI") && [ "$AI_BIN" != "$JOBDESK_HOME/tools/bin/$AI" ]; then
        ok "$label is installed ($AI_BIN)"
        return 0
      fi
      AI_BIN=""
      [ -x "$JOBDESK_HOME/tools/bin/$AI" ] || AI_NEW=1
      if ! run_step "Installing $label ($pkg)" npm_global "$pkg@latest"; then
        warn "$label didn't install (see the log). JobDesk works without it; run 'jobdesk update' to retry."
        return 0
      fi
      AI_BIN="$JOBDESK_HOME/tools/bin/$AI"
      ok "$label ($AI_BIN)"
      ;;
  esac
}

claude_works() {
  CLAUDE_CHECK_OUTPUT=$(cd "$JOBDESK_HOME" && run_with_timeout 120 "$AI_BIN" -p "Reply with exactly one word: ready" < /dev/null 2>&1)
  log "claude check: $CLAUDE_CHECK_OUTPUT"
  case "$CLAUDE_CHECK_OUTPUT" in
    *[Rr]eady*) return 0 ;;
  esac
  return 1
}

ai_login() {
  [ -n "$AI_BIN" ] || return 0
  [ "$OPT_UPDATE" = 1 ] && return 0
  [ "$AI_NEW" = 1 ] || [ "$FRESH_CAREER_OPS" = 1 ] || return 0
  if [ "$AI" = claude ] && [ "$AI_NEW" = 0 ]; then
    printf '    Checking whether Claude is already logged in... '
    if claude_works; then
      printf 'yes\n'
      ok "Claude is logged in and working"
      return 0
    fi
    printf 'no\n'
  fi
  if ! can_prompt; then
    info "Next, log in to your AI in the Terminal app: jobdesk login"
    return 0
  fi
  step "Log in to your AI"
  case "$AI" in
    claude)
      info "Claude Code opens right here. Pick a theme, choose your Claude account and"
      info "log in in the browser window. When it says 'Login successful', press Enter,"
      info "then type ${BOLD}/exit${RESET} to come back to this installer."
      ;;
    codex) info "Codex opens a browser window: sign in with your ChatGPT account." ;;
    gemini)
      info "Gemini CLI opens right here. Choose 'Login with Google', finish in the"
      info "browser, then type ${BOLD}/quit${RESET} to come back to this installer."
      ;;
  esac
  if ! ask_yn "Log in now?" Y; then
    info "No problem: run 'jobdesk login' in Terminal whenever you're ready."
    return 0
  fi
  case "$AI" in
    claude|gemini) ( cd "$JOBDESK_HOME" && "$AI_BIN" ) < /dev/tty > /dev/tty 2>&1 || true ;;
    codex) "$AI_BIN" login < /dev/tty > /dev/tty 2>&1 || true ;;
  esac
  if [ "$AI" = claude ]; then
    printf '    Checking that Claude answers... '
    if claude_works; then
      printf 'yes\n'
      ok "Claude is logged in and working"
    else
      printf 'not yet\n'
      warn "Claude didn't answer: $(printf '%s' "$CLAUDE_CHECK_OUTPUT" | head -n 1)"
      info "Finish logging in any time with: jobdesk login"
    fi
  fi
}

install_jobdesk_files() {
  local link="$HOME/.local/bin/jobdesk"
  step "JobDesk $JOBDESK_VERSION"
  mkdir -p "$JOBDESK_HOME/bin"
  # Replace via rename: a running `jobdesk update` keeps reading the old file.
  if ! { cp "$SRC_DIR/bin/jobdesk" "$JOBDESK_HOME/bin/.jobdesk.new" &&
         chmod 755 "$JOBDESK_HOME/bin/.jobdesk.new" &&
         mv -f "$JOBDESK_HOME/bin/.jobdesk.new" "$JOBDESK_HOME/bin/jobdesk"; }; then
    die "Couldn't install the jobdesk command."
  fi
  printf '%s\n' "$JOBDESK_VERSION" > "$JOBDESK_HOME/VERSION"
  mkdir -p "$HOME/.local/bin"
  if [ -L "$link" ] || [ ! -e "$link" ]; then
    ln -sfn "$JOBDESK_HOME/bin/jobdesk" "$link"
  fi
  ok "The jobdesk command is at $JOBDESK_HOME/bin/jobdesk"
}

# Close a running JobDesk.app before replacing it. The server is already
# stopped by then, so a plain signal is enough, and unlike an AppleScript
# `quit` it never triggers macOS's "Terminal wants to control JobDesk" prompt.
quit_app() {
  local pid
  for pid in $(pgrep -f '/JobDesk\.app/Contents/MacOS/' 2>/dev/null); do
    kill -TERM "$pid" 2>/dev/null
  done
}

# place_app BUNDLE DIR: replace DIR/JobDesk.app with BUNDLE. Fails, leaving
# BUNDLE where it is, when the old app can't be removed.
place_app() {
  local app="$2/JobDesk.app"
  mkdir -p "$2" 2>/dev/null
  [ -w "$2" ] || return 1
  rm -rf "$app" 2>/dev/null
  [ ! -e "$app" ] || return 1
  mv "$1" "$app"
}

build_app() {
  local apps app tmp_app script bin="$JOBDESK_HOME/bin/jobdesk" plist old_dir=""
  [ "$PLATFORM" = darwin ] || return 0
  step "The JobDesk app"
  if ! command -v osacompile >/dev/null 2>&1; then
    warn "osacompile is missing, so there's no JobDesk app. Use 'jobdesk open' in Terminal instead."
    return 0
  fi
  # shellcheck disable=SC1003  # '\' is a literal backslash pattern
  case "$bin" in
    *'"'*|*'\'*|*'#'*|*'&'*) die "Your home folder's path has characters JobDesk.app can't handle: $bin" ;;
  esac
  [ -n "$EXISTING_APP" ] && old_dir=$(dirname "$EXISTING_APP")
  if [ -n "$old_dir" ] && [ -d "$old_dir" ] && [ -w "$old_dir" ]; then
    apps="$old_dir"
  elif [ -w /Applications ]; then
    apps=/Applications
  else
    apps="$HOME/Applications"
  fi
  script="$WORK_DIR/JobDesk.applescript"
  tmp_app="$WORK_DIR/JobDesk.app"
  sed "s#__JOBDESK_BIN__#$bin#" "$SRC_DIR/macos/JobDesk.applescript" > "$script"
  osacompile -s -o "$tmp_app" "$script" >> "$LOG_FILE" 2>&1 || die "Couldn't build JobDesk.app (see the log)."

  plist="$tmp_app/Contents/Info.plist"
  cp "$SRC_DIR/assets/JobDesk.icns" "$tmp_app/Contents/Resources/applet.icns"
  # Newer osacompile adds an asset-catalog icon that would win over ours.
  rm -f "$tmp_app/Contents/Resources/Assets.car"
  plutil -remove CFBundleIconName "$plist" >/dev/null 2>&1 || true
  plutil -replace CFBundleIconFile -string applet "$plist"
  plutil -replace CFBundleIdentifier -string "$APP_BUNDLE_ID" "$plist"
  plutil -replace CFBundleName -string JobDesk "$plist"
  plutil -replace CFBundleShortVersionString -string "$JOBDESK_VERSION" "$plist"
  plutil -replace NSHumanReadableCopyright -string "Opens the career-ops web UI. Not affiliated with career-ops." "$plist"
  # Built on this Mac, so Gatekeeper never quarantines it; an ad-hoc signature
  # keeps the bundle's seal valid after the edits above.
  codesign --force --deep --sign - "$tmp_app" >> "$LOG_FILE" 2>&1 ||
    warn "Couldn't sign JobDesk.app; it should still open."

  quit_app
  if ! place_app "$tmp_app" "$apps"; then
    [ "$apps" = "$HOME/Applications" ] && die "Couldn't put JobDesk.app in $apps."
    warn "Couldn't replace JobDesk.app in $apps; putting it in $HOME/Applications instead."
    apps="$HOME/Applications"
    place_app "$tmp_app" "$apps" || die "Couldn't put JobDesk.app in $apps."
  fi
  app="$apps/JobDesk.app"
  # An older copy somewhere else would be a second, stale JobDesk.
  if [ -n "$EXISTING_APP" ] && [ "$EXISTING_APP" != "$app" ] &&
     [ "$(basename "$EXISTING_APP")" = JobDesk.app ] && [ -d "$EXISTING_APP" ]; then
    rm -rf "$EXISTING_APP" 2>/dev/null || true
  fi
  touch "$app"
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app" >/dev/null 2>&1 || true
  APP_PATH="$app"
  ok "JobDesk.app is in $apps"
}

write_config() {
  local tmp="$JOBDESK_HOME/.config.env.new"
  if ! {
    printf '# JobDesk settings, written by the installer. Run "jobdesk update" after editing.\n'
    printf 'JOBDESK_CAREER_OPS_DIR=%q\n' "$CAREER_OPS_DIR"
    printf 'JOBDESK_PORT=%q\n' "$PORT"
    printf 'JOBDESK_AI=%q\n' "$AI"
    printf 'JOBDESK_APP=%q\n' "$APP_PATH"
  } > "$tmp" || ! mv -f "$tmp" "$JOBDESK_HOME/config.env"; then
    die "Couldn't save JobDesk's settings."
  fi
}

check_chrome() {
  [ "$PLATFORM" = darwin ] || return 0
  if [ ! -d "/Applications/Google Chrome.app" ] && [ ! -d "$HOME/Applications/Google Chrome.app" ]; then
    warn "Google Chrome isn't installed. JobDesk's Apply feature fills application forms in"
    info "Chrome, so install it from https://www.google.com/chrome/ to use that part."
  fi
}

finish() {
  local jobdesk_cmd="jobdesk"
  FINISHED=1
  case ":$ORIG_PATH:" in
    *":$HOME/.local/bin:"*) ;;
    *) jobdesk_cmd="$JOBDESK_HOME/bin/jobdesk" ;;
  esac
  # Let the app start the server: it refuses while an install holds the lock.
  release_lock
  if [ "$OPT_LAUNCH" = 1 ]; then
    step "Opening JobDesk"
    if [ -n "$APP_PATH" ]; then
      open "$APP_PATH" || warn "Couldn't open the app. Try: $jobdesk_cmd open"
    else
      "$JOBDESK_HOME/bin/jobdesk" open || warn "JobDesk didn't start. Try: $jobdesk_cmd doctor"
    fi
  elif [ "$WAS_RUNNING" = 1 ]; then
    "$JOBDESK_HOME/bin/jobdesk" start >/dev/null 2>&1 || warn "JobDesk didn't restart. Try: $jobdesk_cmd doctor"
  fi

  printf '\n%s✓ JobDesk is ready.%s\n\n' "$GREEN$BOLD" "$RESET"
  if [ -n "$APP_PATH" ]; then
    printf '  Open it any time: %sJobDesk%s in %s (or ⌘-Space, type JobDesk).\n' "$BOLD" "$RESET" "$(dirname "$APP_PATH")"
    printf '  Quit JobDesk in the Dock to stop it.\n'
  else
    printf '  Open it any time with: %s open\n' "$jobdesk_cmd"
  fi
  if [ "$FIRST_INSTALL" = 1 ]; then
    printf '\n  First steps in JobDesk:\n'
    printf '    1. Config page: pick your AI helper.\n'
    printf '    2. Home page: "Set me up with the assistant" (add your CV and target roles).\n'
    printf '    3. Paste job links in Pipeline, evaluate them, and generate CVs and cover letters.\n'
  fi
  printf '\n  Update: %s update   ·   Check setup: %s doctor   ·   Remove: %s uninstall\n' "$jobdesk_cmd" "$jobdesk_cmd" "$jobdesk_cmd"
  printf '  Your data lives in %s\n\n' "$CAREER_OPS_DIR"
}

main() {
  parse_args "$@"
  setup_colors
  if [ "$OPT_UPDATE" = 1 ]; then
    printf '\n%sUpdating JobDesk%s\n' "$BOLD" "$RESET"
  else
    printf '\n%sJobDesk installer%s: career-ops, with a web UI, on your Mac\n' "$BOLD" "$RESET"
  fi

  detect_platform
  prepare_home
  LOG_FILE="$JOBDESK_HOME/logs/install.log"
  if [ -f "$LOG_FILE" ] && [ "$(wc -c < "$LOG_FILE" | tr -d ' ')" -gt 5242880 ]; then
    mv -f "$LOG_FILE" "$LOG_FILE.1"
  fi
  log "==== JobDesk installer ($*) on $PLATFORM-$ARCH"
  WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/jobdesk.XXXXXX") || die "Couldn't create a temp folder."
  trap cleanup EXIT
  acquire_lock

  check_requirements
  load_existing_config
  resolve_settings
  fetch_source
  choose_ai
  confirm_plan
  stop_running

  ensure_git
  ensure_node
  ensure_career_ops
  install_core_deps
  ensure_ui
  ensure_ai
  install_jobdesk_files
  build_app
  write_config
  ai_login
  check_chrome
  finish
}

if [ "${JOBDESK_SOURCE_ONLY:-0}" != 1 ]; then
  main "$@"
fi
# __JOBDESK_INSTALLER_END__ (jobdesk update refuses a download without this line)
