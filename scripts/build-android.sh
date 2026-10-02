#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Kuro Manga — headless Android build.
#
# Installs the Android SDK *command-line tools* only (never Android Studio),
# accepts the licenses, adds the Rust Android targets, creates a signing
# keystore if none exists and produces a signed, installable .apk.
#
#   ./scripts/build-android.sh
# ---------------------------------------------------------------------------
set -euo pipefail

SDK_ROOT="${ANDROID_HOME:-$HOME/Android/sdk}"
CMDLINE_VERSION="11076708"          # cmdline-tools 12.0
BUILD_TOOLS="34.0.0"
PLATFORM="android-34"
NDK_VERSION="26.1.10909125"
KEYSTORE="${KEYSTORE_PATH:-$HOME/.android/kuro-manga.keystore}"
KEY_ALIAS="${KEY_ALIAS:-kuro}"
KEY_PASSWORD="${KEY_PASSWORD:-kuromanga}"

echo "==> Android SDK root: $SDK_ROOT"
mkdir -p "$SDK_ROOT"

if [ ! -d "$SDK_ROOT/cmdline-tools/latest" ]; then
  echo "==> Installing Android command-line tools"
  tmp="$(mktemp -d)"
  curl -sSL -o "$tmp/tools.zip" \
    "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_VERSION}_latest.zip"
  unzip -q "$tmp/tools.zip" -d "$tmp"
  mkdir -p "$SDK_ROOT/cmdline-tools"
  mv "$tmp/cmdline-tools" "$SDK_ROOT/cmdline-tools/latest"
  rm -rf "$tmp"
fi

export ANDROID_HOME="$SDK_ROOT"
export ANDROID_SDK_ROOT="$SDK_ROOT"
export PATH="$SDK_ROOT/cmdline-tools/latest/bin:$SDK_ROOT/platform-tools:$PATH"

echo "==> Accepting licenses and installing SDK packages"
yes | sdkmanager --licenses >/dev/null
sdkmanager --install \
  "platform-tools" \
  "platforms;${PLATFORM}" \
  "build-tools;${BUILD_TOOLS}" \
  "ndk;${NDK_VERSION}" >/dev/null

export NDK_HOME="$SDK_ROOT/ndk/$NDK_VERSION"

echo "==> Adding Rust Android targets"
rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android

if [ ! -f "$KEYSTORE" ]; then
  echo "==> Creating signing keystore at $KEYSTORE (never commit this file)"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEY_PASSWORD" -keypass "$KEY_PASSWORD" \
    -dname "CN=Kuro Manga, OU=Dev, O=Kuro, L=., S=., C=US"
fi

echo "==> Initialising the Tauri Android project (idempotent)"
npx tauri android init || true

PROPS="src-tauri/gen/android/keystore.properties"
mkdir -p "$(dirname "$PROPS")"
cat > "$PROPS" <<EOF
storeFile=$KEYSTORE
storePassword=$KEY_PASSWORD
keyAlias=$KEY_ALIAS
password=$KEY_PASSWORD
EOF

echo "==> Building the signed APK"
npx tauri android build --apk

echo
echo "APK(s):"
find src-tauri/gen/android -name "*.apk" -print
