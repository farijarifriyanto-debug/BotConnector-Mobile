# BotConnector iOS release via Codemagic

The source repository can be built without a local Mac by using the root `codemagic.yaml`.

## App identity

- Display name: BotConnector
- Bundle ID: `id.botconnector.app`
- Xcode workspace: `ios/PocketPal.xcworkspace`
- Xcode scheme: `PocketPal`

The workspace/scheme keep the upstream internal name. This is intentional and does not affect the App Store identity.

## Codemagic environment group

Create an encrypted environment group named `botconnector_ios` with:

- `APP_STORE_CONNECT_ISSUER_ID`
- `APP_STORE_CONNECT_KEY_IDENTIFIER`
- `APP_STORE_CONNECT_PRIVATE_KEY`
- `GOOGLE_SERVICES_PLIST_B64`
- `GOOGLE_WEB_CLIENT_ID`

Generate `GOOGLE_SERVICES_PLIST_B64` locally from the production iOS Firebase plist:

```bash
base64 < GoogleService-Info.plist | tr -d '\n'
```

Do not commit the plist, API private key, certificates, or generated `ios/Config/Env.xcconfig`.

## First build

1. Connect the GitHub repository in Codemagic.
2. Add the `botconnector_ios` environment group.
3. Select workflow **BotConnector iOS TestFlight**.
4. Run the workflow.
5. The workflow fetches/creates App Store signing files for `id.botconnector.app`, builds a signed IPA, and uploads it to TestFlight.

Before each release, `scripts/release-preflight.sh` verifies the public app identity and that secret iOS files are not tracked.
