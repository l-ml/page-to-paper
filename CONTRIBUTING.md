# Contributing to Page to Paper

Thank you for helping improve **Page to Paper**. This project is licensed under the [MIT License](LICENSE).

> **Unofficial API notice.** Page to Paper is not affiliated with reMarkable. Any real Cloud upload uses reMarkable’s unofficial Cloud API, which is out of scope while [SPIKES.md](SPIKES.md) remains open. Do not add reMarkable hosts, ATS exceptions, or `URLSession` calls until those spikes are resolved.

## Prerequisites

- **Node.js 22+** (see `.nvmrc`) for building and testing the TypeScript extension scripts
- **Python 3** for plist/entitlement validation (`scripts/validate_plists.py`)
- **macOS + Xcode 15+** targeting **iOS 15.4+** for building the containing SwiftUI app and Safari Web Extension

## Local Setup & Verification

```bash
npm install
npm run typecheck
npm run build
npm test
python3 scripts/validate_plists.py
node scripts/validate-xcodeproj.mjs
```

On macOS, build the iOS Simulator target with:

```bash
xcodebuild \
  -project PageToPaper.xcodeproj \
  -scheme PageToPaper \
  -destination 'generic/platform=iOS Simulator' \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  build
```

## Repository Rules

1. **Keep built extension scripts in sync.** `PageToPaper/Extension/Resources/{background,content,popup}.js` are checked in so Xcode builds without Node. Run `npm run build` after any change in `src/` (`tests/project.test.ts` checks this).
2. **Regenerate icons from source.** Update `scripts/generate-icons.mjs` and run `node scripts/generate-icons.mjs` instead of hand-editing individual PNGs.
3. **Regenerate the Xcode project when files change.** After adding or removing Swift or extension resource files, run `node scripts/generate-xcodeproj.mjs` and `node scripts/validate-xcodeproj.mjs`.
4. **Never commit personal signing or team identifiers.** Keep placeholder bundle IDs (`com.example.pagetopaper`, `com.example.pagetopaper.extension`), App Group (`group.com.example.pagetopaper`), Keychain group (`$(AppIdentifierPrefix)com.example.pagetopaper.shared`), and empty `DEVELOPMENT_TEAM` in git. Use local untracked overrides or discard signing diffs before opening a PR.
5. **Preserve security and manifest boundaries.**
   - Extension JavaScript must never store, read, or transmit tokens (`MessageSecrets` and `findForbiddenSecretKey` enforce this across the native bridge).
   - Keep `manifest.json` scoped to `activeTab`, `scripting`, and `nativeMessaging` with no `host_permissions` or `content_scripts`.
   - Maintain iOS 15.4 deployment compatibility in Swift/SwiftUI code.

## Pull Requests

PR titles are checked by [pr-title.yml](.github/workflows/pr-title.yml) and must start with a conventional type:

`feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `ci`, `build`, `perf`, `style`, or `revert`

Before requesting review:
- Verify all JS tests, typecheck, build parity, plist validation, and Xcode project validation pass.
- Build both `Debug` and `Release` configurations on macOS if Swift code changed.
- For manual device or TestFlight changes, follow [docs/QA_CHECKLIST.md](docs/QA_CHECKLIST.md) and [docs/TESTFLIGHT.md](docs/TESTFLIGHT.md).
