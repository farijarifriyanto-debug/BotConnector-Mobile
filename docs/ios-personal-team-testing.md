# Free iPhone testing with an Apple Personal Team

This setup is for installing a **Debug** build of BotConnector on your own iPhone before joining the paid Apple Developer Program.

## What is already configured

- Debug bundle ID: `id.botconnector.app.dev`
- Release/App Store bundle ID: `id.botconnector.app`
- Debug signing style: Automatic
- Debug has no PocketPal provisioning profile or PocketPal Team ID
- Release signing settings are left unchanged for the future App Store setup

The Debug build intentionally does not request the App Store-specific Siri, increased-memory, or extended-virtual-addressing entitlements. This keeps free Personal Team signing simpler. Cloud chat, BotConnector API, BotConnector Local/remote connections, web search, secure API-key storage, UI, and normal chat flows remain suitable for device testing. Large on-device local models and Siri should be validated again with the final paid signing setup.

## On the Mac

1. Install Xcode and sign in with your normal Apple ID: `Xcode > Settings > Accounts`.

2. Clone this repository and install JavaScript dependencies:

   ```bash
   yarn install --frozen-lockfile
   ```

3. Use Ruby 3.2.3, then install the iOS pods:

   ```bash
   bundle install
   cd ios
   bundle exec pod install
   cd ..
   ```

4. Open the workspace, not the `.xcodeproj` file:

   ```bash
   open ios/PocketPal.xcworkspace
   ```

5. Connect the iPhone to the Mac and select it as the run destination.

6. In Xcode select the **PocketPal** target, then **Signing & Capabilities**:
   - Configuration: Debug
   - Automatically manage signing: ON
   - Team: choose your **Personal Team**
   - Bundle Identifier should show `id.botconnector.app.dev`

7. Press **Run**.

If iOS asks you to trust Developer Mode or the developer certificate, follow the prompt shown by the iPhone/Xcode.

## Important

Do not change the Release bundle ID while testing for free. The final App Store identifier remains `id.botconnector.app`.

A Personal Team development build is only for testing on devices associated with that Apple ID. It is not an App Store or TestFlight distribution build.
