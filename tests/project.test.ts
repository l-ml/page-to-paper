import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return fs.readFileSync(path, "utf8");
}

describe("extension sources", () => {
  it("keeps tokens out of JavaScript and sends native messages from the popup", () => {
    const popup = read("src/popup.ts");
    const background = read("src/background.ts");
    const content = read("src/content.ts");
    const messaging = read("src/messaging.ts");

    expect(read("src/nativeCall.ts")).toContain("nativeCallTimeoutMs");
    expect(popup).toContain("assignPairingLink");
    expect(popup).toContain("uploadDraft");
    expect(popup).toContain("requestNative");
    expect(popup).not.toContain("sendNativeMessage");
    expect(popup).toContain("window.location");
    expect(popup).not.toContain("NSExtensionContext");
    expect(popup).not.toContain("localStorage");
    expect(popup).not.toContain("browser.storage");
    expect(background).toContain("sendNativeMessage");
    expect(content).not.toContain("sendNativeMessage");
    expect(messaging).toContain('containingAppNativeId = "application"');

    for (const source of [popup, background, content, messaging]) {
      expect(source).not.toContain("my.remarkable.com");
      expect(source).not.toContain("webapp-prod");
    }
  });

  it("matches the Swift draft limits and secret keys", () => {
    const swift = read("PageToPaper/Shared/ArticleDraft.swift");
    const secrets = read("PageToPaper/Shared/ExtensionMessageRouter.swift");
    expect(swift).toContain("static let title = 300");
    expect(swift).toContain("static let byline = 200");
    expect(swift).toContain("static let html = 500_000");
    expect(swift).toContain("static let url = 2_000");
    for (const key of ["token", "password", "secret", "apikey", "accesstoken", "authorization", "bearer"]) {
      expect(secrets).toContain(`"${key}"`);
    }
    expect(secrets).toContain("precomposedStringWithCompatibilityMapping");
    expect(secrets).toContain("value > 127");
    expect(read("PageToPaper/Shared/AppPreferences.swift")).toContain("isUsableSharedGroup");
    expect(read("PageToPaper/Shared/RemarkableAuth.swift")).toContain("stored == data");
    expect(read("PageToPaper/Extension/SafariWebExtensionHandler.swift")).toContain("category: \"native-message\"");
    expect(read("PageToPaper/Extension/SafariWebExtensionHandler.swift")).toContain("completeRequest");
    expect(read("PageToPaper/Shared/RemarkableCloudClient.swift")).toContain("Nothing was uploaded");
    const handler = read("PageToPaper/Extension/SafariWebExtensionHandler.swift");
    expect(handler).toContain('static let key = "message"');
    expect(handler).not.toContain("SFExtensionMessageKey");
    expect(read("PageToPaper/Extension/SafariWebExtensionHandler.swift")).not.toContain("URLSession");
  });
});

describe("checked-in project files", () => {
  it("parses plists and entitlements", () => {
    const output = execFileSync("python3", ["scripts/validate_plists.py"], { encoding: "utf8" });
    expect(output).toContain("plists ok");
  });

  it("parses the Xcode project structure", () => {
    const output = execFileSync("node", ["scripts/validate-xcodeproj.mjs"], { encoding: "utf8" });
    expect(output).toContain("xcodeproj ok");
  });

  it("checks the manifest and the built scripts", () => {
    const manifest = JSON.parse(read("PageToPaper/Extension/Resources/manifest.json"));
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("Page to Paper");
    expect(manifest.permissions).toEqual(["activeTab", "scripting", "nativeMessaging"]);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toMatch(/https?:\/\//);
    expect(manifest.background).toEqual({ service_worker: "background.js" });
    expect(manifest.background.persistent).toBeUndefined();
    expect(manifest.action.default_popup).toBe("popup.html");
    expect(read("src/popup.ts")).toContain('files: ["content.js"]');

    for (const name of ["background.js", "content.js", "popup.js"]) {
      const source = read(`PageToPaper/Extension/Resources/${name}`);
      expect(source).toContain("Generated from src/ by esbuild.");
      expect(source).not.toMatch(/^\s*import\s/m);
    }
    const popupJs = read("PageToPaper/Extension/Resources/popup.js");
    expect(popupJs).toContain("uploadArticle");
    expect(popupJs).toContain("pagetopaper://pair");
    expect(popupJs).not.toContain("NSExtensionContext");
  });
});
