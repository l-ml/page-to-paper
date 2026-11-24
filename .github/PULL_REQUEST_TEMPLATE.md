## Summary

<!-- Briefly describe what this PR changes and why. -->

## Linked Issue

<!-- e.g. Closes LEO-12 -->

## Checklist

- [ ] PR title uses a semantic prefix (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `refactor:`, `ci:`, `build:`, `perf:`, `style:`, `revert:`)
- [ ] `npm run typecheck`, `npm run build`, and `npm test` pass (and built `PageToPaper/Extension/Resources/*.js` files are up to date)
- [ ] `python3 scripts/validate_plists.py` and `node scripts/validate-xcodeproj.mjs` pass
- [ ] `xcodebuild` succeeds for Debug and Release (iOS Simulator) if Swift files changed
- [ ] Placeholder bundle/team identifiers and `SPIKES.md` boundaries (no unapproved Cloud hosts, ATS exceptions, or secrets in JS) are preserved
