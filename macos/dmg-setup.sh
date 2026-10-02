#!/bin/bash
# dmg-setup.sh PAYLOAD APP STATUS_FILE: JobDesk.app's first-run setup (the DMG
# edition). It lays out the same ~/.jobdesk and ~/career-ops as install.sh,
# from files that came inside the app, so nothing is downloaded or built and
# nobody logs in. It reuses install.sh's helpers (locks, paths, config) and
# reports progress to STATUS_FILE as "PERCENT|what" for the app's progress
# window, then "done|" or "failed|message".
#
#   PAYLOAD/build-id            identifies this DMG build
#   PAYLOAD/jobdesk/            install.sh, bin/jobdesk, VERSION, this script, shims/
#   PAYLOAD/common.tar.gz       career-ops/ (a release checkout with node_modules), ui/
#   PAYLOAD/<arm64|x64>.tar.gz  runtime/node-*, tools/bin/claude, browsers/
#   PAYLOAD/secrets.env         ANTHROPIC_API_KEY=..., optional (an in-app update has none:
#                               the installed one is kept)
#   PAYLOAD/<arch>.fingerprint  what's in <arch>.tar.gz, by version
#   PAYLOAD/update.env          where in-app updates come from, optional
# An in-app update (macos/updater.mjs) leaves out <arch>.tar.gz when Node,
# Claude Code and the PDF browser didn't change: the installed ones stay.
#
# bash 3.2 and BSD tools only, like the rest of JobDesk.

set -u
set -o pipefail

PAYLOAD="$1"
APP="$2"
STATUS_FILE="$3"

# shellcheck source=install.sh
JOBDESK_SOURCE_ONLY=1 . "$PAYLOAD/jobdesk/install.sh"

status() {
  printf '%s|%s\n' "$1" "$2" > "$STATUS_FILE.new" && mv -f "$STATUS_FILE.new" "$STATUS_FILE"
  log "status: $1 $2"
}

# install.sh's die, plus the message for the app to show.
die() {
  log "FATAL: $*"
  printf 'failed|%s\n' "$*" > "$STATUS_FILE.new" && mv -f "$STATUS_FILE.new" "$STATUS_FILE"
  printf 'jobdesk setup: %s\n' "$*" >&2
  exit 1
}

# replace_dir NEW DEST: put NEW at DEST, dropping whatever DEST was.
replace_dir() {
  rm -rf "$2.old"
  if [ -e "$2" ] || [ -L "$2" ]; then
    mv "$2" "$2.old" || return 1
  fi
  mv "$1" "$2" || return 1
  rm -rf "$2.old"
}

setup_node() {
  local staged="" name runtime="$JOBDESK_HOME/runtime" d
  for d in "$WORK_DIR/arch/runtime"/node-*; do
    [ -x "$d/bin/node" ] && staged="$d"
  done
  [ -n "$staged" ] || die "This JobDesk.dmg is missing Node.js for this Mac."
  name=$(basename "$staged")
  mkdir -p "$runtime"
  replace_dir "$staged" "$runtime/$name" || die "Couldn't set up Node.js."
  if [ -e "$JOBDESK_HOME/node" ] && [ ! -L "$JOBDESK_HOME/node" ]; then
    rm -rf "$JOBDESK_HOME/node"
  fi
  ln -sfn "runtime/$name" "$JOBDESK_HOME/node"
  for d in "$runtime"/node-*; do
    [ "$d" = "$runtime/$name" ] || rm -rf "$d"
  done
  "$JOBDESK_HOME/node/bin/node" --version >/dev/null 2>&1 || die "Node.js won't run on this Mac."
}

setup_claude() {
  [ -x "$WORK_DIR/arch/tools/bin/claude" ] || die "This JobDesk.dmg is missing Claude Code for this Mac."
  mkdir -p "$JOBDESK_HOME/tools/bin"
  mv -f "$WORK_DIR/arch/tools/bin/claude" "$JOBDESK_HOME/tools/bin/claude" || die "Couldn't set up Claude Code."
}

setup_browsers() {
  [ -d "$WORK_DIR/arch/browsers" ] || die "This JobDesk.dmg is missing the PDF browser for this Mac."
  replace_dir "$WORK_DIR/arch/browsers" "$JOBDESK_HOME/browsers" || die "Couldn't set up the PDF browser."
}

