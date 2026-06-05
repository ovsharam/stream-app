#!/usr/bin/env bash
# Installs whisper.cpp + ggml-medium.en for Stream meeting transcription (macOS).
set -euo pipefail

WHISPER_DIR="${STREAM_WHISPER_DIR:-$HOME/Library/Application Support/stream-app/whisper}"
BUILD_DIR="${STREAM_WHISPER_BUILD:-/tmp/whisper.cpp-build}"
MODEL="medium.en"
STREAM_BIN="$WHISPER_DIR/stream"

# Dynamic whisper.cpp builds reference @rpath libs under BUILD_DIR (/tmp). macOS may
# clean /tmp, leaving a copied binary that fails with "Library not loaded: libwhisper".
whisper_binary_ok() {
  local bin="$1"
  [[ -x "$bin" ]] || return 1
  if /usr/bin/otool -L "$bin" 2>/dev/null | grep -q '@rpath/libwhisper'; then
    return 1
  fi
  return 0
}

echo "==> Stream whisper setup"
echo "    install dir: $WHISPER_DIR"

mkdir -p "$WHISPER_DIR/models"

if ! command -v sdl2-config >/dev/null 2>&1; then
  echo "⚠  SDL2 missing — required for live mic capture."
  echo "   Install: brew install sdl2"
  exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "⚠  cmake missing — required for whisper.cpp build."
  echo "   Install: brew install cmake"
  exit 1
fi

if ! whisper_binary_ok "$STREAM_BIN"; then
  if [[ -x "$STREAM_BIN" ]]; then
    echo "==> Removing broken whisper binary (stale @rpath to build dir)…"
    rm -f "$STREAM_BIN"
  fi

  echo "==> Building whisper.cpp (Metal + SDL2, static)…"
  rm -rf "$BUILD_DIR"
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp "$BUILD_DIR"
  cd "$BUILD_DIR"

  # Static link so the installed binary does not depend on dylibs left in /tmp.
  cmake -B build \
    -DGGML_METAL=1 \
    -DGGML_METAL_EMBED_LIBRARY=1 \
    -DWHISPER_SDL2=1 \
    -DBUILD_SHARED_LIBS=OFF
  cmake --build build --config Release -j

  # Use whisper-stream only — build/bin/stream is a deprecated stub that exits immediately.
  STREAM_SRC=""
  for candidate in \
    "$BUILD_DIR/build/bin/whisper-stream" \
    "$BUILD_DIR/build/examples/stream/whisper-stream"; do
    if [[ -x "$candidate" ]]; then
      STREAM_SRC="$candidate"
      break
    fi
  done

  if [[ -z "$STREAM_SRC" ]]; then
    echo "⚠  Could not find built whisper-stream binary. Inspect:"
    find "$BUILD_DIR/build" -name "*whisper-stream*" -type f 2>/dev/null || true
    exit 1
  fi

  cp "$STREAM_SRC" "$STREAM_BIN"
  chmod +x "$STREAM_BIN"

  # Fallback for non-embedded Metal builds (harmless when Metal is embedded).
  for metal in "$BUILD_DIR/build/bin/ggml-metal.metal" "$BUILD_DIR/ggml/src/ggml-metal/ggml-metal.metal"; do
    if [[ -f "$metal" ]]; then
      cp "$metal" "$WHISPER_DIR/" 2>/dev/null || true
      break
    fi
  done

  if ! whisper_binary_ok "$STREAM_BIN"; then
    echo "⚠  Installed binary still references @rpath dylibs — build may have failed to static-link."
    /usr/bin/otool -L "$STREAM_BIN" 2>/dev/null || true
    exit 1
  fi

  echo "    binary: $STREAM_BIN"
else
  echo "==> Binary already present"
fi

MODEL_PATH="$WHISPER_DIR/models/ggml-${MODEL}.bin"
if [[ ! -f "$MODEL_PATH" ]]; then
  echo "==> Downloading ggml-${MODEL} model (~1.5 GB)…"
  curl -L --fail --progress-bar -o "$MODEL_PATH" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${MODEL}.bin"
  echo "    model: $MODEL_PATH"
else
  echo "==> Model already present"
fi

if system_profiler SPAudioDataType 2>/dev/null | grep -qi blackhole; then
  echo "==> BlackHole detected — configure a Multi-Output Device for full call audio"
else
  echo ""
  echo "ℹ  BlackHole not found (optional). For both sides of a call:"
  echo "   brew install blackhole-2ch"
  echo "   System Settings → Sound → Output → Multi-Output Device (speakers + BlackHole)"
  echo "   Without BlackHole: mic-only capture (your side only)."
fi

echo ""
echo "Done. Verify in Stream:"
echo "  1. ⌘⇧M → meeting panel should show whisper installed"
echo "  2. ⌘⇧L → start a meeting; panel should show 'audio tap running'"
echo "  3. Talk for ~10s, then ⌘⇧K to end"
