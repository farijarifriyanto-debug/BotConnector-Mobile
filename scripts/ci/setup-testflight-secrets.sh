#!/usr/bin/env bash
# Helper script to configure GitHub Actions secrets for iOS TestFlight using gh CLI
set -euo pipefail

REPO="farijarifriyanto-debug/BotConnector-Mobile"

echo "=== Setup GitHub Actions Secrets for iOS TestFlight ==="
echo "Target Repository: $REPO"
echo ""

# Default known IDs from App Store Connect configuration
DEFAULT_KEY_ID="V5BH58HKB7"
DEFAULT_ISSUER_ID="6739aeaa-bae4-4779-9d8c-ae00213e33d9"

# 1. Key ID
read -r -p "App Store Connect API Key ID [$DEFAULT_KEY_ID]: " KEY_ID
KEY_ID="${KEY_ID:-$DEFAULT_KEY_ID}"
gh secret set APP_STORE_CONNECT_API_KEY_ID --repo "$REPO" --body "$KEY_ID"
echo "  ✓ APP_STORE_CONNECT_API_KEY_ID set"

# 2. Issuer ID
read -r -p "App Store Connect Issuer ID [$DEFAULT_ISSUER_ID]: " ISSUER_ID
ISSUER_ID="${ISSUER_ID:-$DEFAULT_ISSUER_ID}"
gh secret set APP_STORE_CONNECT_API_ISSUER_ID --repo "$REPO" --body "$ISSUER_ID"
echo "  ✓ APP_STORE_CONNECT_API_ISSUER_ID set"

# 3. AuthKey .p8 file
read -r -p "Path to AuthKey_${KEY_ID}.p8 file: " P8_PATH
if [ -f "$P8_PATH" ]; then
  gh secret set APP_STORE_CONNECT_API_KEY_CONTENT --repo "$REPO" < "$P8_PATH"
  echo "  ✓ APP_STORE_CONNECT_API_KEY_CONTENT set from $P8_PATH"
else
  echo "  ⚠️ File $P8_PATH not found. Skipping APP_STORE_CONNECT_API_KEY_CONTENT."
fi

# 4. Distribution Certificate .p12
read -r -p "Path to Apple Distribution .p12 file: " P12_PATH
if [ -f "$P12_PATH" ]; then
  base64 < "$P12_PATH" | tr -d '\n' | gh secret set APPLE_CERTIFICATE_BASE64 --repo "$REPO"
  echo "  ✓ APPLE_CERTIFICATE_BASE64 set"
  read -r -s -p "Password for .p12 certificate: " P12_PASS
  echo ""
  gh secret set APPLE_CERTIFICATE_PASSWORD --repo "$REPO" --body "$P12_PASS"
  echo "  ✓ APPLE_CERTIFICATE_PASSWORD set"
else
  echo "  ⚠️ File $P12_PATH not found. Skipping certificate."
fi

# 5. Provisioning Profile (optional)
read -r -p "Path to .mobileprovision file (optional, press Enter to skip): " PROV_PATH
if [ -n "$PROV_PATH" ] && [ -f "$PROV_PATH" ]; then
  base64 < "$PROV_PATH" | tr -d '\n' | gh secret set APPLE_PROVISIONING_PROFILE_BASE64 --repo "$REPO"
  echo "  ✓ APPLE_PROVISIONING_PROFILE_BASE64 set"
fi

echo ""
echo "Secrets configuration completed for $REPO!"