setup_ui() {
  local ui="$JOBDESK_HOME/ui" stamp dir d
  stamp="dmg $BUILD_ID"
  if [ -L "$ui/current" ] && [ -f "$ui/current/.jobdesk-built" ] &&
     [ "$(cat "$ui/current/.jobdesk-built")" = "$stamp" ] && ui_ready "$ui/current"; then
    return 0
  fi
  [ -f "$WORK_DIR/common/ui/web/package.json" ] || die "This JobDesk.dmg is missing the web UI."
  dir="$ui/build-$(date +%Y%m%d%H%M%S)"
  mkdir -p "$ui"
  rm -rf "$dir"
  mv "$WORK_DIR/common/ui" "$dir" || die "Couldn't set up the web UI."
  printf '%s\n' "$stamp" > "$dir/.jobdesk-built"
  if [ -e "$ui/current" ] && [ ! -L "$ui/current" ]; then
    rm -rf "$ui/current"
  fi
  ln -sfn "$(basename "$dir")" "$ui/current"
  ui_ready "$ui/current" || die "The web UI that came with JobDesk is incomplete."
  for d in "$ui"/build-*; do
    [ "$d" = "$dir" ] || rm -rf "$d"
  done
}

# Your career-ops folder is only ever created, never replaced: an existing one
# keeps its CV, tracker and reports (and its version; see CLAUDE.md).
setup_career_ops() {
  local dir="$CAREER_OPS_DIR" parent partial template="$WORK_DIR/common/career-ops"
  is_career_ops_dir "$template" || die "This JobDesk.dmg is missing career-ops."
  if [ -d "$dir" ] && is_career_ops_dir "$dir"; then
    log "keeping the existing career-ops $(core_version_of "$dir") in $dir (bundled: $(core_version_of "$template"))"
    if [ ! -d "$dir/node_modules" ]; then
      cp -R "$template/node_modules" "$dir/node_modules" || die "Couldn't set up career-ops's files."
    fi
    return 0
  fi
  [ -L "$dir" ] && die "$dir is a symbolic link; JobDesk won't put your files through it."
  if [ -e "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
    die "There's already a folder called $(basename "$dir") in your home folder that isn't career-ops. Rename it, then open JobDesk again."
  fi
  parent=$(dirname "$dir")
  rm -rf "$parent/.$(basename "$dir").jobdesk-partial".*
  partial="$parent/.$(basename "$dir").jobdesk-partial.$$"
  mv "$template" "$partial" || die "Couldn't create $dir."
  if [ -d "$dir" ]; then
    rmdir "$dir" || { rm -rf "$partial"; die "Couldn't replace the empty folder $dir."; }
  fi
  mv "$partial" "$dir" || { rm -rf "$partial"; die "Couldn't create $dir."; }
  FRESH_CAREER_OPS=1
}

# career-ops (1.35+) won't evaluate a job until its setup files exist. Two of
# them are its own templates, so start them here; only ever created, never
# replaced (they're the user's to edit). The profile itself starts from the CV.
setup_starter_files() {
  local dir="$CAREER_OPS_DIR" pair from to
  for pair in "modes/_profile.template.md:modes/_profile.md" "templates/portals.example.yml:portals.yml"; do
    from="$dir/${pair%%:*}"
    to="$dir/${pair#*:}"
    if [ -f "$from" ] && [ ! -e "$to" ]; then
      cp "$from" "$to" || die "Couldn't set up $(basename "$to")."
      log "started $to from ${pair%%:*}"
    fi
  done
}

setup_shims() {
  mkdir -p "$JOBDESK_HOME/shims"
  if ! { cp "$SRC_DIR/shims/git" "$JOBDESK_HOME/shims/.git.new" &&
         chmod 755 "$JOBDESK_HOME/shims/.git.new" &&
         mv -f "$JOBDESK_HOME/shims/.git.new" "$JOBDESK_HOME/shims/git"; }; then
    die "Couldn't set up JobDesk's git helper."
  fi
}

# In-app updates: the updater, and where updates come from.
setup_updates() {
  if [ -f "$SRC_DIR/macos/updater.mjs" ]; then
    if ! { cp "$SRC_DIR/macos/updater.mjs" "$JOBDESK_HOME/bin/.jobdesk-update.mjs.new" &&
           mv -f "$JOBDESK_HOME/bin/.jobdesk-update.mjs.new" "$JOBDESK_HOME/bin/jobdesk-update.mjs"; }; then
      die "Couldn't set up updates."
    fi
  fi
  if [ -f "$PAYLOAD/update.env" ]; then
    cp "$PAYLOAD/update.env" "$JOBDESK_HOME/update.env" || die "Couldn't set up updates."
  fi
}

setup_secrets() {
  local tmp="$JOBDESK_HOME/.secrets.env.new"
  if [ ! -s "$PAYLOAD/secrets.env" ]; then
    log "this build carries no Claude key"
    return 0
  fi
  if ! { ( umask 077 && cp "$PAYLOAD/secrets.env" "$tmp" ) && chmod 600 "$tmp" &&
         mv -f "$tmp" "$JOBDESK_HOME/secrets.env"; }; then
    die "Couldn't save JobDesk's Claude key."
  fi
}

main_dmg() {
  local tmp_root avail
  OPT_YES=1
  OPT_LAUNCH=0
  AI=claude
  EDITION=dmg
  SRC_DIR="$PAYLOAD/jobdesk"
  JOBDESK_VERSION=$(tr -d ' \n' < "$SRC_DIR/VERSION" 2>/dev/null)
  BUILD_ID=$(tr -d '\n' < "$PAYLOAD/build-id" 2>/dev/null)
  [ -n "$BUILD_ID" ] || die "This JobDesk.dmg is incomplete (no build id)."
  setup_colors

  status 2 "Getting ready"
  detect_platform
  # Tests only: set up the Intel parts on an Apple Silicon Mac (via Rosetta).
  case "${JOBDESK_DMG_ARCH:-}" in arm64|x64) ARCH="$JOBDESK_DMG_ARCH" ;; esac
  check_home_location
  load_existing_config
  # A branded build names their folder; an existing install keeps its folder.
  if [ -z "$EXISTING_DIR" ] && [ -f "$PAYLOAD/brand.env" ]; then
    # shellcheck source=/dev/null
    BRAND_DATA_DIR=$( . "$PAYLOAD/brand.env" && printf '%s' "${BRAND_DATA_DIR:-}")
    case "$BRAND_DATA_DIR" in
      ''|*/*|.|..) ;;
      *) OPT_DIR="$HOME/$BRAND_DATA_DIR" ;;
    esac
  fi
  resolve_settings
  prepare_home
  LOG_FILE="$JOBDESK_HOME/logs/install.log"
  log "==== JobDesk.app setup ($BUILD_ID) on $PLATFORM-$ARCH, app at $APP"
  tmp_root=${TMPDIR:-/tmp}
  WORK_DIR=$(mktemp -d "${tmp_root%/}/jobdesk-setup.XXXXXX") || die "Couldn't create a temp folder."
  trap cleanup EXIT
  acquire_lock
  stop_running

  avail=$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')
  if [ -n "$avail" ] && [ "$avail" -lt $(( 2 * 1024 * 1024 )) ]; then
    die "JobDesk needs about 2 GB of free disk space. Free some up, then open JobDesk again."
  fi

  status 10 "Unpacking JobDesk"
  mkdir -p "$WORK_DIR/common" "$WORK_DIR/arch"
  tar -xzf "$PAYLOAD/common.tar.gz" -C "$WORK_DIR/common" >> "$LOG_FILE" 2>&1 ||
    die "Couldn't unpack JobDesk. Drag it into Applications again from JobDesk.dmg."
  # An update without new parts for this Mac keeps the installed ones.
  if [ -f "$PAYLOAD/$ARCH.tar.gz" ] || [ ! -x "$JOBDESK_HOME/node/bin/node" ]; then
    status 35 "Unpacking the parts for this Mac"
    tar -xzf "$PAYLOAD/$ARCH.tar.gz" -C "$WORK_DIR/arch" >> "$LOG_FILE" 2>&1 ||
      die "Couldn't unpack JobDesk for this Mac ($ARCH)."
    status 55 "Setting up Node.js"
    setup_node
    status 62 "Setting up Claude"
    setup_claude
    status 68 "Setting up the PDF maker"
    setup_browsers
    if [ -f "$PAYLOAD/$ARCH.fingerprint" ]; then
      cp "$PAYLOAD/$ARCH.fingerprint" "$JOBDESK_HOME/.dmg-arch"
    else
      rm -f "$JOBDESK_HOME/.dmg-arch"
    fi
  else
    log "keeping the installed Node.js, Claude Code and PDF browser"
  fi
  status 75 "Setting up the web app"
  setup_ui
  status 85 "Setting up your job search folder"
  setup_career_ops
  setup_starter_files
  status 92 "Finishing"
  setup_shims
  install_jobdesk_files > /dev/null
  setup_updates
  setup_secrets
  APP_PATH="$APP"
  write_config
  # Nothing here needs Gatekeeper's download check: the app it came in was
  # already approved when it was opened.
  xattr -dr com.apple.quarantine "$JOBDESK_HOME" "$CAREER_OPS_DIR" >/dev/null 2>&1 || true
  printf '%s\n' "$BUILD_ID" > "$JOBDESK_HOME/.dmg-build"
  FINISHED=1
  log "setup finished"
  release_lock
  status "done" ""
}

main_dmg
