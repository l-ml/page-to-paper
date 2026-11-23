# Page to Paper

Page to Paper is an iOS Safari web extension in the style of Safari Reader. From the toolbar it reads the current page, builds an EPUB, and hands that file to a mock upload. Nothing is sent to a reMarkable.

> **Unofficial API.** Page to Paper is not affiliated with reMarkable. A real upload would use reMarkable’s unofficial Cloud API, which can change or be withdrawn without notice. This repository does not call that API. There is no reMarkable host, no ATS exception, and no network request for a device token. Pairing stores an 8-character code in the Keychain as a stand-in token. The upload transport is a mock. A real transport is a separate follow-up and is not approved.

v1 is the Safari extension only. There is no Share Sheet and no folder picker. The intended distribution is TestFlight, and nothing in this repo submits a build.

## What this build does

The send path runs against a mock. It does not open a connection.

1. The popup injects a reader into the active tab, then reads the page title and host. It does not upload on open. Pages that refuse injection show an error.
2. The confirm screen shows Destination Inbox, Format EPUB, and Send. If the app is not paired, the button is Pair device. If the device is offline, Send is disabled.
3. Send builds an EPUB and passes it to `MockUploadTransport` with an idempotency key. The popup says "Test mode: nothing was uploaded to your reMarkable." It shows Sent only when a result says `implemented: true` and `mock` is not true.
4. Done closes the popup. A real success also closes after about 1.2 seconds. A mock success stays until Done, so the test-mode line can be read.
5. Pair device, Re-pair, and Open app set `window.location.href` to `pagetopaper://pair`. The containing app opens Pairing from that URL.

A valid paired send gets `ok: true`, `implemented: false`, and `mock: true`. The document id starts with `mock-`. A bad message gets `ok: false`. An unpaired send is refused with `notPaired`. Pairing and page reads give up after 10 seconds. A send waits 25 seconds so the app’s 20 second transport timeout can come back as `errorKind: timeout`.

The reader still sends the title, host, and byline. The EPUB is that title, the byline, and the source URL. If a draft also includes HTML, that HTML is turned into XHTML with scripts, styles, frames, and external resources removed.

The mock remembers idempotency keys in memory for the life of the extension process. Safari can kill that process, so a replay after that is best-effort. Retry of the same failed or timed-out send reuses the key. If that key was already recorded, the mock returns the original document id instead of creating another. A new Send, including one after success, gets a new key.

In a DEBUG build, the App Group preference `mockUploadFault` can be `slow` or `fail`. The suite is `group.com.example.pagetopaper`. Any other value, and every Release build, leaves the mock instant and successful. `slow` records one document, then waits longer than the 20 second timeout. Retry returns that same document. `fail` rejects and records nothing.

JavaScript never holds tokens. Preferences go in an App Group `UserDefaults` suite. Secrets, when pairing exists, go in a shared Keychain access group. The containing app cannot push work into the extension; the extension always starts the native call.

## Layout

```
src/                         TypeScript: popup, content script, background, message checks
PageToPaper/App/             SwiftUI app: Onboarding, Pairing, Settings
PageToPaper/Extension/       Safari web extension and SafariWebExtensionHandler
PageToPaper/Extension/Resources/   manifest, popup, and esbuild output
PageToPaper/Shared/          Swift compiled into both targets
PageToPaper.xcodeproj        Checked-in Xcode project
docs/                        Manual QA checklist and TestFlight distribution notes
```

Shared Swift types are `AppPreferences`, `ArticleDraft`, `ArticleConverter`, `ExtensionMessageRouter`, `PairingCode`, `RemarkableAuth`, `RemarkableCloudClient`, `TokenStore`, and `UploadResult`. `TokenStore` keeps the pairing stand-in in the Keychain. The mock upload does not read it. `ArticleConverter.makeEpub` builds an EPUB 3 archive. `RemarkableCloudClient` sends it through `UploadTransport`. The default transport is `MockUploadTransport`.

## Placeholder identifiers

These must be replaced before you sign or ship a build. They are not registered to this project.

