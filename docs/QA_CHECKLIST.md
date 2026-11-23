# Manual QA Checklist (iOS Safari + reMarkable)

Use this checklist to verify **Page to Paper** on real iOS devices before distributing a TestFlight build (or after resolving [SPIKES.md](../SPIKES.md) and shipping real Cloud upload).

> **Build mode note:** Current builds use `MockUploadTransport` and store an 8-character pairing code locally in the Keychain as a stand-in token. Run **Sections 1–5 and 7** on every TestFlight candidate today, and complete **Section 6** once real Cloud upload (`LEO-10` / transport follow-up) is enabled.

## Test Matrix

| Dimension | Minimum Coverage |
| --- | --- |
| Form factors | iPhone (Safari modal sheet) and iPad (Safari popover) |
| iOS versions | Minimum target iOS 15.4 (or oldest available test device) + current shipping iOS |
| Appearance | Light Mode and Dark Mode (both app and Safari popup) |
| Accessibility | Dynamic Type (Default + Accessibility XXL), VoiceOver, Reduce Motion |
| Configurations | `Debug` (testing fault modes) and `Release` (TestFlight archive sanity) |

---

## 1. Fresh Install & Onboarding

- [ ] **First launch:** App opens to **Welcome** (`OnboardingView`) with the **Page to Paper** title, description, 3 numbered setup steps, and full-width **Continue** button.
- [ ] **No App Group error banner:** In a signed Debug build, the red `"The App Group is unavailable..."` banner is NOT shown.
- [ ] **Complete onboarding:** Tap **Continue** → lands on Home (`Page to Paper`) and automatically navigates to **Pairing** when not yet paired.
- [ ] **Persistence:** Force-quit and relaunch the app → skips onboarding and opens directly to Home (`Page to Paper`).
- [ ] **Debug reset (Debug only):** In **Settings → Developer**, tap **Reset onboarding** → immediately returns to **Welcome**.

---

## 2. Pairing, Keychain Sharing & Sign-Out

- [ ] **Home status:** Home displays `Pairing` with `Not paired` before connecting.
- [ ] **Connect link:** On **Pairing**, tap **Get code at my.remarkable.com** → opens `https://my.remarkable.com/device/browser/connect` in Safari.
- [ ] **Input normalization & validation:**
  - Empty, 7-character, 9-character, or punctuation-containing codes keep **Pair** disabled.
  - Uppercase letters, spaces, and hyphens (e.g. `AB-CD 12EF`) normalize to `abcd12ef` and enable **Pair**.
- [ ] **Pair succeeds:** Tap **Pair** with a valid 8-character code → status switches to **Connected**, shows `This device can send EPUBs to your reMarkable Inbox.`, and **Settings → Connection** updates to green `Connected`.
- [ ] **Shared Keychain across processes:** Open Safari → tap **Page to Paper** toolbar button → confirm primary button reads **Send** (not **Pair device**), proving the extension reads the token saved by the app.
- [ ] **Re-pair flow:** Tap **Re-pair** → enters `New code` mode with **Cancel** button. Tapping **Cancel** preserves the existing connection; pairing a new code replaces it.
- [ ] **Sign out:** Tap **Sign out** (from **Pairing** or **Settings**) → confirmation dialog appears → confirm **Sign out** → status returns to **Not paired** in both app and Safari popup.

---

## 3. Enabling the Extension & Safari Site Permissions

- [ ] **Extension listed:** Open iOS **Settings → Safari → Extensions** → **Page to Paper** appears with its name and icon.
- [ ] **Enable & permission prompt:** Enable **Page to Paper** and visit a normal `https://` article with site access set to **Ask** → tapping the toolbar button prompts to allow access for the site.
- [ ] **Denied / internal Safari pages:** Open `about:blank`, Start Page, or a site where the extension is denied → popup renders **Could not read this page** (`Allow Page to Paper for the site in Safari, then try again.`) with **Try again**, and the loading spinner is **not** visible.

---

## 4. Article Extraction & EPUB Pipeline

- [ ] **Long-form article extraction (Readability):** Open a multi-paragraph blog post or news article containing navigation bars, ads, comments, scripts, embedded iframes, and relative links (`/about`, `#section`).
  - Tap the **Page to Paper** toolbar button → popup shows page title (max 2 lines), hostname only, `Destination: Inbox`, `Format: EPUB`, and **Send**.
  - Verify the live webpage DOM in Safari is unchanged (no styles broken, no elements removed on screen).
  - Verify relative links resolve cleanly, images degrade to alt text (without giant base64 image payloads), and any redundant leading `<h1>` matching the article title is deduplicated.
- [ ] **Short / SPA fallback:** Open a minimal page or client-rendered app where Readability returns no article body → popup still shows title/hostname and builds a valid fallback EPUB containing title, optional byline, and source URL.
- [ ] **Unsupported URLs / oversized drafts:** Non-`http(s)` tabs or URLs exceeding 2,000 characters show **Can’t send this page** → **OK** closes the popup cleanly.

