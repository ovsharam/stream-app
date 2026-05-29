#!/usr/bin/env bash
# Installs whisper.cpp + ggml-medium.en for Stream meeting transcription (M1 Mac).
set -euo pipefail

WHISPER_DIR="${STREAM_WHISPER_DIR:-$HOME/Library/Application Support/stream-app/whisper}"
BUILD_DIR="${STREAM_WHISPER_BUILD:-/tmp/whisper.cpp-build}"
MODEL="medium.en"

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

if [[ ! -x "$WHISPER_DIR/stream" ]]; then
  echo "==> Building whisper.cpp (Metal + SDL2)…"
  rm -rf "$BUILD_DIR"
  git clone --depth 1 https://github.com/ggerganov/whisper.cpp "$BUILD_DIR"
  cd "$BUILD_DIR"

  # Newer whisper.cpp uses cmake + the examples are gated by WHISPER_SDL2.
  cmake -B build -DGGML_METAL=1 -DWHISPER_SDL2=1
  cmake --build build --config Release -j

  # Find the stream binary across whisper.cpp build layout variations.
  STREAM_BIN=""
  for candidate in \
    "$BUILD_DIR/build/bin/whisper-stream" \
    "$BUILD_DIR/build/bin/stream" \
    "$BUILD_DIR/build/examples/stream/stream" \
    "$BUILD_DIR/build/examples/stream/whisper-stream"; do
    if [[ -x "$candidate" ]]; then
      STREAM_BIN="$candidate"
      break
    fi
  done

  if [[ -z "$STREAM_BIN" ]]; then
    echo "⚠  Could not find built stream binary. Inspect:"
    find "$BUILD_DIR/build" -name "*stream*" -type f 2>/dev/null || true
    exit 1
  fi

  cp "$STREAM_BIN" "$WHISPER_DIR/stream"
  chmod +x "$WHISPER_DIR/stream"

  # Bundle Metal kernels next to the binary (whisper.cpp reads ggml-metal.metal from CWD or binary dir).
  for metal in "$BUILD_DIR/build/bin/ggml-metal.metal" "$BUILD_DIR/ggml/src/ggml-metal/ggml-metal.metal"; do
    if [[ -f "$metal" ]]; then
      cp "$metal" "$WHISPER_DIR/" 2>/dev/null || true
      break
    fi
  done

  echo "    binary: $WHISPER_DIR/stream"
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
