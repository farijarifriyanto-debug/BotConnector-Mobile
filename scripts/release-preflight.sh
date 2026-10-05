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

grep -q 'PRODUCT_BUNDLE_IDENTIFIER = id.botconnector.app;' ios/PocketPal.xcodeproj/project.pbxproj   || fail "iOS bundle identifier is not id.botconnector.app"

grep -q 'applicationId "id.botconnector.app"' android/app/build.gradle   || fail "Android applicationId is not id.botconnector.app"

if grep -Rqs --exclude-dir=.git --exclude-dir=node_modules 'pocketpal://app'   app.json .env.example ios android src; then
  fail "stale pocketpal://app URL remains"
fi

if git ls-files --error-unmatch ios/GoogleService-Info.plist >/dev/null 2>&1; then
  fail "GoogleService-Info.plist must not be tracked"
fi

if git ls-files --error-unmatch ios/Config/Env.xcconfig >/dev/null 2>&1; then
  fail "ios/Config/Env.xcconfig must not be tracked"
fi

echo "release-preflight: PASS"
echo "  app: BotConnector"
echo "  bundle id: id.botconnector.app"
echo "  workspace: ios/PocketPal.xcworkspace"
echo "  scheme: PocketPal"
