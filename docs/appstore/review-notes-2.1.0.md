# App Store Review Notes — BotConnector 2.1.0 (build 128)

## What changed in 2.1.0

BotConnector iOS is now a standalone **bring-your-own-key (BYOK)** AI chat client.
The previous build (2.0.0) required a BotConnector account to reach paid AI
services; Guideline 3.1.1 was cited for that gate. In 2.1.0:

- There is **no BotConnector account, no login, no balance, no credits, no
  subscription and no in-app purchase**. Nothing in the app is sold, and the
  app does not access any subscription or credits that BotConnector sells
  elsewhere: no preset, link or sign-in leads to one.
- The app has **no payment surface at all**: no checkout, no Stripe, no
  external purchase link.
- The user configures their own AI provider (OpenAI, Anthropic, Google Gemini,
  DeepSeek, OpenRouter, xAI, Mistral, or a custom OpenAI-compatible endpoint)
  with **their own API key**, and the app talks **directly from the device to
  that provider's endpoint**. BotConnector does not proxy, store, or bill any
  of this traffic.
- Before the first provider is saved, the app shows a disclosure that messages
  and attachments are sent from the device to that provider, and requires the
  user to tick an agreement.
- API keys are stored **only in the iOS Keychain** on the device
  (`react-native-keychain`). They are never written to logs, analytics, or
  crash reports. Removing a provider deletes its key from the Keychain.
- Existing local chat history (stored on device) is preserved across the
  update. On first launch after updating, the app removes only the
  automatically created BotConnector Cloud server entry that was tied to the
  removed account, and clears the two OAuth Keychain entries. Servers the user
  added manually are kept.

## Region change (Guideline 5, China)

China mainland has been **removed from App Store distribution** in App Store
Connect (Availability), so this version is not offered in China mainland. The
metadata references to ChatGPT/OpenAI/GPT therefore apply only to storefronts
outside China, where the app lets people connect providers they already use.
No change is required from the reviewer.

## Steps for the reviewer

1. Launch the app and skip the intro (the intro only explains local vs remote
   models; it can be skipped at any point).
2. Open **Settings → Providers**.
3. Tap **Add provider**.
4. Choose **OpenAI**.
5. Paste the limited test key: `[LIMITED-TEST-API-KEY]`
   (a real, rate-limited key is supplied with the submission; it is never part
   of the repository).
6. Tap **Test connection**. The app fetches the model list from the provider
   and shows how many models were found.
7. Select at least one model, tick the data-sharing agreement, then tap
   **Save provider**.
8. Close Settings, open the model picker in the chat header and choose the
   saved model.
9. Send `Hello` in the chat. The answer streams from OpenAI.

You may also verify the error path: paste an obviously invalid key, tap
**Test connection**, and the app shows an actionable, in-app error
("Invalid or missing API key" style) instead of a generic failure banner. An
empty model list after a successful connection shows guidance text, not an
error.

## Notes for the reviewer

- No demo account is needed, because there is no account system.
- Local (on-device) models can be downloaded inside the app if you prefer not
  to use a remote provider key: **Models → download a model → select it in
  chat**. No network credential is required for that path.
- The limited test key is scoped to the review period and can be rotated by us
  at any time without an app update.
