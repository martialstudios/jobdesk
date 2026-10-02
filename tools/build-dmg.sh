#!/bin/bash
# tools/build-dmg.sh: build JobDesk.dmg, the no-Terminal edition of JobDesk.
#
# Everything a Mac needs goes inside JobDesk.app: Node.js, career-ops (a
# release checkout with its dependencies), its web UI (already built), Claude
# Code, and the headless Chromium career-ops makes PDFs with, for both Apple
# Silicon and Intel. The first time the app opens it copies them into
# ~/.jobdesk and ~/career-ops (macos/dmg-setup.sh). Nothing is downloaded,
# built or logged into on the Mac it's opened on.
#
# The Claude key comes from the macOS Keychain of the Mac this runs on and is
# never printed. Store it once (the Terminal asks for it; nothing is echoed):
#
#   security add-generic-password -a "$USER" -s jobdesk-anthropic-api-key -w
#
# Anyone who has the DMG can dig the key out of it: use a key made just for
# JobDesk, with a monthly spend limit, and don't post the DMG publicly.
#
# Usage: tools/build-dmg.sh [--career-ops=X.Y.Z] [--out=DIR] [--key-service=NAME]
#                           [--key-file=PATH] [--no-key] [--test-home=DIR]
#   --key-file=PATH  read the key from a file instead (tests use a fake one)
#   --workspace-id=wrkspc_…  for a key that isn't scoped to a workspace: every
#                    request then has to name one (Console → Settings → Workspaces)
#   --no-key         build without a Claude key (testing)
#   --test-home=DIR  the app sets up in DIR instead of the real home (testing)
#   --model=ID       the Claude model every AI step uses (e.g. claude-sonnet-5-5,
#                    about half the cost of Claude Code's default); a brand file's
#                    BRAND_MODEL sets it too
#   --brand=FILE     a personalized build for one person: its name, the words in
#                    it, their folder's name (see brands/example.env; needs python3
#                    with Pillow for the picture guide)
#
# Runs on macOS (it needs osacompile, codesign and hdiutil) with network access.

set -u
set -o pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/dist"
KEY_SERVICE=jobdesk-anthropic-api-key
# In-app updates (BRAND_UPDATE_REPO / BRAND_UPDATE_CHANNEL in the brand file):
# a read-only GitHub token for that private repository, from the Keychain.
UPDATE_TOKEN_SERVICE=jobdesk-update-token
UPDATE_TOKEN_FILE=""
KEY_FILE=""
WORKSPACE_ID=""
NO_KEY=0
TEST_HOME=""
BRAND_FILE=""
MODEL=""
CO_VERSION=""
NODE_MAJOR=24
CLAUDE_BASE=https://downloads.claude.ai/claude-code-releases
CAREER_OPS_GIT=https://github.com/career-ops-hq/career-ops.git
ARCHES="arm64 x64"

for arg in "$@"; do
  case "$arg" in
    --career-ops=*) CO_VERSION="${arg#--career-ops=}" ;;
    --out=*) OUT="${arg#--out=}" ;;
    --key-service=*) KEY_SERVICE="${arg#--key-service=}" ;;
    --key-file=*) KEY_FILE="${arg#--key-file=}" ;;
    --workspace-id=*) WORKSPACE_ID="${arg#--workspace-id=}" ;;
    --no-key) NO_KEY=1 ;;
    --test-home=*) TEST_HOME="${arg#--test-home=}" ;;
    --brand=*) BRAND_FILE="${arg#--brand=}" ;;
    --model=*) MODEL="${arg#--model=}" ;;
    --update-token-service=*) UPDATE_TOKEN_SERVICE="${arg#--update-token-service=}" ;;
    --update-token-file=*) UPDATE_TOKEN_FILE="${arg#--update-token-file=}" ;;
    -h|--help) sed -n '2,36p' "$0"; exit 0 ;;
    *) printf 'Unknown option: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

say() { printf '==> %s\n' "$*"; }
die() { printf 'build-dmg: %s\n' "$*" >&2; exit 1; }
sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }

[ "$(uname -s)" = Darwin ] || die "Build JobDesk.dmg on a Mac."
for tool in curl git tar hdiutil osacompile codesign plutil security shasum; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is missing."
done
if [ "$(sysctl -in hw.optional.arm64 2>/dev/null)" = 1 ]; then HOST=arm64; else HOST=x64; fi