---

## 5. Send Happy Path, Offline, Deep Links & Fault Recovery

### Happy Path & Offline
- [ ] **Unpaired popup:** When signed out, popup primary button reads **Pair device** with footnote `Pair your reMarkable in the Page to Paper app to continue.` and **no spinner** visible.
- [ ] **Offline guard:** Enable Airplane Mode on device → popup shows `You’re offline.` and **Send** is disabled. Disable Airplane Mode → **Send** re-enables immediately.
- [ ] **Test mode send (MockUploadTransport):** Tap **Send** → spinner + `Sending as EPUB…` → settles on **Test mode** (`Test mode: nothing was uploaded to your reMarkable.`) and stays open until **Done** is tapped.
- [ ] **Real mode auto-dismiss (when implemented):** Real upload settles on **Sent** (`Saved to Inbox as EPUB.`) and auto-dismisses after ~1.2 seconds (or on **Done**).

### Deep Links (`pagetopaper://pair`)
- [ ] **Pair device (`reason=required`):** Tap **Pair device** in popup → Safari confirms opening **Page to Paper** → app opens **Pairing** with the `"Pair your reMarkable before sending pages from Safari."` banner.
- [ ] **Auth expired (`reason=expired`):** Trigger `authExpired` → tap **Re-pair** → stored token is cleared before opening **Pairing** with `"Your reMarkable session expired. Enter a fresh one-time code to reconnect."`.
- [ ] **Open app (`reason=unreachable`):** Tap **Open app** → opens **Pairing** with `"Page to Paper is open. Return to Safari and tap Retry."`.

### Debug Fault Simulation (Debug Builds Only)
In **Settings → Developer → Mock upload fault** (observe `com.example.pagetopaper` logs in macOS Console.app while testing):
- [ ] **Fail (`fail`):** Tap **Send** → shows **Something went wrong** → tap **Retry** (reset fault to **Off** first if verifying recovery) → succeeds without leaving confirm screen.
- [ ] **Slow timeout & idempotency (`slow`):**
  1. Set fault to **Slow (timeout)** → tap **Send** → waits 20s and shows **Timed out** (`The send took too long. Try again.`).
  2. Set fault back to **Off** → tap **Retry** → succeeds and Console logs show `replay=true` with the **same** `mock-<uuid>` `documentId` created on the first attempt.
  3. Open popup again and send a **new** page → creates a **new** `documentId` (`replay=false`).
- [ ] **Rate limit (`ratelimit`):** Set fault to **Rate limit** → tap **Send** → shows **Too many sends** (`Please wait a moment and try again.`) and footnote `Wait a moment before sending another page.` → **OK** returns to confirm.

---

## 6. Real reMarkable Tablet Pass *(once real transport ships)*

- [ ] **Sync to Inbox:** Sent EPUB appears in reMarkable Cloud **Inbox/root** without manual folder selection and syncs to the physical reMarkable tablet (paper tablet / desktop / mobile app).
- [ ] **EPUB metadata & rendering:**
  - Title matches the article title.
  - Author (`<dc:creator>`) displays the extracted byline when present.
  - Header shows title, byline, source URL link, horizontal rule `<hr />`, and clean readable body paragraphs/headings/lists/blockquotes/code.
  - Table of contents (`nav.xhtml`) lists the chapter title.
  - No raw HTML entity noise, broken tags, or unreadable formatting on e-ink display.
- [ ] **Token lifecycle (per [SPIKES.md](../SPIKES.md)):** Confirm where the paired device appears on `my.remarkable.com` and verify revoking the token returns `authExpired` (`Sign in again`) on the next send.

---

## 7. Visual, Accessibility & Release Build Sanity

- [ ] **Icons:**
  - App icon (`AppIcon`) renders crisply on Home Screen, App Switcher, and iOS Settings.
  - Safari toolbar icon is crisp and legible in both Light and Dark Safari themes (and on iPad).
- [ ] **Layout & Dynamic Type:** No clipped button labels, overflowing preview cards, or horizontal scrolling at Accessibility XXL text sizes on iPhone SE / standard iPhone / iPad.
- [ ] **VoiceOver:**
  - Confirm screen announces page title, host, `Destination Inbox`, `Format EPUB`, and `Send`.
  - Status live region announces `Sending as EPUB to Inbox` and completion/error states.
  - Pairing status badge announces `Connected` / `Not paired` as a single combined element.
- [ ] **Reduce Motion:** With **Settings → Accessibility → Motion → Reduce Motion** enabled, the sending spinner does not spin continuously and there is no decorative transition bounce.
- [ ] **Release build check:** Archive or run a **Release** build → verify **Developer** and **Before TestFlight** sections are hidden in **Settings**, and `mockUploadFault` has no effect.

---

## Sign-off Log

| Date | Tester | Device & iOS | App Version (Build) | Transport Mode | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| | | | | Mock / Real | Pass / Fail | |
| | | | | Mock / Real | Pass / Fail | |
