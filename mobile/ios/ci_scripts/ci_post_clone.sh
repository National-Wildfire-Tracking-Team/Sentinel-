#!/bin/zsh
# Xcode Cloud post-clone step: install Node + CocoaPods, JS deps, and Pods so the
# Sentinel workspace builds. Runs from mobile/ios/ci_scripts on a fresh macOS image.
set -euo pipefail

MOBILE_DIR="$CI_PRIMARY_REPOSITORY_PATH/mobile"

# CocoaPods crashes without a UTF-8 locale.
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8

export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_INSTALL_CLEANUP=1
brew install node@24 cocoapods

# node@24 is keg-only, so put it on PATH explicitly.
NODE_PREFIX="$(brew --prefix node@24)"
export PATH="$NODE_PREFIX/bin:$PATH"
node -v

# Xcode's "Bundle React Native code" phase sources .xcode.env(.local) and doesn't
# inherit this shell's PATH, so pin the absolute node binary.
echo "export NODE_BINARY=$NODE_PREFIX/bin/node" > "$MOBILE_DIR/ios/.xcode.env.local"

# Expo inlines EXPO_PUBLIC_* at bundle time. Set these as Xcode Cloud workflow
# environment variables; .env.local is gitignored.
: > "$MOBILE_DIR/.env.local"
for name in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY EXPO_PUBLIC_MAPBOX_TOKEN EXPO_PUBLIC_DATA_SERVICES_URL; do
  if [[ -z "${(P)name:-}" ]]; then
    echo "error: $name is not set in the Xcode Cloud workflow environment" >&2
    exit 1
  fi
  echo "$name=${(P)name}" >> "$MOBILE_DIR/.env.local"
done

cd "$MOBILE_DIR"
npm ci

cd ios
pod install
