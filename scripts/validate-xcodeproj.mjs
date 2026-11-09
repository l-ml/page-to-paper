import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const projectPath = path.join(root, "PageToPaper.xcodeproj/project.pbxproj");
const text = fs.readFileSync(projectPath, "utf8");

function parsePbx(source) {
  let index = 0;
  function skip() {
    while (index < source.length) {
      if (source[index] === "/" && source[index + 1] === "/") {
        while (index < source.length && source[index] !== "\n") index += 1;
      } else if (source[index] === "/" && source[index + 1] === "*") {
        index += 2;
        while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
        index += 2;
      } else if (/\s/.test(source[index])) {
        index += 1;
      } else {
        break;
      }
    }
  }
  function fail(label) {
    throw new Error(`${label} at ${index}: ${JSON.stringify(source.slice(index, index + 80))}`);
  }
  function parseString() {
    index += 1;
    let value = "";
    while (index < source.length && source[index] !== '"') {
      if (source[index] === "\\") {
        index += 1;
        value += source[index] ?? "";
      } else {
        value += source[index];
      }
      index += 1;
    }
    if (source[index] !== '"') fail("unterminated string");
    index += 1;
    return value;
  }
  function parseBare() {
    const start = index;
    while (index < source.length) {
      const character = source[index];
      if (/[\s;,(){}]/.test(character)) break;
      if (character === "/" && (source[index + 1] === "/" || source[index + 1] === "*")) break;
      index += 1;
    }
    if (start === index) fail("expected value");
    return source.slice(start, index);
  }
  function parseValue() {
    skip();
    if (source[index] === "{") return parseDict();
    if (source[index] === "(") return parseArray();
    if (source[index] === '"') return parseString();
    return parseBare();
  }
  function parseKey() {
    skip();
    if (source[index] === '"') return parseString();
    const start = index;
    while (index < source.length && /[A-Za-z0-9_./$]/.test(source[index])) index += 1;
    if (start === index) fail("expected key");
    return source.slice(start, index);
  }
  function parseDict() {
    if (source[index] !== "{") fail("expected {");
    index += 1;
    const result = {};
    while (true) {
      skip();
      if (source[index] === "}") {
        index += 1;
        return result;
      }
      const key = parseKey();
      skip();
      if (source[index] !== "=") fail(`expected = after ${key}`);
      index += 1;
      const value = parseValue();
      skip();
      if (source[index] !== ";") fail(`expected ; after ${key}`);
      index += 1;
      if (Object.prototype.hasOwnProperty.call(result, key)) fail(`duplicate key ${key}`);
      result[key] = value;
    }
  }
  function parseArray() {
    if (source[index] !== "(") fail("expected (");
    index += 1;
    const result = [];
    while (true) {
      skip();
      if (source[index] === ")") {
        index += 1;
        return result;
      }
      result.push(parseValue());
      skip();
      if (source[index] === ",") {
        index += 1;
        continue;
      }
      if (source[index] === ")") {
        index += 1;
        return result;
      }
      fail("expected , or )");
    }
  }
  skip();
  const rootValue = parseDict();
  skip();
  if (index !== source.length) fail("trailing input");
  return rootValue;
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const project = parsePbx(text);
const objects = project.objects;
const issues = [];
function check(condition, message) {
  if (!condition) issues.push(message);
}

check(project.archiveVersion === "1", "archiveVersion");
check(project.objectVersion === "56", "objectVersion");
check(objects[project.rootObject]?.isa === "PBXProject", "root object");

const pbx = objects[project.rootObject];
const targets = pbx.targets.map((id) => objects[id]);
check(targets.length === 2, `expected 2 targets, found ${targets.length}`);
const app = targets.find((target) => target.name === "PageToPaper");
const extension = targets.find((target) => target.name === "PageToPaperExtension");
check(app?.productType === "com.apple.product-type.application", "app product type");
check(extension?.productType === "com.apple.product-type.app-extension", "extension product type");

function configs(target) {
  const list = objects[target.buildConfigurationList];
  return list.buildConfigurations.map((id) => objects[id]);
}

function expectSetting(target, key, value) {
  for (const config of configs(target)) {
    check(config.buildSettings[key] === value, `${target.name} ${config.name} ${key} = ${config.buildSettings[key]}`);
  }
}

expectSetting(app, "PRODUCT_BUNDLE_IDENTIFIER", "com.example.pagetopaper");
expectSetting(extension, "PRODUCT_BUNDLE_IDENTIFIER", "com.example.pagetopaper.extension");
expectSetting(app, "IPHONEOS_DEPLOYMENT_TARGET", "15.4");
expectSetting(extension, "IPHONEOS_DEPLOYMENT_TARGET", "15.4");
expectSetting(app, "SWIFT_VERSION", "5.9");
expectSetting(extension, "SWIFT_VERSION", "5.9");
expectSetting(app, "GENERATE_INFOPLIST_FILE", "NO");
expectSetting(extension, "GENERATE_INFOPLIST_FILE", "NO");
expectSetting(app, "MARKETING_VERSION", "0.1.0");
expectSetting(extension, "PRODUCT_MODULE_NAME", "PageToPaperExtension");
expectSetting(extension, "APPLICATION_EXTENSION_API_ONLY", "YES");
expectSetting(extension, "SKIP_INSTALL", "YES");
expectSetting(app, "INFOPLIST_FILE", "PageToPaper/App/Info.plist");
expectSetting(extension, "INFOPLIST_FILE", "PageToPaper/Extension/Info.plist");
expectSetting(app, "CODE_SIGN_ENTITLEMENTS", "PageToPaper/App/PageToPaper.entitlements");
expectSetting(extension, "CODE_SIGN_ENTITLEMENTS", "PageToPaper/Extension/PageToPaperExtension.entitlements");

for (const relative of [
  "PageToPaper/App/Info.plist",
  "PageToPaper/Extension/Info.plist",
  "PageToPaper/App/PageToPaper.entitlements",
  "PageToPaper/Extension/PageToPaperExtension.entitlements",
]) {
  check(fs.existsSync(path.join(root, relative)), `missing ${relative}`);
}

const dependency = objects[app.dependencies[0]];
check(dependency?.isa === "PBXTargetDependency", "app dependency");
check(objects[dependency?.target]?.name === "PageToPaperExtension", "dependency target");
const proxy = objects[dependency.targetProxy];
check(proxy?.isa === "PBXContainerItemProxy", "container proxy");
check(proxy?.remoteInfo === "PageToPaperExtension", "proxy remoteInfo");
const extensionId = pbx.targets.find((id) => objects[id].name === "PageToPaperExtension");
check(proxy?.remoteGlobalIDString === extensionId, "proxy points at the extension target");

const embed = app.buildPhases.map((id) => objects[id]).find((phase) => phase.isa === "PBXCopyFilesBuildPhase");
check(embed?.name === "Embed Foundation Extensions", "embed phase name");
check(embed?.dstSubfolderSpec === "13", "embed dstSubfolderSpec");
const embedFile = objects[embed.files[0]];
check(embedFile?.fileRef === extension.productReference, "embed product");
check(
  Array.isArray(embedFile?.settings?.ATTRIBUTES) &&
    embedFile.settings.ATTRIBUTES.includes("CodeSignOnCopy") &&
    embedFile.settings.ATTRIBUTES.includes("RemoveHeadersOnCopy"),
  "embed attributes",
);

function phaseFiles(target, isa) {
  const phase = target.buildPhases.map((id) => objects[id]).find((item) => item.isa === isa);
  return phase.files.map((id) => objects[id].fileRef);
}

const appSources = new Set(phaseFiles(app, "PBXSourcesBuildPhase"));
const extSources = new Set(phaseFiles(extension, "PBXSourcesBuildPhase"));
const extResources = phaseFiles(extension, "PBXResourcesBuildPhase").map((id) => objects[id]);
const appResources = phaseFiles(app, "PBXResourcesBuildPhase").map((id) => objects[id]);

function resolvedGroupFiles(groupId, directory) {
  const group = objects[groupId];
  const next = group.path ? path.join(directory, group.path) : directory;
  const found = [];
  for (const child of group.children) {
    const item = objects[child];
    if (item.isa === "PBXGroup") found.push(...resolvedGroupFiles(child, next));
    else if (item.isa === "PBXFileReference" && (item.sourceTree === "<group>" || item.sourceTree === undefined)) {
      found.push({ id: child, relative: path.join(next, item.path), file: item });
    }
  }
  return found;
}

const groupFiles = resolvedGroupFiles(pbx.mainGroup, "");
for (const file of groupFiles) {
  check(fs.existsSync(path.join(root, file.relative)), `missing project file ${file.relative}`);
}

function swiftFiles(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...swiftFiles(full));
    else if (entry.name.endsWith(".swift")) found.push(path.relative(root, full));
  }
  return found;
}
const diskSwift = new Set(swiftFiles(path.join(root, "PageToPaper")));
const projectSwift = new Set(groupFiles.filter((file) => file.relative.endsWith(".swift")).map((file) => file.relative));
check(
  [...diskSwift].every((file) => projectSwift.has(file)) && [...projectSwift].every((file) => diskSwift.has(file)),
  `swift file set mismatch disk=${[...diskSwift].sort()} project=${[...projectSwift].sort()}`,
);

