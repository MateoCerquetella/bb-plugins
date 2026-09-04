#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD="$ROOT/build"
APP="$BUILD/BBTouchBar.app"
MACOS_DIR="$APP/Contents/MacOS"
RESOURCES="$APP/Contents/Resources"
DEPLOY_TARGET="11.0"
VERSION="${BB_TOUCHBAR_VERSION:-0.1.0}"
BUILD_NUMBER="${BB_TOUCHBAR_BUILD_NUMBER:-1}"
SIGN_IDENTITY="${BB_TOUCHBAR_SIGN_IDENTITY:--}"

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]] || {
  printf 'error: invalid app version %s\n' "$VERSION" >&2
  exit 1
}
[[ "$BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]] || {
  printf 'error: invalid build number %s\n' "$BUILD_NUMBER" >&2
  exit 1
}

rm -rf "$APP"
mkdir -p "$MACOS_DIR" "$RESOURCES"
cp "$ROOT"/Assets/*.svg "$RESOURCES"/
cp "$ROOT"/Assets/*.png "$RESOURCES"/

ICON_SOURCE="$ROOT/Assets/app-icon-1024.png"
ICONSET="$BUILD/BBTouchBar.iconset"
[ -f "$ICON_SOURCE" ] || {
  printf 'error: missing app icon source %s\n' "$ICON_SOURCE" >&2
  exit 1
}
rm -rf "$ICONSET"
mkdir -p "$ICONSET"
for spec in \
  "16 icon_16x16.png" \
  "32 icon_16x16@2x.png" \
  "32 icon_32x32.png" \
  "64 icon_32x32@2x.png" \
  "128 icon_128x128.png" \
  "256 icon_128x128@2x.png" \
  "256 icon_256x256.png" \
  "512 icon_256x256@2x.png" \
  "512 icon_512x512.png" \
  "1024 icon_512x512@2x.png"; do
  read -r pixels filename <<< "$spec"
  sips -z "$pixels" "$pixels" "$ICON_SOURCE" \
    --out "$ICONSET/$filename" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$RESOURCES/BBTouchBar.icns"
rm -rf "$ICONSET"

compile() {
  local arch="$1" output="$2"
  xcrun swiftc -O -warnings-as-errors \
    -target "${arch}-apple-macosx${DEPLOY_TARGET}" \
    -import-objc-header "$ROOT/Sources/BBTouchBarPrivate.h" \
    -framework Cocoa \
    -F /System/Library/PrivateFrameworks -framework DFRFoundation \
    -o "$output" "$ROOT"/Sources/*.swift
}

slices=()
for arch in x86_64 arm64; do
  if compile "$arch" "$BUILD/BBTouchBar-$arch" 2>"$BUILD/build-$arch.log"; then
    slices+=("$BUILD/BBTouchBar-$arch")
  else
    printf 'note: skipping %s slice (see %s)\n' "$arch" "$BUILD/build-$arch.log" >&2
  fi
done

if [ "${#slices[@]}" -eq 0 ]; then
  printf '%s\n' 'error: no architecture compiled' >&2
  cat "$BUILD"/build-*.log >&2
  exit 1
fi

if [ "${#slices[@]}" -gt 1 ]; then
  lipo -create -output "$MACOS_DIR/BBTouchBar" "${slices[@]}"
else
  cp "${slices[0]}" "$MACOS_DIR/BBTouchBar"
fi
rm -f "${slices[@]}"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>BBTouchBar</string>
  <key>CFBundleIdentifier</key><string>app.getbb.touchbar.native</string>
  <key>CFBundleName</key><string>BBTouchBar</string>
  <key>CFBundleDisplayName</key><string>BB Touch Bar</string>
  <key>CFBundleIconFile</key><string>BBTouchBar</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$BUILD_NUMBER</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSSupportsAutomaticTermination</key><false/>
  <key>NSSupportsSuddenTermination</key><false/>
</dict>
</plist>
PLIST

plutil -lint "$APP/Contents/Info.plist" >/dev/null
if [ "$SIGN_IDENTITY" = "-" ]; then
  codesign --force --sign - --timestamp=none "$APP"
else
  codesign --force --options runtime --sign "$SIGN_IDENTITY" --timestamp "$APP"
fi
codesign --verify --deep --strict "$APP"
printf 'built %s\n' "$APP"
