# BotConnector iOS release via Codemagic

The repository can be built and distributed without a local Mac by using the root `codemagic.yaml`.

## App identity

- Display name: BotConnector
- Bundle ID: `id.botconnector.app`
- Public release version: `1.0`
- Xcode workspace: `ios/PocketPal.xcworkspace`
- Xcode scheme: `PocketPal`
- Apple Team ID: `7DD999P944`

The workspace/scheme keep the upstream internal name intentionally. Public artifacts use `BotConnector.app`.

## Apple signing

Codemagic uses the **BotConnector Codemagic** App Store Connect integration plus the App Store provisioning profile for `id.botconnector.app`. Do not commit Apple private keys, provisioning profiles, certificates, or generated signing files.

## Google/Firebase

Firebase/PalsHub integrations are optional for the first BotConnector release.

- If `GOOGLE_SERVICES_PLIST_B64` and `GOOGLE_WEB_CLIENT_ID` are supplied in Codemagic, the production Google configuration is bundled.
- If they are absent, CI creates a placeholder plist only so native build settings remain valid. `AppDelegate` detects `PROJECT_ID=botconnector-ci` and deliberately skips Firebase initialization.
- Never commit `ios/GoogleService-Info.plist` or `ios/Config/Env.xcconfig`.

## Simulator smoke

Use workflow **BotConnector iOS Simulator Smoke** when only a compile smoke test is needed. It is unsigned and uses CI placeholders.

## TestFlight / App Store Connect

Use workflow **BotConnector iOS TestFlight** for signed builds. It:

1. runs `scripts/release-preflight.sh`;
2. installs JS/Ruby/CocoaPods dependencies;
3. creates optional Google/Firebase environment files;
4. applies App Store signing;
5. assigns the Codemagic build number;
6. builds `BotConnector.ipa`;
7. uploads the IPA to App Store Connect.

The workflow intentionally does **not** auto-submit to external TestFlight beta review. Uploading is enough for App Store Connect/TestFlight processing and internal testing. External beta review should be submitted only after Beta App Information and Beta App Review contact fields are complete.

The release preflight also guards version 1.0, export-compliance declaration, store-facing branding, AppIcon completeness, and hidden external PalsHub checkout.
