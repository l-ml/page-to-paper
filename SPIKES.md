# Spikes

These are open questions from the architecture notes. The scaffold does not answer them and does not implement the calls they describe. Real pairing, EPUB conversion, and upload should wait until each one is settled on a device.

## Current token host and ATS from iOS

Confirm, from a current iOS build of reMarkable’s own software or from a pairing experiment you are allowed to run, which host issues a device token and whether the default App Transport Security policy already allows that connection.

Do not add an ATS exception in this project until that host is known and still required. `TokenStore` and `RemarkableAuth` are local placeholders and open no connection.

## sync15 EPUB upload shape

Confirm whether the current Cloud Inbox upload is stable enough to depend on: the file type it expects, the metadata it requires, and how it reports failure. The on-device client has changed this shape before.

`ArticleConverter` returns no EPUB and `RemarkableCloudClient` does not build a request. Keep it that way until the shape is written down from a current client, not from an old blog post.

## Device tokens in the reMarkable UI

Find out whether reMarkable’s software lists third-party device tokens, and whether a person can revoke one token without invalidating every device. The pairing screen should explain that before it stores anything.

The Keychain slot in `TokenStore` is empty in this scaffold. The extension never receives the token, and the popup has nowhere to put one.

## Cross-origin images under activeTab

The manifest asks for `activeTab`, `scripting`, and `nativeMessaging`. The popup injects `content.js` into the active tab when it opens. Article HTML and images are not captured yet.

Before an EPUB includes images, check what Safari on iOS actually grants when the toolbar button is used: whether `activeTab` can read cross-origin images on that page, and whether a narrower host permission is required. Do not widen the manifest until that is known.
