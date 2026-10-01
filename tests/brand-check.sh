#!/bin/bash
# The brand layer's edits still apply to the career-ops release a DMG build
# uses. tools/brand_web.py edits career-ops's web UI at exact anchors, so a
# release that moves one breaks only the next branded build; this finds it in
# seconds. Usage: tests/brand-check.sh [career-ops git dir or URL] [version]
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=${1:-https://github.com/career-ops-hq/career-ops.git}
VERSION=${2:-}
WORK=$(mktemp -d "${TMPDIR:-/tmp}"/brand-check.XXXXXX)
WORK=${WORK%/}
trap 'rm -rf "$WORK"' EXIT

if [ -d "$SRC/.git" ]; then
  CO=$SRC
else
  [ -n "$VERSION" ] || VERSION=$(git ls-remote --tags --refs "$SRC" 'career-ops-v*' |
    sed 's#.*refs/tags/career-ops-v##' | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)
  CO="$WORK/career-ops"
  git clone --quiet --depth=1 --branch "career-ops-v$VERSION" "$SRC" "$CO"
fi
[ -n "$VERSION" ] || VERSION=$(git -C "$CO" tag -l 'career-ops-v*' | sed 's#career-ops-v##' |
  sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1)
mkdir -p "$WORK/ui"
git -C "$CO" archive --format=tar "career-ops-v$VERSION" web | tar -xf - -C "$WORK/ui"
# What tools/build-dmg.sh does before branding.
(
  # shellcheck source=install.sh
  JOBDESK_SOURCE_ONLY=1 . "$ROOT/install.sh"
  patch_web_ui "$WORK/ui/web"
)
cp "$ROOT/ui/jobdesk-start.html" "$WORK/ui/web/public/jobdesk-start.html"

# Every theme, so each theme's anchors are checked too.
for theme in "" howl; do
  rm -rf "$WORK/web" && cp -R "$WORK/ui/web" "$WORK/web"
  (
    set -a
    # shellcheck source=/dev/null
    . "$ROOT/brands/example.env"
    export BRAND_THEME="$theme"
    set +a
    python3 "$ROOT/tools/brand_web.py" "$WORK/web" "$ROOT/assets/JobDesk.png" >/dev/null
  )
  echo "brand edits apply to career-ops $VERSION (theme: ${theme:-none})"
done