Xcode expands `$(AppIdentifierPrefix)` and `$(DEVELOPMENT_TEAM)` before the app runs. With no development team those values become empty or the bare suffix `com.example.pagetopaper.shared`, not the literal `$(...)` text. A Debug simulator build then omits the access group and uses the keychain default, logs that once, and does not assert. Both targets list the same group in their entitlements, so that default is the shared slot on the simulator. A Release build and any device build still refuse the write, and a device Debug build also asserts, so a signed build cannot silently keep two keychains. When a team is set, pairing is stored in `TeamID.com.example.pagetopaper.shared`. Connected is shown only after that write is read back unchanged. Preferences never fall back to `UserDefaults.standard` if the App Group suite cannot be opened. In DEBUG the app shows that failure; otherwise onboarding is simply not recorded.

| Use | Value |
| --- | --- |
| App bundle id | `com.example.pagetopaper` |
| Extension bundle id | `com.example.pagetopaper.extension` |
| App Group | `group.com.example.pagetopaper` |
| Keychain access group | `$(AppIdentifierPrefix)com.example.pagetopaper.shared` |

Signing is Automatic, and no development team is set. Select a team in Xcode after replacing the identifiers. The embedded extension is copied with Code Sign On Copy, which is what a device or TestFlight build needs.

## Requirements

- Node.js 22 or newer, for the extension scripts (`.nvmrc` pins 22; `import.meta.dirname` and Vitest 5 are not supported on Node 18)
- Xcode 15 or newer, for the iOS app
- iOS 15.4 or newer

Manifest V3 service workers need Safari 15.4, so the deployment target is 15.4 rather than 15.0. The app is iPhone and iPad. There is no macOS target.

## Build the extension scripts

`npm run build` compiles `src/*.ts` with esbuild and writes classic scripts into `PageToPaper/Extension/Resources/`. Those JavaScript files are checked in so Xcode can copy them without Node. Run the build again after changing TypeScript.

```bash
npm install
npm run typecheck
npm run build
npm test
```

`npm test` runs the Vitest checks for message shape, the popup-to-native flow, the manifest, and the Xcode project structure.

## Build the iOS app

On a Mac, after the identifiers and team are set:

```bash
xcodebuild \
  -project PageToPaper.xcodeproj \
  -scheme PageToPaper \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  build
```

**Xcode Simulator build verified** on macOS (`Xcode 27.2`) for both `Debug` and `Release` configurations (`CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO`). Physical device signing and real reMarkable Cloud tests still require setting your team and replacing placeholders per [docs/TESTFLIGHT.md](docs/TESTFLIGHT.md).

The checked-in project is the file Xcode opens. After adding or removing a Swift or resource file, regenerate it with `node scripts/generate-xcodeproj.mjs` and run `node scripts/validate-xcodeproj.mjs`.

## QA & Distribution

- [Manual QA checklist](docs/QA_CHECKLIST.md) for testing on real iOS Safari and reMarkable hardware
- [TestFlight & distribution notes](docs/TESTFLIGHT.md) for identifier replacement, archiving, and beta disclosure copy

## Message contract

Extension JavaScript and the native handler share one shape. No token fields are allowed.

| Step | Body |
| --- | --- |
| Popup to the active tab | inject `content.js`, then `{ "type": "extractArticle" }` |
| Content script to popup | `{ "type": "articleDraft", "title", "url", "byline"? }` |
| Popup to the app, before Send | `{ "type": "pairingStatus" }` |
| App to the popup | `{ "paired": true/false }` |
| Popup to the app, after Send | `{ "type": "uploadArticle", "idempotencyKey", "draft": { "title", "url", "html"?, "byline"? } }` |
| App to the popup | `{ "ok", "message", "implemented", "mock"?, "documentId"?, "errorKind"? }` |

The pairing code is 8 letters or digits from `https://my.remarkable.com/device/browser/connect`. The app trims it, lowercases it, and strips spaces and hyphens before checking `^[a-z0-9]{8}$`. Pair stays disabled until that matches. The app does not call the site.

The native call uses `browser.runtime.sendNativeMessage("application", message)`. Safari routes that to this extension’s handler. `"application"` is not a bundle id and not a secret.

Permissions:

- `activeTab`: read only the tab that was active when the popup opened.
- `scripting`: inject `content.js` into that tab. There is no `content_scripts` entry and no host permission.
- `nativeMessaging`: the service worker calls the containing app.

## License

MIT. See [LICENSE](LICENSE).
