# Page to Paper

Page to Paper is an iOS Safari web extension in the style of Safari Reader. From the toolbar it reads the current page and, in a later version, will build an EPUB and upload it to the reMarkable Cloud Inbox.

> **Unofficial API.** Page to Paper is not affiliated with reMarkable. Uploading would use reMarkable’s unofficial Cloud API, which can change or be withdrawn without notice. This repository is a scaffold: it does not call that API, does not pair an account, and does not build an EPUB.

v1 is the Safari extension only. There is no Share Sheet and no folder picker. The intended distribution is TestFlight, and nothing in this repo submits a build.

## What the scaffold does

The happy path is wired, and every network and file step is a stub.

1. The popup asks the content script for the page title, URL, and an optional byline.
2. The popup checks that shape and calls `browser.runtime.sendNativeMessage`.
3. `SafariWebExtensionHandler` returns an `UploadResult`.
4. The popup shows success or failure.

A valid article gets `ok: true` with a message that nothing was uploaded. A bad message gets `ok: false`.

JavaScript never holds tokens. Preferences go in an App Group `UserDefaults` suite. Secrets, when pairing exists, go in a shared Keychain access group. The containing app cannot push work into the extension; the extension always starts the native call.

## Layout

```
src/                         TypeScript: popup, content script, background, message checks
PageToPaper/App/             SwiftUI app: Onboarding, Pairing, Settings
PageToPaper/Extension/       Safari web extension and SafariWebExtensionHandler
PageToPaper/Extension/Resources/   manifest, popup, and esbuild output
PageToPaper/Shared/          Swift compiled into both targets
PageToPaper.xcodeproj        Checked-in Xcode project
```

Shared Swift types are `ArticleDraft`, `UploadResult`, `RemarkableAuth`, `RemarkableCloudClient`, `TokenStore`, and `ArticleConverter`. `TokenStore` talks to the Keychain and is unused by the stub upload. `ArticleConverter.makeEpub` returns nil.

## Placeholder identifiers

These must be replaced before you sign or ship a build. They are not registered to this project.

| Use | Value |
| --- | --- |
| App bundle id | `com.example.pagetopaper` |
| Extension bundle id | `com.example.pagetopaper.extension` |
| App Group | `group.com.example.pagetopaper` |
| Keychain access group | `$(AppIdentifierPrefix)com.example.pagetopaper.shared` |

Signing is Automatic, and no development team is set. Select a team in Xcode after replacing the identifiers. The embedded extension is copied with Code Sign On Copy, which is what a device or TestFlight build needs.

## Requirements

- Node.js 18 or newer, for the extension scripts
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

**Xcode build: UNVERIFIED.** This scaffold was prepared on Linux, where `xcodebuild` and Xcode are not installed. The project structure, Info.plists, entitlements, and `manifest.json` were checked with `node scripts/validate-xcodeproj.mjs` and `python3 scripts/validate_plists.py`. That is not a compile. Do not treat the app as building until the command above has been run on a Mac.

The checked-in project is the file Xcode opens. After adding or removing a Swift or resource file, regenerate it with `node scripts/generate-xcodeproj.mjs` and run `node scripts/validate-xcodeproj.mjs`.

## Message contract

Extension JavaScript and the native handler share one shape. No token fields are allowed.

| Step | Body |
| --- | --- |
| Popup to content script | `{ "type": "extractArticle" }` |
| Content script to popup | `{ "type": "articleDraft", "title", "url", "byline"? }` |
| Popup to the app | `{ "type": "uploadArticle", "draft": { "title", "url", "html"?, "byline"? } }` |
| App to the popup | `{ "ok", "message", "documentId"? }` |

The native call uses `browser.runtime.sendNativeMessage("application", message)`. Safari routes that to this extension’s handler. `"application"` is not a bundle id and not a secret.

## License

MIT. See [LICENSE](LICENSE).
