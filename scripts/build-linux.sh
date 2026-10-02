#!/usr/bin/env bash
# Build the Linux .deb and AppImage from the same Tauri configuration.
set -euo pipefail

if [ -f /etc/debian_version ]; then
  echo "==> Installing Tauri system dependencies (sudo may ask for a password)"
  sudo apt-get update
  sudo apt-get install -y \
    libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
    libjavascriptcoregtk-4.1-dev patchelf
fi

npm ci
npx tauri build --bundles deb,appimage

echo
echo "Artifacts:"
find src-tauri/target/release/bundle -maxdepth 2 \( -name "*.deb" -o -name "*.AppImage" \) -print
