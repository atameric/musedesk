#!/bin/sh
# Fail when the packaged app or DMGs contain any non-arm64 Mach-O slice.
# macOS-only (lipo/hdiutil); run after `npm run package` / `npm run make`.
# Like `make`, DMG inspection needs hdiutil device access, so run this in a
# normal terminal. Missing artifacts are skipped, not errors.
set -eu

fail=0

scan_tree() {
  root="$1"
  label="$2"
  found="$(find "$root" -type f -exec sh -c '
    file -b "$1" | grep -q "Mach-O" || exit 0
    archs="$(lipo -archs "$1" 2>/dev/null || echo "?")"
    [ "$archs" = "arm64" ] || echo "$archs :: $1"
  ' _ {} \; 2>/dev/null || true)"
  if [ -n "$found" ]; then
    echo "FAIL: non-arm64 Mach-O in $label:"
    echo "$found"
    fail=1
  else
    echo "OK: $label is arm64-only"
  fi
}

APP="out/MuseDesk-darwin-arm64/MuseDesk.app"
if [ -d "$APP" ]; then
  scan_tree "$APP" "$APP"
else
  echo "SKIP: $APP not built (run npm run package first)"
fi

for dmg in out/make/*.dmg; do
  [ -e "$dmg" ] || continue
  mnt="$(hdiutil attach "$dmg" -nobrowse -readonly 2>/dev/null | tail -1 | cut -f3- || true)"
  if [ -z "${mnt:-}" ] || [ ! -d "$mnt" ]; then
    echo "SKIP: cannot mount $dmg (needs a normal terminal with hdiutil access)"
    continue
  fi
  scan_tree "$mnt/MuseDesk.app" "$dmg"
  hdiutil detach "$mnt" >/dev/null 2>&1 || true
done

if [ "$fail" -ne 0 ]; then
  echo "check:arch FAILED: Intel slices present — rebuild arm64-only."
  exit 1
fi
echo "check:arch passed."
