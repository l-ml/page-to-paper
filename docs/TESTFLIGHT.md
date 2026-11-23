# TestFlight & Distribution Notes

**Page to Paper** v1 is distributed **via TestFlight only** (no public App Store release in v1).

> **Unofficial API disclosure (required).** Page to Paper is not affiliated with reMarkable AS. Any real upload path relies on reMarkable’s unofficial Cloud API, which is undocumented and can break or be withdrawn without notice. Current builds in this repo run against `MockUploadTransport` with no network calls until the open spikes in [SPIKES.md](../SPIKES.md) are resolved.

---

## 1. Pre-Archive Identifier & Signing Checklist

The checked-in repository uses placeholder identifiers and an empty development team so anyone can inspect or simulate-build without private credentials. **Replace all placeholders locally (and do not commit your personal Team ID or bundle IDs):**

| Purpose | Placeholder in Repo | Files to Update Before Signing |
| --- | --- | --- |
| App Bundle ID | `com.example.pagetopaper` | `PageToPaper.xcodeproj` (`PageToPaper` target `PRODUCT_BUNDLE_IDENTIFIER`) |
| Extension Bundle ID | `com.example.pagetopaper.extension` | `PageToPaper.xcodeproj` (`PageToPaperExtension` target `PRODUCT_BUNDLE_IDENTIFIER` — must remain `<AppBundleID>.extension`) |
| Development Team | *(unset)* | `PageToPaper.xcodeproj` (`DEVELOPMENT_TEAM` on both targets, Debug + Release) |
| App Group | `group.com.example.pagetopaper` | `PageToPaper/App/PageToPaper.entitlements`, `PageToPaper/Extension/PageToPaperExtension.entitlements`, `AppPreferences.appGroupID` in `PageToPaper/Shared/AppPreferences.swift` |
| Keychain Access Group | `$(AppIdentifierPrefix)com.example.pagetopaper.shared` | Both `.entitlements` files, `PageToPaperKeychainAccessGroup` in both `Info.plist` files, and `KeychainSharing.sharedSuffix` in `PageToPaper/Shared/AppPreferences.swift` |
| URL Type Identifier | `com.example.pagetopaper` | `CFBundleURLName` in `PageToPaper/App/Info.plist` (keep `CFBundleURLSchemes` as `pagetopaper`) |
| OSLog Subsystems | `com.example.pagetopaper` | `AppPreferences.swift`, `TokenStore.swift`, `RemarkableCloudClient.swift`, `SafariWebExtensionHandler.swift` |

Also verify in Xcode Signing & Capabilities:
1. Automatic signing is enabled (or matching App Store / Ad-Hoc provisioning profiles include **App Groups** and **Keychain Sharing** for both targets).
2. In `PageToPaper` target **Build Phases → Embed Foundation Extensions**, `PageToPaperExtension.appex` has **Code Sign On Copy** and **Remove Headers On Copy** checked.

---

## 2. Build & Archive Procedure

1. **Rebuild extension JS and run automated checks:**
   ```bash
   npm ci
   npm run typecheck
   npm run build
   npm test
   python3 scripts/validate_plists.py
   node scripts/validate-xcodeproj.mjs
   ```
   Confirm `git status` shows no stale uncommitted extension scripts under `PageToPaper/Extension/Resources/`.

2. **Bump version / build number:**
   - Update `MARKETING_VERSION` (e.g. `0.1.0`) and increment `CURRENT_PROJECT_VERSION` (e.g. `2`) on both `PageToPaper` and `PageToPaperExtension` targets so both bundles stay aligned.

3. **Archive in Release configuration:**
   - Select **Any iOS Device (arm64)** as destination.
   - Run **Product → Archive** using the **PageToPaper** scheme (which archives in **Release** configuration).
   - **Release behavior checks:**
     - `#if DEBUG` Developer controls (`Mock upload fault`, `Reset onboarding`, placeholder warnings) are automatically stripped in Release.
     - `MockUploadFault.current()` always returns `.off` in Release.
     - `TokenStore` strictly requires the resolved shared Keychain Access Group and will refuse unshared storage rather than silently diverging between app and extension.

4. **Upload to App Store Connect:**
   - Distribute via **Xcode Organizer → Distribute App → TestFlight & App Store** (or **TestFlight Internal Only** for team-only testing).

---

## 3. App Store Connect & Compliance Metadata

- **Export Compliance:**
  - Current mock build makes zero network calls.
  - Once HTTPS Cloud upload (`URLSession` to TLS endpoints) ships, declare standard HTTPS encryption usage (or add `ITSAppUsesNonExemptEncryption = NO` to `PageToPaper/App/Info.plist` if only OS-provided standard TLS applies, per Apple export compliance rules).
- **Privacy Manifests (`PrivacyInfo.xcprivacy`):**
  - Both targets include `PrivacyInfo.xcprivacy` declaring `NSPrivacyTracking = false`, no collected data types, and `NSPrivacyAccessedAPICategoryUserDefaults` with reason `CA92.1` (App Group `UserDefaults` shared between the containing app and its extension).
- **Beta App Review Notes (if submitting to external testers):**
  - Explain how to enable the Safari Web Extension: **Settings → Safari → Extensions → Page to Paper**, then open any `https://` article in Safari and tap the **Page to Paper** toolbar button.
  - Note clearly if the submitted TestFlight build is currently running in **local test mode** (`MockUploadTransport`, where no actual upload leaves the device and pairing accepts any 8-character code locally).

---

## 4. TestFlight "What to Test" Copy (External / Internal Testers)

Use this disclosure text in TestFlight **Test Information / What to Test** (adjusting the test-mode line once real upload replaces `MockUploadTransport`):

> **Page to Paper (TestFlight Beta)**
>
> Page to Paper is an iOS Safari Web Extension that extracts the article you are reading and prepares a clean EPUB for your reMarkable Inbox.
>
> **How to test**
> 1. Open **Settings → Safari → Extensions** and turn on **Page to Paper**.
> 2. Open the Page to Paper app and pair with an 8-character code.
> 3. Open an article in Safari, tap **Page to Paper** in the toolbar, allow access for the site, and tap **Send**.
>
> **Important disclosure**
> - Page to Paper is an independent open-source project and is **not affiliated with or endorsed by reMarkable AS**.
> - Real Cloud upload uses reMarkable’s **unofficial Cloud API**, which is undocumented and may change or stop working without notice.
> - *(Current mock build)* Uploads in this beta currently run locally in **Test mode** (`MockUploadTransport`): EPUBs are generated on-device, and nothing is transmitted over the network yet.
> - Known v1 scope: iOS Safari Web Extension only, EPUB format only, default Inbox destination (no Share Sheet, PDF capture, or folder picker in v1).

---

## 5. Known v1 Limitations

- Safari Web Extension on iOS 15.4+ only (no Share Sheet / Action Extension, no macOS Safari target).
- EPUB 3 only; embedded images degrade to `alt` text (`activeTab` cross-origin image fetch spike in [SPIKES.md](../SPIKES.md) remains open).
- Always targets default Inbox/root (no folder picker).
- Paywalled, canvas-rendered, or strictly JS-gated pages may fall back to title + byline + source URL without article body HTML.
- Please verify every TestFlight candidate against [docs/QA_CHECKLIST.md](QA_CHECKLIST.md).
