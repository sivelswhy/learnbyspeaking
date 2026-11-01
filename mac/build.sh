#!/bin/bash
# Construit mac/build/LearnBySpeaking.app : interface web exportée + coque macOS native.
# SKIP_WEB=1 : réutilise le dossier out/ déjà construit.
set -euo pipefail
cd "$(dirname "$0")/.."
[ "${SKIP_WEB:-}" = 1 ] || npm run build
[ -f out/index.html ] || { echo "out/index.html absent : lance npm run build" >&2; exit 1; }

APP=mac/build/LearnBySpeaking.app
rm -rf mac/build
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

# Menu Debug local (ignoré par git) s'il existe, sinon version vide.
DEBUG=mac/Debug.local.swift
[ -f "$DEBUG" ] || DEBUG=mac/DebugStub.swift

swiftc -swift-version 5 -O -o "$APP/Contents/MacOS/LearnBySpeaking" mac/main.swift mac/DebugContext.swift "$DEBUG"
cp mac/Info.plist "$APP/Contents/Info.plist"
cp -R out "$APP/Contents/Resources/out"

# Icône : mac/icon/icon-1024.png (gabarit macOS : marge + ombre) -> .icns
ICONSET=mac/build/LearnBySpeaking.iconset
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s mac/icon/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) mac/icon/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/LearnBySpeaking.icns"
rm -rf "$ICONSET"

# Copie sans attributs étendus (com.apple.provenance fait échouer codesign), puis signature ad hoc.
ditto --noextattr --noqtn --norsrc "$APP" mac/build/clean.app
rm -rf "$APP"; mv mac/build/clean.app "$APP"
xattr -cr "$APP" 2>/dev/null || true
codesign --force --deep --sign - "$APP"
echo "OK : $APP"