tmp_root=${TMPDIR:-/tmp}
WORK=$(mktemp -d "${tmp_root%/}/jobdesk-dmg.XXXXXX") || die "Couldn't create a temp folder."
trap 'rm -rf "$WORK"' EXIT
LOG="$WORK/build.log"
run() { "$@" >> "$LOG" 2>&1 || { tail -n 40 "$LOG" >&2; die "failed: $*"; }; }

APP_NAME=JobDesk
VOLUME_NAME=JobDesk
if [ -n "$BRAND_FILE" ]; then
  [ -f "$BRAND_FILE" ] || die "No brand file at $BRAND_FILE."
  command -v python3 >/dev/null 2>&1 || die "--brand needs python3."
  set -a
  # shellcheck source=/dev/null
  . "$BRAND_FILE"
  set +a
  [ -n "${BRAND_NAME:-}" ] || die "$BRAND_FILE has no BRAND_NAME."
  case "$BRAND_NAME${BRAND_VOLUME:-}" in
    *[\"\'\`\\\$\<\>\{\}/:]*) die "BRAND_NAME and BRAND_VOLUME can't contain \" ' \` \\ \$ < > { } / : (use a curly ’)." ;;
  esac
  [ -n "$MODEL" ] || MODEL="${BRAND_MODEL:-}"
  APP_NAME="$BRAND_NAME"
  VOLUME_NAME="${BRAND_VOLUME:-$BRAND_NAME}"
  python3 -c 'import PIL' 2>/dev/null || die "--brand needs Pillow for the picture guide: python3 -m pip install pillow"
fi

case "$MODEL" in
  ''|claude-[a-z0-9.-]*) ;;
  *) die "--model should be a Claude model ID like claude-sonnet-5-5." ;;
esac

# The key first: a build that can't have one should stop before the downloads.
KEY=""
if [ "$NO_KEY" = 0 ] && [ -n "$KEY_FILE" ]; then
  KEY=$(head -n 1 "$KEY_FILE" 2>/dev/null | tr -d ' \r\n') || KEY=""
  [ -n "$KEY" ] || die "No key in $KEY_FILE."
elif [ "$NO_KEY" = 0 ]; then
  KEY=$(security find-generic-password -s "$KEY_SERVICE" -w 2>/dev/null) ||
    die "No Claude key in the Keychain under '$KEY_SERVICE'. Add one (see the top of this script), or pass --no-key."
  case "$WORKSPACE_ID" in
    ''|wrkspc_*) ;;
    *) die "--workspace-id should look like wrkspc_… (Console → Settings → Workspaces)." ;;
  esac
  case "$KEY" in
    sk-ant-*) ;;
    *) die "The Keychain item '$KEY_SERVICE' doesn't look like an Anthropic API key (sk-ant-...)." ;;
  esac
fi

# In-app updates: the channel from the brand file, the token from the Keychain.
UPDATE_REPO="${BRAND_UPDATE_REPO:-}"
UPDATE_CHANNEL="${BRAND_UPDATE_CHANNEL:-}"
UPDATE_TOKEN=""
if [ -n "$UPDATE_REPO$UPDATE_CHANNEL" ]; then
  case "$UPDATE_REPO" in */*) ;; *) die "BRAND_UPDATE_REPO should look like owner/repo." ;; esac
  case "$UPDATE_CHANNEL" in ''|*[!a-z0-9-]*) die "BRAND_UPDATE_CHANNEL should be lowercase letters, digits and dashes." ;; esac
  if [ -n "$UPDATE_TOKEN_FILE" ]; then
    UPDATE_TOKEN=$(head -n 1 "$UPDATE_TOKEN_FILE" 2>/dev/null | tr -d ' \r\n') || UPDATE_TOKEN=""
  else
    UPDATE_TOKEN=$(security find-generic-password -s "$UPDATE_TOKEN_SERVICE" -w 2>/dev/null) || UPDATE_TOKEN=""
  fi
  [ -n "$UPDATE_TOKEN" ] || die "Updates are on for this brand but there's no token in the Keychain under '$UPDATE_TOKEN_SERVICE' (a GitHub token that can only read $UPDATE_REPO)."
fi

VERSION=$(tr -d ' \n' < "$ROOT/VERSION")
PAY="$WORK/payload"
mkdir -p "$PAY/jobdesk" "$WORK/common/ui" "$WORK/dmg"
for a in $ARCHES; do mkdir -p "$WORK/arch-$a/runtime" "$WORK/arch-$a/tools/bin"; done

# ── Node.js, both architectures, checked against nodejs.org's SHA-256 ──────
say "Node.js $NODE_MAJOR"
run curl -fsSL --retry 3 -o "$WORK/node-index.json" https://nodejs.org/dist/index.json
NODE_VERSION=$(grep -o "\"version\":\"v${NODE_MAJOR}\.[0-9]*\.[0-9]*\"" "$WORK/node-index.json" | head -n 1 | cut -d'"' -f4)
[ -n "$NODE_VERSION" ] || die "Couldn't find a Node.js $NODE_MAJOR release."
run curl -fsSL --retry 3 -o "$WORK/SHASUMS256.txt" "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"
for a in $ARCHES; do
  name="node-$NODE_VERSION-darwin-$a"
  run curl -fsSL --retry 3 -o "$WORK/$name.tar.gz" "https://nodejs.org/dist/$NODE_VERSION/$name.tar.gz"
  [ "$(awk -v f="$name.tar.gz" '$2 == f {print $1}' "$WORK/SHASUMS256.txt")" = "$(sha256_of "$WORK/$name.tar.gz")" ] ||
    die "$name.tar.gz doesn't match its published checksum."
  mkdir -p "$WORK/arch-$a/runtime/$name"
  run tar -xzf "$WORK/$name.tar.gz" -C "$WORK/arch-$a/runtime/$name" --strip-components=1
  rm -f "$WORK/$name.tar.gz"
done
export PATH="$WORK/arch-$HOST/runtime/node-$NODE_VERSION-darwin-$HOST/bin:$PATH"
export npm_config_update_notifier=false npm_config_fund=false npm_config_audit=false NEXT_TELEMETRY_DISABLED=1

# ── career-ops at a release tag, with its dependencies ─────────────────────
if [ -z "$CO_VERSION" ]; then
  CO_VERSION=$(git ls-remote --tags --refs "$CAREER_OPS_GIT" 'career-ops-v*' |
    sed -n 's#.*refs/tags/career-ops-v\([0-9]*\.[0-9]*\.[0-9]*\)$#\1#p' |
    sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)
  [ -n "$CO_VERSION" ] || die "Couldn't list career-ops releases."
fi
say "career-ops $CO_VERSION"
CO="$WORK/common/career-ops"
run git clone --quiet --depth=1 --branch "career-ops-v$CO_VERSION" "$CAREER_OPS_GIT" "$CO"
( cd "$CO" && npm install --no-audit --no-fund --ignore-scripts ) >> "$LOG" 2>&1 || die "npm install failed in career-ops."

# ── its web UI, built once here and pruned to what `next start` needs ──────
say "Building the web UI"
UI="$WORK/common/ui"
git -C "$CO" archive --format=tar "career-ops-v$CO_VERSION" web | tar -xf - -C "$UI" || die "Couldn't unpack web/."
cp "$CO/VERSION" "$UI/VERSION"
(
  # shellcheck source=install.sh
  JOBDESK_SOURCE_ONLY=1 . "$ROOT/install.sh"
  patch_web_ui "$UI/web"
) || die "career-ops $CO_VERSION changed the line JobDesk patches (patch_web_ui in install.sh). Update the patch."
cp "$ROOT/ui/jobdesk-start.html" "$UI/web/public/jobdesk-start.html"
if [ -n "$BRAND_FILE" ]; then
  say "Branding it: $APP_NAME"
  python3 "$ROOT/tools/brand_web.py" "$UI/web" "$ROOT/assets/JobDesk.png" || die "Couldn't brand the web UI (see above)."
fi
if ! ( cd "$UI/web" && npm ci --no-audit --no-fund && npm run build && npm prune --omit=dev --no-audit --no-fund ) >> "$LOG" 2>&1; then
  tail -n 60 "$LOG" >&2
  die "The web UI didn't build (the end of its log is above)."
fi
# Build-only: the compiler and the build cache.
rm -rf "$UI/web/.next/cache" "$UI/web/node_modules/@next"/swc-*
# sharp (Next's image library) only installed its own architecture: add the other.
SHARP_VERSION=$(node -p "require('$UI/web/node_modules/sharp/package.json').version" 2>/dev/null) || SHARP_VERSION=""
if [ -n "$SHARP_VERSION" ]; then
  for a in $ARCHES; do
    for pkg in "sharp-darwin-$a" "sharp-libvips-darwin-$a"; do
      [ -d "$UI/web/node_modules/@img/$pkg" ] && continue
      ver=$(node -p "require('$UI/web/node_modules/sharp/package.json').optionalDependencies['@img/$pkg'] || ''")
      [ -n "$ver" ] || die "sharp $SHARP_VERSION has no @img/$pkg."
      ( cd "$WORK" && npm pack --silent "@img/$pkg@$ver" ) >> "$LOG" 2>&1 || die "Couldn't fetch @img/$pkg@$ver."
      mkdir -p "$UI/web/node_modules/@img/$pkg"
      run tar -xzf "$WORK"/img-"$pkg"-*.tgz -C "$UI/web/node_modules/@img/$pkg" --strip-components=1
      rm -f "$WORK"/img-"$pkg"-*.tgz
    done
  done
fi

# ── Claude Code, both architectures, checked against Anthropic's manifest ──
CLAUDE_VERSION=$(curl -fsSL --retry 3 "$CLAUDE_BASE/stable") || die "Couldn't reach downloads.claude.ai."
case "$CLAUDE_VERSION" in [0-9]*.[0-9]*.[0-9]*) ;; *) die "Unexpected Claude Code version: $CLAUDE_VERSION" ;; esac
say "Claude Code $CLAUDE_VERSION"
run curl -fsSL --retry 3 -o "$WORK/claude-manifest.json" "$CLAUDE_BASE/$CLAUDE_VERSION/manifest.json"
for a in $ARCHES; do
  want=$(node -p "require('$WORK/claude-manifest.json').platforms['darwin-$a'].checksum")
  bin="$WORK/arch-$a/tools/bin/claude"
  run curl -fsSL --retry 3 -o "$bin" "$CLAUDE_BASE/$CLAUDE_VERSION/darwin-$a/claude"
  [ "$(sha256_of "$bin")" = "$want" ] || die "Claude Code for darwin-$a doesn't match its checksum."
  chmod 755 "$bin"
done

# ── the headless Chromium career-ops prints PDFs with, both architectures ─
say "PDF browser"
for a in $ARCHES; do
  override=""
  if [ "$a" != "$HOST" ]; then
    # Playwright names Apple Silicon "macNN-arm64" and Intel plain "macNN".
    if [ "$a" = arm64 ]; then override=mac15-arm64; else override=mac15; fi
  fi
  ( cd "$CO" && PLAYWRIGHT_BROWSERS_PATH="$WORK/arch-$a/browsers" PLAYWRIGHT_HOST_PLATFORM_OVERRIDE="$override" \
      npx --yes playwright install --only-shell chromium ) >> "$LOG" 2>&1 ||
    die "Couldn't download the PDF browser for $a."
  rm -rf "$WORK/arch-$a/browsers"/ffmpeg-*
  ls -d "$WORK/arch-$a/browsers"/chromium_headless_shell-*/chrome-headless-shell-mac-"$a" >/dev/null 2>&1 ||
    die "The PDF browser for $a isn't where Playwright looks for it."
done

# ── the payload ────────────────────────────────────────────────────────────
say "Packing"
# gzip, although the DMG is compressed too: the payload stays inside the
# installed app, so this keeps /Applications/JobDesk.app ~1 GB smaller.
run tar -czf "$PAY/common.tar.gz" -C "$WORK/common" career-ops ui
for a in $ARCHES; do
  run tar -czf "$PAY/$a.tar.gz" -C "$WORK/arch-$a" runtime tools browsers
  # What's in it, by version: an in-app update downloads these parts only
  # when this changes (the archive's own checksum changes on every build).
  printf '%s node-%s claude-%s %s\n' "$a" "$NODE_VERSION" "$CLAUDE_VERSION" \
    "$(find "$WORK/arch-$a/browsers" -maxdepth 1 -name 'chromium_headless_shell-*' -exec basename {} \; | sort | head -n 1)" > "$PAY/$a.fingerprint"
done
mkdir -p "$PAY/jobdesk/bin" "$PAY/jobdesk/macos" "$PAY/jobdesk/shims"
cp "$ROOT/install.sh" "$ROOT/VERSION" "$PAY/jobdesk/"
cp "$ROOT/bin/jobdesk" "$PAY/jobdesk/bin/"
cp "$ROOT/macos/dmg-setup.sh" "$ROOT/macos/updater.mjs" "$PAY/jobdesk/macos/"
cp "$ROOT/macos/shims/git" "$PAY/jobdesk/shims/"
chmod 755 "$PAY/jobdesk/bin/jobdesk" "$PAY/jobdesk/shims/git"
BUILD_ID="$VERSION career-ops-$CO_VERSION node-$NODE_VERSION claude-$CLAUDE_VERSION $(date -u +%Y%m%dT%H%M%SZ)"
printf '%s\n' "$BUILD_ID" > "$PAY/build-id"
if [ -n "$KEY" ]; then
  (
    umask 077
    printf 'ANTHROPIC_API_KEY=%q\n' "$KEY" > "$PAY/secrets.env"
    if [ -n "$MODEL" ]; then
      printf 'ANTHROPIC_MODEL=%q\n' "$MODEL" >> "$PAY/secrets.env"
    fi
    if [ -n "$WORKSPACE_ID" ]; then
      printf 'ANTHROPIC_CUSTOM_HEADERS=%q\n' "anthropic-workspace-id: $WORKSPACE_ID" >> "$PAY/secrets.env"
    fi
  )
fi
KEY=""
if [ -n "$UPDATE_TOKEN" ]; then
  ( umask 077 && printf 'JOBDESK_UPDATE_TOKEN=%q\n' "$UPDATE_TOKEN" >> "$PAY/secrets.env" )
  printf 'UPDATE_REPO=%q\nUPDATE_CHANNEL=%q\n' "$UPDATE_REPO" "$UPDATE_CHANNEL" > "$PAY/update.env"
fi
UPDATE_TOKEN=""
if [ -n "$BRAND_FILE" ]; then
  # For first-run setup: the name of their folder in the home folder.
  printf 'BRAND_DATA_DIR=%q\n' "${BRAND_DATA_DIR:-}" > "$PAY/brand.env"
fi

# ── the app ────────────────────────────────────────────────────────────────
say "$APP_NAME.app"
APP="$WORK/dmg/$APP_NAME.app"
# The applet's windows and dialogs say the app's name.
applet_src=$(cat "$ROOT/macos/JobDeskDMG.applescript")
printf '%s\n' "${applet_src//JobDesk/$APP_NAME}" > "$WORK/applet.applescript"
run osacompile -s -o "$APP" "$WORK/applet.applescript"
# install.sh's brand_app: icon, name, bundle id, version.
(
  # shellcheck source=install.sh
  JOBDESK_SOURCE_ONLY=1 . "$ROOT/install.sh"
  SRC_DIR="$ROOT"
  JOBDESK_VERSION="$VERSION"   # sourcing install.sh blanked it
  brand_app "$APP"
) || die "Couldn't brand JobDesk.app."
if ! { plutil -replace CFBundleName -string "$APP_NAME" "$APP/Contents/Info.plist" &&
       plutil -replace CFBundleDisplayName -string "$APP_NAME" "$APP/Contents/Info.plist"; }; then
  die "Couldn't name the app."
fi
cp "$ROOT/macos/dmg/launch" "$APP/Contents/Resources/launch"
chmod 755 "$APP/Contents/Resources/launch"
mv "$PAY" "$APP/Contents/Resources/payload"
[ -n "$TEST_HOME" ] && printf '%s\n' "$TEST_HOME" > "$APP/Contents/Resources/test-home"
run codesign --force --deep --sign - "$APP"
run codesign --verify --deep --strict "$APP"

# ── the disk image ─────────────────────────────────────────────────────────
say "$VOLUME_NAME.dmg"
ln -s /Applications "$WORK/dmg/Applications"
mkdir -p "$OUT"
if [ -n "$BRAND_FILE" ]; then
  python3 "$ROOT/tools/make_dmg_guide.py" --name="$APP_NAME" --from="${BRAND_FROM:-a friend}" \
    --out="$WORK/dmg/How to open $VOLUME_NAME.png" >> "$LOG" 2>&1 || die "Couldn't draw the picture guide."
  DMG="$OUT/$VOLUME_NAME.dmg"
else
  cp "$ROOT/assets/dmg/How to open JobDesk.png" "$WORK/dmg/How to open JobDesk.png"
  DMG="$OUT/JobDesk-$VERSION.dmg"
fi
[ -n "$TEST_HOME" ] && DMG="${DMG%.dmg}-test.dmg"
rm -f "$DMG"
run hdiutil create -volname "$VOLUME_NAME" -srcfolder "$WORK/dmg" -fs HFS+ -format ULMO "$DMG"
size=$(du -h "$DMG" | awk '{print $1}')
say "Built $DMG, $size"
say "  $BUILD_ID"
[ -n "$TEST_HOME" ] && say "  TEST BUILD: sets up in $TEST_HOME, not the real home folder"
[ "$NO_KEY" = 1 ] && say "  No Claude key inside (--no-key)."
[ -n "$MODEL" ] && say "  AI model: $MODEL"
exit 0
