#!/usr/bin/env bash
# 下载官方 Node 二进制作为 Tauri sidecar（不入库，见 .gitignore）
# 用法: bash scripts/fetch-sidecar.sh [node-version]
set -euo pipefail

VER="${1:-v23.11.0}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/desktop/src-tauri/binaries"
mkdir -p "$DEST"

OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Darwin)
    case "$ARCH" in
      arm64) TRIPLE="aarch64-apple-darwin"; PKG="darwin-arm64" ;;
      x86_64) TRIPLE="x86_64-apple-darwin"; PKG="darwin-x64" ;;
      *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
    esac
    EXT="tar.xz" ;;
  Linux)
    case "$ARCH" in
      x86_64) TRIPLE="x86_64-unknown-linux-gnu"; PKG="linux-x64" ;;
      aarch64) TRIPLE="aarch64-unknown-linux-gnu"; PKG="linux-arm64" ;;
      *) echo "unsupported arch: $ARCH" >&2; exit 1 ;;
    esac
    EXT="tar.xz" ;;
  MINGW*|MSYS*|CYGWIN*)
    TRIPLE="x86_64-pc-windows-msvc"; PKG="win-x64"; EXT="zip" ;;
  *) echo "unsupported os: $OS" >&2; exit 1 ;;
esac

NAME="node-$VER-$PKG"
URL="https://nodejs.org/dist/$VER/$NAME.$EXT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "downloading $URL"
curl -fL --retry 3 -o "$TMP/node.$EXT" "$URL"

if [ "$EXT" = "zip" ]; then
  unzip -q "$TMP/node.$EXT" -d "$TMP"
  cp "$TMP/$NAME/node.exe" "$DEST/node-$TRIPLE.exe"
else
  tar -xf "$TMP/node.$EXT" -C "$TMP"
  cp "$TMP/$NAME/bin/node" "$DEST/node-$TRIPLE"
  chmod +x "$DEST/node-$TRIPLE"
fi

echo "sidecar ready: $DEST/node-$TRIPLE$([ "$EXT" = zip ] && echo .exe)"