#!/bin/bash
# Publish a branded DMG build as an in-app update (see macos/updater.mjs).
#
# Usage: tools/publish-update.sh --brand=brands/<name>.env [--notes="What's new"] [--dmg=PATH]
#
# Reads the update channel from the brand file (BRAND_UPDATE_REPO,
# BRAND_UPDATE_CHANNEL), takes the payload out of the built DMG (by default
# dist/<BRAND_VOLUME>.dmg) and makes a release "<channel>-<build stamp>" in
# that private repository with:
#   manifest.json   what's in it, with SHA-256s
#   payload.tar     the app's own files (scripts, career-ops, web UI): never
#                   the Claude key (secrets.env is left out and checked for)
#   arm64.tar.gz / x64.tar.gz   only when they changed since the last release
# Needs gh with access to the repository (GH_TOKEN works).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BRAND_FILE=""
NOTES=""
DMG=""
for arg in "$@"; do
  case "$arg" in
    --brand=*) BRAND_FILE="${arg#--brand=}" ;;
    --notes=*) NOTES="${arg#--notes=}" ;;
    --dmg=*) DMG="${arg#--dmg=}" ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "publish-update: unknown option $arg" >&2; exit 2 ;;
  esac
done
die() { echo "publish-update: $*" >&2; exit 1; }
[ -f "$BRAND_FILE" ] || die "--brand=brands/<name>.env is required."
# shellcheck source=/dev/null
. "$BRAND_FILE"
REPO="${BRAND_UPDATE_REPO:-}"
CHANNEL="${BRAND_UPDATE_CHANNEL:-}"
[ -n "$REPO" ] && [ -n "$CHANNEL" ] || die "$BRAND_FILE has no BRAND_UPDATE_REPO / BRAND_UPDATE_CHANNEL."
[ -n "$DMG" ] || DMG="$ROOT/dist/${BRAND_VOLUME:-${BRAND_NAME:-JobDesk}}.dmg"
[ -f "$DMG" ] || die "No DMG at $DMG. Build it first (tools/build-dmg.sh --brand=$BRAND_FILE)."
command -v gh >/dev/null || die "needs gh (GitHub CLI)."

WORK=$(mktemp -d "${TMPDIR:-/tmp}/publish-update.XXXXXX")
WORK=${WORK%/}
MNT=""
cleanup() { [ -n "$MNT" ] && hdiutil detach -quiet "$MNT" 2>/dev/null; rm -rf "$WORK"; }
trap cleanup EXIT
MNT=$(hdiutil attach -nobrowse -readonly "$DMG" | tail -n 1 | awk -F'\t' '{print $NF}')
PAY=$(find "$MNT" -maxdepth 4 -type d -name payload | head -n 1)
[ -n "$PAY" ] && [ -f "$PAY/build-id" ] || die "No payload in $DMG."
[ -f "$PAY/update.env" ] || die "This DMG wasn't built with an update channel; build it again with BRAND_UPDATE_CHANNEL set."

BUILD=$(tr -d '\n' < "$PAY/build-id")
STAMP=${BUILD##* }
VERSION=$(tr -d ' \n' < "$PAY/jobdesk/VERSION")
TAG="$CHANNEL-$STAMP"

# The app's own files, never the key.
mkdir -p "$WORK/payload"
for f in jobdesk build-id brand.env update.env common.tar.gz arm64.fingerprint x64.fingerprint; do
  [ -e "$PAY/$f" ] && cp -R "$PAY/$f" "$WORK/payload/"
done
[ ! -e "$WORK/payload/secrets.env" ] || die "refusing: secrets.env in the update"
# Settings files must hold no key or token values; nothing anywhere a key's shape.
if grep -qs "ANTHROPIC_API_KEY=\|JOBDESK_UPDATE_TOKEN=" "$WORK/payload"/*.env ||
   grep -rqs "sk-ant-api\|github_pat_" "$WORK/payload/jobdesk" "$WORK/payload"/*.env; then
  die "refusing: a key or token in the update's files"
fi
tar -cf "$WORK/payload.tar" -C "$WORK/payload" .
sha() { shasum -a 256 "$1" | awk '{print $1}'; }
size() { stat -f %z "$1"; }

# Unchanged arch parts stay in the release that first carried them.
PREV=$(gh release list -R "$REPO" --limit 30 --json tagName --jq '.[].tagName' | grep "^$CHANNEL-" | sort -r | head -n 1 || true)
PREV_MANIFEST="$WORK/prev.json"
if [ -n "$PREV" ]; then
  gh release download "$PREV" -R "$REPO" -p manifest.json -O "$PREV_MANIFEST" 2>/dev/null || PREV=""
fi
UPLOAD=("$WORK/manifest.json" "$WORK/payload.tar")
ARCH_JSON=""
for a in arm64 x64; do
  [ -f "$PAY/$a.tar.gz" ] || continue
  fp=$(tr -d '\n' < "$PAY/$a.fingerprint" 2>/dev/null || true)
  prev() { python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['assets'].get(sys.argv[2],{}).get(sys.argv[3]) or '')" "$PREV_MANIFEST" "$a" "$1"; }
  if [ -n "$PREV" ] && [ -n "$fp" ] && [ "$(prev fingerprint)" = "$fp" ]; then
    # Same Node, Claude Code and browser: point at the release that has them.
    ARCH_JSON="$ARCH_JSON, \"$a\": {\"name\": \"$a.tar.gz\", \"sha256\": \"$(prev sha256)\", \"size\": $(prev size), \"fingerprint\": \"$fp\", \"tag\": \"$(prev tag)\"}"
  else
    UPLOAD+=("$PAY/$a.tar.gz")
    ARCH_JSON="$ARCH_JSON, \"$a\": {\"name\": \"$a.tar.gz\", \"sha256\": \"$(sha "$PAY/$a.tar.gz")\", \"size\": $(size "$PAY/$a.tar.gz"), \"fingerprint\": \"$fp\", \"tag\": \"$TAG\"}"
  fi
done
cat > "$WORK/manifest.json" <<EOF
{"stamp": "$STAMP", "build": "$BUILD", "version": "$VERSION",
 "assets": {"payload": {"name": "payload.tar", "sha256": "$(sha "$WORK/payload.tar")", "size": $(size "$WORK/payload.tar"), "tag": "$TAG"}$ARCH_JSON}}
EOF
python3 -m json.tool "$WORK/manifest.json" > /dev/null || die "bad manifest"

gh release create "$TAG" -R "$REPO" --title "$VERSION ($STAMP)" --notes "${NOTES:-A new version of the app.}" "${UPLOAD[@]}"
echo "Published $TAG to $REPO ($(( $(size "$WORK/payload.tar") / 1048576 )) MB payload$([ ${#UPLOAD[@]} -gt 2 ] && echo ' + new parts for each Mac'))."
