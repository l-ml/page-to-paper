# Spikes

These are open questions from the architecture notes. The scaffold does not answer them. Real pairing and a real Cloud upload should wait until each one is settled on a device. EPUB conversion for the mock send is in place. The spikes below are still open.

## Current token host and ATS from iOS

Confirm, from a current iOS build of reMarkable’s own software or from a pairing experiment you are allowed to run, which host issues a device token and whether the default App Transport Security policy already allows that connection.

Do not add an ATS exception in this project until that host is known and still required. `TokenStore` and `RemarkableAuth` are local placeholders and open no connection.

## sync15 EPUB upload shape

The send flow now builds an EPUB 3 and passes it to `MockUploadTransport`. That mock is there so the popup, the native handler, the timeout, and retries can be exercised without a network call. It does not answer this spike.

Confirm whether the current Cloud Inbox upload is stable enough to depend on: the file type it expects, the metadata it requires, and how it reports failure. The on-device client has changed this shape before.

Do not add a real transport, a reMarkable host, or an ATS exception from this note. A real transport is a separate follow-up and is not approved. `RemarkableCloudClient` does not build a network request. Keep it that way until the shape is written down from a current client, not from an old blog post.

## Device tokens in the reMarkable UI

Find out whether reMarkable’s software lists third-party device tokens, and whether a person can revoke one token without invalidating every device. The pairing screen should explain that before it stores anything.

The Keychain slot in `TokenStore` is empty in this scaffold. The extension never receives the token, and the popup has nowhere to put one.

## Cross-origin images under activeTab

The manifest asks for `activeTab`, `scripting`, and `nativeMessaging`. The popup injects `content.js` into the active tab when it opens. Article HTML and images are not captured yet.

Before an EPUB includes images, check what Safari on iOS actually grants when the toolbar button is used: whether `activeTab` can read cross-origin images on that page, and whether a narrower host permission is required. Do not widen the manifest until that is known.
