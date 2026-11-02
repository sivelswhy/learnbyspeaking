#!/bin/bash
# Construit mac/build/LearnBySpeaking.app : app macOS entièrement native (SwiftUI, sans vue web).
# Les contenus partagés viennent du TypeScript (scripts/export-native.ts).
set -euo pipefail
cd "$(dirname "$0")/.."
npx jiti scripts/export-native.ts

APP="mac/build/LearnBySpeaking.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

DEV=mac/native/Dev.local.swift
[ -f "$DEV" ] || DEV=mac/native/DevStub.swift
# onnxruntime (Homebrew : brew install onnxruntime) pour la voix Piper : couche C appelée depuis Swift.
ORT=$(brew --prefix onnxruntime)
OBJ=mac/build/ort_shim.o
clang -c -O2 -I"$ORT/include" mac/native/ort/ort_shim.c -o "$OBJ"
swiftc -swift-version 5 -O -parse-as-library -import-objc-header mac/native/ort/ort_shim.h \
  -o "$APP/Contents/MacOS/LearnBySpeaking" mac/Models.swift "$DEV" $(ls mac/native/*.swift | grep -v -e Dev.local.swift -e DevStub.swift) \
  "$OBJ" -L"$ORT/lib" -lonnxruntime -Xlinker -rpath -Xlinker @executable_path/../Frameworks

# Bibliothèques d'onnxruntime et leurs dépendances Homebrew, copiées dans le paquet (noms réécrits en @rpath).
FW="$APP/Contents/Frameworks"
mkdir -p "$FW"
bundle() {
  local lib=$1 base dep
  base=$(basename "$lib")
  [ -f "$FW/$base" ] && return
  cp -L "$lib" "$FW/$base"; chmod u+w "$FW/$base"
  install_name_tool -id "@rpath/$base" "$FW/$base" 2>/dev/null
  for dep in $(otool -L "$lib" | awk 'NR>1 {print $1}' | grep '^/opt/homebrew'); do
    bundle "$dep"
    install_name_tool -change "$dep" "@rpath/$(basename "$dep")" "$FW/$base" 2>/dev/null
  done
}
bundle "$ORT/lib/libonnxruntime.1.dylib"
for f in "$FW"/*.dylib; do install_name_tool -add_rpath @loader_path "$f" 2>/dev/null || true; done
install_name_tool -change "$ORT/lib/libonnxruntime.1.dylib" @rpath/libonnxruntime.1.dylib "$APP/Contents/MacOS/LearnBySpeaking" 2>/dev/null || true
for f in "$APP/Contents/MacOS/LearnBySpeaking" "$FW"/*.dylib; do otool -L "$f" | awk 'NR>1{print $1}' | grep -q /opt/homebrew && { echo "dépendance Homebrew restante : $f" >&2; exit 1; }; done
# Menus système en français (Édition, Fenêtre…) : langue de développement fr.
sed -e 's#<key>CFBundlePackageType</key>#<key>CFBundleDevelopmentRegion</key><string>fr</string>\n  <key>CFBundleLocalizations</key><array><string>fr</string></array>\n  &#' mac/Info.plist > "$APP/Contents/Info.plist"
mkdir -p "$APP/Contents/Resources/fr.lproj"
cp mac/native/Resources/content.json mac/native/Resources/dict-fr-he.json mac/native/Resources/Nunito-*.ttf mac/native/Resources/phonikud-vocab.json "$APP/Contents/Resources/"

LLAMA=${LLAMA_DIR:-$HOME/learnbyspeaking-models/llamacpp/llama-b11732}
mkdir -p "$APP/Contents/Resources/llama" "$APP/Contents/Resources/whisper"
cp -a "$LLAMA/llama-server" "$LLAMA"/libllama-server-impl.dylib "$LLAMA"/libllama-common.*dylib "$LLAMA"/libmtmd.*dylib \
  "$LLAMA"/libllama.*dylib "$LLAMA"/libggml*.dylib "$APP/Contents/Resources/llama/"
cp "${WHISPER_BIN:-$HOME/learnbyspeaking-models/whispercpp/src/build/bin/whisper-server}" "$APP/Contents/Resources/whisper/whisper-server"

ICONSET=mac/build/native.iconset
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z $s $s mac/icon/icon-1024.png --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  sips -z $((s*2)) $((s*2)) mac/icon/icon-1024.png --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/LearnBySpeaking.icns"
rm -rf "$ICONSET"

ditto --noextattr --noqtn --norsrc "$APP" mac/build/clean-native.app
rm -rf "$APP"; mv mac/build/clean-native.app "$APP"
xattr -cr "$APP" 2>/dev/null || true
codesign --force --deep --sign - "$APP"
echo "OK : $APP"
