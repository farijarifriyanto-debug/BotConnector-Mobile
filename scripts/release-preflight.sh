#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

fail() {
  echo "release-preflight: $*" >&2
  exit 1
}

[ -f app.json ] || fail "app.json missing"
[ -f ios/PocketPal/Info.plist ] || fail "iOS Info.plist missing"
[ -f ios/PocketPal.xcodeproj/project.pbxproj ] || fail "iOS Xcode project missing"
[ -d ios/PocketPal.xcworkspace ] || fail "iOS workspace missing"
[ -f ios/Podfile ] || fail "iOS Podfile missing"
[ -f yarn.lock ] || fail "yarn.lock missing"

grep -q '"displayName": "BotConnector"' app.json   || fail "displayName is not BotConnector"

grep -q '<string>BotConnector</string>' ios/PocketPal/Info.plist   || fail "CFBundleDisplayName is not BotConnector"

grep -q 'PRODUCT_BUNDLE_IDENTIFIER = id.botconnector.app;' ios/PocketPal.xcodeproj/project.pbxproj \
  || fail "iOS bundle identifier is not id.botconnector.app"

grep -q '7DD999P944' ios/PocketPal.xcodeproj/project.pbxproj \
  || fail "iOS Apple Team ID is not configured"

if grep -q 'MYXGXY23Y6' ios/PocketPal.xcodeproj/project.pbxproj; then
  fail "stale upstream Apple Team ID remains in Xcode project"
fi

if grep -q 'PROVISIONING_PROFILE_SPECIFIER.*match ' ios/PocketPal.xcodeproj/project.pbxproj; then
  fail "stale Fastlane match provisioning profile remains in Xcode project"
fi

grep -q 'PRODUCT_NAME = BotConnector;' ios/PocketPal.xcodeproj/project.pbxproj \
  || fail "iOS product name is not BotConnector"

grep -q 'BuildableName = "BotConnector.app"' ios/PocketPal.xcodeproj/xcshareddata/xcschemes/PocketPal.xcscheme \
  || fail "iOS scheme still points at PocketPal.app"

grep -q '<key>NSMicrophoneUsageDescription</key>' ios/PocketPal/Info.plist \
  || fail "iOS microphone usage description missing"

grep -q '<key>NSSpeechRecognitionUsageDescription</key>' ios/PocketPal/Info.plist \
  || fail "iOS speech recognition usage description missing"

grep -q 'applicationId "id.botconnector.app"' android/app/build.gradle \
  || fail "Android applicationId is not id.botconnector.app"

grep -q 'android.permission.RECORD_AUDIO' android/app/src/main/AndroidManifest.xml \
  || fail "Android RECORD_AUDIO permission missing"

if grep -Rqs --exclude-dir=.git --exclude-dir=node_modules 'pocketpal://app'   app.json .env.example ios android src; then
  fail "stale pocketpal://app URL remains"
fi

if git ls-files --error-unmatch ios/GoogleService-Info.plist >/dev/null 2>&1; then
  fail "GoogleService-Info.plist must not be tracked"
fi

if git ls-files --error-unmatch ios/Config/Env.xcconfig >/dev/null 2>&1; then
  fail "ios/Config/Env.xcconfig must not be tracked"
fi

grep -q 'MARKETING_VERSION = 1.0;' ios/PocketPal.xcodeproj/project.pbxproj \
  || fail "iOS marketing version is not aligned with App Store version 1.0"

grep -q '<key>ITSAppUsesNonExemptEncryption</key>' ios/PocketPal/Info.plist \
  || fail "iOS export compliance declaration missing"

python3 - <<'PY' || exit 1
import plistlib
from pathlib import Path
p = Path("ios/PocketPal/Info.plist")
info = plistlib.loads(p.read_bytes())
if info.get("ITSAppUsesNonExemptEncryption") is not False:
    raise SystemExit("release-preflight: ITSAppUsesNonExemptEncryption must be false")
PY

if grep -q 'LLM Ventures' ios/PocketPal/LaunchScreen.storyboard; then
  fail "stale upstream launch-screen branding remains"
fi

grep -q 'text="botconnector.id"' ios/PocketPal/LaunchScreen.storyboard \
  || fail "BotConnector launch-screen footer missing"

if grep -q 'navigate(ROUTES.PALS)' src/components/SidebarContent/SidebarContent.tsx; then
  fail "PalsHub marketplace is still exposed in the main sidebar"
fi

grep -q 'EXTERNAL_PALSHUB_CHECKOUT_ENABLED = false' src/components/PalsHub/PalDetailSheet/PalDetailSheet.tsx \
  || fail "external PalsHub checkout must stay disabled for store release"

if grep -Rq --include='*.swift' -E '"Ask Pal"|"Open Pal Chat"' ios/PocketPal/AppIntents; then
  fail "stale Siri/App Shortcuts branding remains"
fi

python3 - <<'PY' || exit 1
import json
from pathlib import Path
root = Path("ios/PocketPal/Images.xcassets/AppIcon.appiconset")
data = json.loads((root / "Contents.json").read_text())
missing = [
    entry for entry in data.get("images", [])
    if not entry.get("filename") or not (root / entry["filename"]).is_file()
]
if missing:
    raise SystemExit(f"release-preflight: AppIcon catalog has missing files: {missing}")
if not (root / "App_store_1024_1x.png").is_file():
    raise SystemExit("release-preflight: 1024x1024 App Store icon missing")
PY

echo "release-preflight: PASS"
echo "  app: BotConnector"
echo "  bundle id: id.botconnector.app"
echo "  product: BotConnector.app"
echo "  workspace: ios/PocketPal.xcworkspace"
echo "  scheme: PocketPal (internal)"
