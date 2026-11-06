# Kelivo parity matrix — BotConnector iOS 2.1.0 (BYOK)

Reference: Kelivo (Flutter, AGPL) local fork at
`C:\Users\farij\Projects\botconnector-chat-flutter`, read on 2026-11-06.
Files cited are inside that fork.

Scope authority: `docs/superpowers/specs/2026-11-05-ios-byok-2.1.0-design.md`
(APPROVED). The spec narrows the reference to the BYOK essentials: provider
list, add/edit/remove, key → model list → pick → chat. It does not import
Kelivo's grouping, import/export, sharing, or model-catalog screens.

| Behaviour (reference) | Our implementation | Evidence | Status |
|---|---|---|---|
| Settings → Providers lists the providers the user configured (`features/provider/pages/providers_page.dart`) | Settings card "Providers" listing `byokProviderStore.providers` with label + model count, top of Settings (where the Cloud account card used to be) | `src/components/ProvidersSection/__tests__/ProvidersSection.test.tsx` (4/4) | ADAPTASI TANPA UBAH ALUR — grouping/search/import/share omitted per spec |
| Tapping a provider opens its detail for edit and removal (`provider_detail_page.dart`) | Row opens `AddProviderSheet` primed with `initialProviderId`; the sheet shows **Remove provider** for a configured provider | `AddProviderSheet.test.tsx` + `ProvidersSection.test.tsx` ("opens the sheet for the tapped provider") | MATCH |
| Add flow: choose preset → enter key → test → pick models → save (`widgets/add_provider_sheet.dart`) | Same order: provider radio list → API key (Keychain-backed) → **Test connection** → model checkboxes → **Save provider** | `AddProviderSheet.test.tsx` | MATCH |
| Empty model list is guidance, not an error (`providerDetailPageNoModelsTitle` / `NoModelsSubtitle`) | `modelPicker.noModelsGuidance` in the picker; `addProvider.noModels` inside the sheet after a successful fetch | `ChatPalModelPickerSheet.addProvider.test.tsx` ("shows no-models guidance instead of a generic error") | ADAPTASI — wording localised, same intent (Review Focus #5) |
| No add-provider entry inside the chat model picker (Kelivo reaches it only from Providers) | A row at the top of the models tab opens the same sheet | `ChatPalModelPickerSheet.addProvider.test.tsx` (3/3) | CUSTOM (additive) — mandated by the spec ("first-class entry in the picker"); isolated, one row, no new flow |
| "Provider added" snackbar after saving | Sheet closes; the new provider appears in the list | — | DIFF (deferred minor) — no snackbar infrastructure on this screen |
| Provider groups, search, import/share, model catalog, balance badges | Not implemented | — | OUT OF SCOPE — the spec does not include them; this screen did not exist before 2.1.0, so nothing regressed |

## Verification limits

- Unit/behaviour tests only. The flow has **not** been exercised on a real
  device (TestFlight build 124 pending) and not in an iOS simulator here. Until
  the owner runs the device matrix: **BELUM TERVERIFIKASI**.
- The reference was read from source, not run interactively on this machine.
