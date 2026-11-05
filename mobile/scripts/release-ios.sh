#!/usr/bin/env bash
# Build a production iOS binary on EAS, download the .ipa, and open it in Transporter.
# Uploads go through Transporter instead of EAS Submit, whose queue stalls on our plan.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building on EAS (production profile, build number auto-increments)…"
json=$(npx --yes eas-cli@latest build --platform ios --profile production --non-interactive --json)

url=$(printf '%s' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)[0]["artifacts"]["buildUrl"])')
ver=$(printf '%s' "$json" | python3 -c 'import json,sys; b=json.load(sys.stdin)[0]; print(f"{b[\"appVersion\"]}-{b[\"appBuildVersion\"]}")')

out="$HOME/Downloads/Sentinel-$ver.ipa"
echo "Downloading $out"
curl -fsSL -o "$out" "$url"

if [ -d /Applications/Transporter.app ]; then
  open -a Transporter "$out"
  echo "Opened in Transporter — click Deliver."
else
  echo "Transporter not found; install it from the Mac App Store and drag in $out"
fi
