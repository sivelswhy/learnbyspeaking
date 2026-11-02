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

# Cerveau de Shuli : llama-server (llama.cpp, Metal) et ses bibliothèques. Le modèle GGUF n'est pas dans le paquet :
# il est lu dans ~/Library/Application Support/LearnBySpeaking/models/ (voir LlamaServer dans main.swift).
LLAMA=${LLAMA_DIR:-$HOME/learnbyspeaking-models/llamacpp/llama-b11732}
if [ -x "$LLAMA/llama-server" ]; then
  mkdir -p "$APP/Contents/Resources/llama"
  cp -a "$LLAMA/llama-server" "$LLAMA"/libllama-server-impl.dylib "$LLAMA"/libllama-common.*dylib "$LLAMA"/libmtmd.*dylib \
    "$LLAMA"/libllama.*dylib "$LLAMA"/libggml*.dylib "$APP/Contents/Resources/llama/"
else
  echo "llama-server absent ($LLAMA) : l'app utilisera WebLLM" >&2
fi

# Oreille de Shuli : whisper-server (whisper.cpp, compilé en statique avec Metal intégré : un seul fichier).
WHISPER=${WHISPER_BIN:-$HOME/learnbyspeaking-models/whispercpp/src/build/bin/whisper-server}
if [ -x "$WHISPER" ]; then
  mkdir -p "$APP/Contents/Resources/whisper"
  cp "$WHISPER" "$APP/Contents/Resources/whisper/whisper-server"
else
  echo "whisper-server absent ($WHISPER) : l'app utilisera Whisper WebGPU" >&2
fi

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