const handlerFile = groupFiles.find((file) => file.relative.endsWith("SafariWebExtensionHandler.swift"));
check(handlerFile && extSources.has(handlerFile.id), "handler compiled into the extension");
check(handlerFile && !appSources.has(handlerFile.id), "handler stays out of the app target");

const sharedFiles = groupFiles.filter((file) => file.relative.startsWith(`PageToPaper${path.sep}Shared${path.sep}`));
check(sharedFiles.length === 8, `expected 8 shared files, found ${sharedFiles.length}`);
for (const file of sharedFiles) {
  check(appSources.has(file.id) && extSources.has(file.id), `${file.relative} compiled into both targets`);
}

const resourceNames = new Set(extResources.map((file) => file.path));
for (const name of fs.readdirSync(path.join(root, "PageToPaper/Extension/Resources"))) {
  check(resourceNames.has(name), `extension resource ${name} is not in the Copy Bundle Resources phase`);
}
for (const file of [...extResources, ...appResources]) {
  check(file.path !== "Info.plist", "Info.plist must not be copied as a resource");
  check(!String(file.path).endsWith(".entitlements"), "entitlements must not be copied as a resource");
}
check(resourceNames.has("manifest.json"), "manifest copied into the extension");
check(resourceNames.has("background.js"), "background.js copied into the extension");
check(appResources.some((file) => file.path === "Assets.xcassets"), "asset catalog in the app");

const scheme = fs.readFileSync(
  path.join(root, "PageToPaper.xcodeproj/xcshareddata/xcschemes/PageToPaper.xcscheme"),
  "utf8",
);
const appTargetId = pbx.targets.find((id) => objects[id].name === "PageToPaper");
check(scheme.includes(`BlueprintIdentifier = "${appTargetId}"`), "shared scheme points at the app target");
check(fs.existsSync(path.join(root, "PageToPaper.xcodeproj/project.xcworkspace/contents.xcworkspacedata")), "workspace");

if (issues.length) {
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

console.log("targets: PageToPaper, PageToPaperExtension");
console.log("bundle ids: com.example.pagetopaper, com.example.pagetopaper.extension");
console.log("deployment target: 15.4");
console.log(`group files: ${groupFiles.length}`);
console.log(`swift files in both checks: ${projectSwift.size}`);
console.log("xcodeproj ok");
