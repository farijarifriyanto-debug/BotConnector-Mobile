# BotConnector Mobile

Official mobile client foundation for BotConnector on Android and iOS.

This repository is a branded fork of PocketPal AI:
https://github.com/a-ghorbani/pocketpal-ai

The current pass is intentionally branding-only. PocketPal application behavior and internal native target names are kept stable while user-facing identity and store identifiers are replaced.

## Brand identity

- App name: BotConnector
- Android application ID: id.botconnector.app
- iOS App Store bundle ID: id.botconnector.app
- iOS free-device Debug bundle ID: id.botconnector.app.dev
- Deep link scheme: botconnector://
- Website: https://botconnector.id

## Scope

Model execution, local inference, PalsHub integration, data storage, networking, and other product behavior are not intentionally changed by this branch.

The internal React Native/Xcode target remains named PocketPal for compatibility with the upstream build structure.

## Open-source attribution

PocketPal AI is Copyright (c) 2024 Asghar Ghorbani and is licensed under the MIT License. The original license remains in LICENSE.

BotConnector-specific branding and modifications are maintained in this fork.

## Free iPhone testing

For installing a Debug build on your own iPhone with an Apple Personal Team, see [docs/ios-personal-team-testing.md](docs/ios-personal-team-testing.md). The free-test bundle ID is separate from the App Store bundle ID.
