#!/bin/sh
set -eu
TASK_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
BUILD_DIR="$TASK_ROOT/desktop/dist"
APP="$BUILD_DIR/Bloch Space.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources" "$BUILD_DIR/icons" "$BUILD_DIR/AppIcon.iconset"
swiftc -swift-version 5 -module-cache-path "$BUILD_DIR/swift-cache" "$TASK_ROOT/desktop/BlochSpace/Icon.swift" -o "$BUILD_DIR/make-icon"
"$BUILD_DIR/make-icon" "$BUILD_DIR/icons"
cp "$BUILD_DIR/icons/icon-192.png" "$TASK_ROOT/space/public/assets/icon-192.png"
cp "$BUILD_DIR/icons/icon-512.png" "$TASK_ROOT/space/public/assets/icon-512.png"
for size in 16 32 128 256 512; do
  cp "$BUILD_DIR/icons/icon-$size.png" "$BUILD_DIR/AppIcon.iconset/icon_${size}x${size}.png"
  double=$((size * 2))
  cp "$BUILD_DIR/icons/icon-$double.png" "$BUILD_DIR/AppIcon.iconset/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$BUILD_DIR/AppIcon.iconset" -o "$APP/Contents/Resources/AppIcon.icns"
for arch in x86_64 arm64; do
  swiftc -swift-version 5 -O -target "$arch-apple-macosx12.0" -module-cache-path "$BUILD_DIR/swift-cache" -framework AppKit -framework WebKit "$TASK_ROOT/desktop/BlochSpace/main.swift" -o "$BUILD_DIR/BlochSpace-$arch"
done
lipo -create "$BUILD_DIR/BlochSpace-x86_64" "$BUILD_DIR/BlochSpace-arm64" -output "$APP/Contents/MacOS/BlochSpace"
cp "$TASK_ROOT/desktop/BlochSpace/Info.plist" "$APP/Contents/Info.plist"
cp "$TASK_ROOT/desktop/BlochSpace/offline.html" "$APP/Contents/Resources/offline.html"
codesign --force --deep --sign - "$APP"
ditto -c -k --keepParent "$APP" "$BUILD_DIR/Bloch-Space-1.1.0-macOS-universal.zip"
shasum -a 256 "$BUILD_DIR/Bloch-Space-1.1.0-macOS-universal.zip" > "$BUILD_DIR/Bloch-Space-1.1.0-macOS-universal.zip.sha256"
printf 'Built %s\n' "$APP"
