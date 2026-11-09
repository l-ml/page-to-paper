#!/usr/bin/env python3
"""Parse checked-in plists and confirm the scaffold's identifiers."""

import plistlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = [
    ROOT / "PageToPaper/App/Info.plist",
    ROOT / "PageToPaper/Extension/Info.plist",
    ROOT / "PageToPaper/App/PageToPaper.entitlements",
    ROOT / "PageToPaper/Extension/PageToPaperExtension.entitlements",
    ROOT / "PageToPaper/App/PrivacyInfo.xcprivacy",
    ROOT / "PageToPaper/Extension/PrivacyInfo.xcprivacy",
]


def main() -> int:
    for path in FILES:
        with path.open("rb") as handle:
            data = plistlib.load(handle)
        print(f"parsed {path.relative_to(ROOT)}")
        if path.name == "Info.plist" and "Extension" in path.parts:
            extension = data["NSExtension"]
            if extension["NSExtensionPointIdentifier"] != "com.apple.Safari.web-extension":
                raise SystemExit(f"unexpected extension point in {path}")
            if extension["NSExtensionPrincipalClass"] != "$(PRODUCT_MODULE_NAME).SafariWebExtensionHandler":
                raise SystemExit(f"unexpected principal class in {path}")
            if data["CFBundleDisplayName"] != "Page to Paper":
                raise SystemExit("extension display name")
        if path.name == "Info.plist" and "App" in path.parts:
            if data["CFBundleDisplayName"] != "Page to Paper":
                raise SystemExit("app display name")
            if "UILaunchScreen" not in data:
                raise SystemExit("missing launch screen")
        if path.name.endswith(".entitlements"):
            groups = data["com.apple.security.application-groups"]
            keychain = data["keychain-access-groups"]
            if groups != ["group.com.example.pagetopaper"]:
                raise SystemExit(f"app group mismatch in {path}")
            if keychain != ["$(AppIdentifierPrefix)com.example.pagetopaper.shared"]:
                raise SystemExit(f"keychain group mismatch in {path}")
        if path.name == "PrivacyInfo.xcprivacy":
            if data["NSPrivacyTracking"] is not False:
                raise SystemExit("privacy tracking should be false")
    print("plists ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
