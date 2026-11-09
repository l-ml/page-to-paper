import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const objects = [];
let counter = 0;

function uid(name) {
  counter += 1;
  const id = counter.toString(16).toUpperCase().padStart(24, "0");
  uid.names[name] = id;
  return id;
}
uid.names = {};

function add(name, comment, body) {
  const id = uid(name);
  objects.push({ id, comment, body });
  return id;
}

function ref(id, comment) {
  return { __ref: id, __comment: comment };
}

function quote(value) {
  if (typeof value === "number") return String(value);
  const text = String(value);
  if (/^[A-Za-z_][A-Za-z0-9_$.]*$/.test(text)) return text;
  if (/^[A-Za-z0-9_./$]+$/.test(text) && !/^\d/.test(text)) return text;
  return JSON.stringify(text);
}

function fmt(value, indent) {
  if (value && value.__ref) return `${value.__ref} /* ${value.__comment} */`;
  if (Array.isArray(value)) {
    if (value.length === 0) return "()";
    const pad = "\t".repeat(indent);
    const inner = "\t".repeat(indent + 1);
    const lines = value.map((item) => `${inner}${fmt(item, indent + 1)},`);
    return `(\n${lines.join("\n")}\n${pad})`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([key]) => !key.startsWith("__"));
    if (entries.length === 0) return "{}";
    const pad = "\t".repeat(indent);
    const inner = "\t".repeat(indent + 1);
    const lines = entries.map(([key, child]) => `${inner}${key} = ${fmt(child, indent + 1)};`);
    return `{\n${lines.join("\n")}\n${pad}}`;
  }
  return quote(value);
}

function fileRef(name, comment, body) {
  return add(name, comment, { isa: "PBXFileReference", ...body });
}

function buildFile(name, comment, fileId, fileComment, settings) {
  const body = { isa: "PBXBuildFile", fileRef: ref(fileId, fileComment) };
  if (settings) body.settings = settings;
  return add(name, comment, body);
}

function phase(name, comment, isa, files, extra = {}) {
  return add(name, comment, {
    isa,
    buildActionMask: 2147483647,
    files: files.map((item) => ref(item.id, item.comment)),
    runOnlyForDeploymentPostprocessing: 0,
    ...extra,
  });
}

const sharedNames = [
  "AppPreferences.swift",
  "ArticleConverter.swift",
  "ArticleDraft.swift",
  "ExtensionMessageRouter.swift",
  "RemarkableAuth.swift",
  "RemarkableCloudClient.swift",
  "TokenStore.swift",
  "UploadResult.swift",
];

const sharedRefs = sharedNames.map((filename) =>
  fileRef(`shared-${filename}`, filename, {
    lastKnownFileType: "sourcecode.swift",
    path: filename,
    sourceTree: "<group>",
  }),
);

const appSwift = [
  ["PageToPaperApp.swift", "app-PageToPaperApp.swift"],
  ["RootView.swift", "app-RootView.swift"],
];
const appRefs = appSwift.map(([filename, name]) =>
  fileRef(name, filename, {
    lastKnownFileType: "sourcecode.swift",
    path: filename,
    sourceTree: "<group>",
  }),
);
const viewNames = ["OnboardingView.swift", "PairingView.swift", "SettingsView.swift"];
const viewRefs = viewNames.map((filename) =>
  fileRef(`view-${filename}`, filename, {
    lastKnownFileType: "sourcecode.swift",
    path: filename,
    sourceTree: "<group>",
  }),
);

const appInfo = fileRef("app-info", "Info.plist", {
  lastKnownFileType: "text.plist.xml",
  path: "Info.plist",
  sourceTree: "<group>",
});
const appEntitlements = fileRef("app-entitlements", "PageToPaper.entitlements", {
  lastKnownFileType: "text.plist.entitlements",
  path: "PageToPaper.entitlements",
  sourceTree: "<group>",
});
const appPrivacy = fileRef("app-privacy", "PrivacyInfo.xcprivacy", {
  lastKnownFileType: "text.plist.xml",
  path: "PrivacyInfo.xcprivacy",
  sourceTree: "<group>",
});
const assets = fileRef("assets", "Assets.xcassets", {
  lastKnownFileType: "folder.assetcatalog",
  path: "Assets.xcassets",
  sourceTree: "<group>",
});

const handler = fileRef("handler", "SafariWebExtensionHandler.swift", {
  lastKnownFileType: "sourcecode.swift",
  path: "SafariWebExtensionHandler.swift",
  sourceTree: "<group>",
});
const extInfo = fileRef("ext-info", "Info.plist", {
  lastKnownFileType: "text.plist.xml",
  path: "Info.plist",
  sourceTree: "<group>",
});
const extEntitlements = fileRef("ext-entitlements", "PageToPaperExtension.entitlements", {
  lastKnownFileType: "text.plist.entitlements",
  path: "PageToPaperExtension.entitlements",
  sourceTree: "<group>",
});
const extPrivacy = fileRef("ext-privacy", "PrivacyInfo.xcprivacy", {
  lastKnownFileType: "text.plist.xml",
  path: "PrivacyInfo.xcprivacy",
  sourceTree: "<group>",
});

const resourceSpecs = [
  ["manifest.json", "text.json"],
  ["popup.html", "text.html"],
  ["popup.css", "text.css"],
  ["background.js", "sourcecode.javascript"],
  ["content.js", "sourcecode.javascript"],
  ["popup.js", "sourcecode.javascript"],
  ["icon-48.png", "image.png"],
  ["icon-64.png", "image.png"],
  ["icon-96.png", "image.png"],
  ["icon-128.png", "image.png"],
  ["icon-256.png", "image.png"],
  ["icon-512.png", "image.png"],
];
const resourceRefs = resourceSpecs.map(([filename, type]) =>
  fileRef(`res-${filename}`, filename, {
    lastKnownFileType: type,
    path: filename,
    sourceTree: "<group>",
  }),
);

const appProduct = fileRef("app-product", "PageToPaper.app", {
  explicitFileType: "wrapper.application",
  includeInIndex: 0,
  path: "PageToPaper.app",
  sourceTree: "BUILT_PRODUCTS_DIR",
});
const extProduct = fileRef("ext-product", "PageToPaperExtension.appex", {
  explicitFileType: "wrapper.app-extension",
  includeInIndex: 0,
  path: "PageToPaperExtension.appex",
  sourceTree: "BUILT_PRODUCTS_DIR",
});

const securityFramework = fileRef("security-fw", "Security.framework", {
  lastKnownFileType: "wrapper.framework",
  name: "Security.framework",
  path: "System/Library/Frameworks/Security.framework",
  sourceTree: "SDKROOT",
});
const safariFramework = fileRef("safari-fw", "SafariServices.framework", {
  lastKnownFileType: "wrapper.framework",
  name: "SafariServices.framework",
  path: "System/Library/Frameworks/SafariServices.framework",
  sourceTree: "SDKROOT",
});

function sourceBuild(prefix, fileId, filename) {
  return {
    id: buildFile(`${prefix}-src-${filename}`, `${filename} in Sources`, fileId, filename),
    comment: `${filename} in Sources`,
  };
}
function resourceBuild(prefix, fileId, filename) {
  return {
    id: buildFile(`${prefix}-res-${filename}`, `${filename} in Resources`, fileId, filename),
    comment: `${filename} in Resources`,
  };
}

const appSourceBuilds = [
  ...appRefs.map((id, index) => sourceBuild("app", id, appSwift[index][0])),
  ...viewRefs.map((id, index) => sourceBuild("app", id, viewNames[index])),
  ...sharedRefs.map((id, index) => sourceBuild("app", id, sharedNames[index])),
];
const extSourceBuilds = [
  sourceBuild("ext", handler, "SafariWebExtensionHandler.swift"),
  ...sharedRefs.map((id, index) => sourceBuild("ext", id, sharedNames[index])),
];
const appResourceBuilds = [
  resourceBuild("app", assets, "Assets.xcassets"),
  resourceBuild("app", appPrivacy, "PrivacyInfo.xcprivacy"),
];
const extResourceBuilds = [
  ...resourceRefs.map((id, index) => resourceBuild("ext", id, resourceSpecs[index][0])),
  resourceBuild("ext", extPrivacy, "PrivacyInfo.xcprivacy"),
];
const appFrameworkBuilds = [
  {
    id: buildFile("app-security", "Security.framework in Frameworks", securityFramework, "Security.framework"),
    comment: "Security.framework in Frameworks",
  },
];
const extFrameworkBuilds = [
  {
    id: buildFile("ext-security", "Security.framework in Frameworks", securityFramework, "Security.framework"),
    comment: "Security.framework in Frameworks",
  },
  {
    id: buildFile("ext-safari", "SafariServices.framework in Frameworks", safariFramework, "SafariServices.framework"),
    comment: "SafariServices.framework in Frameworks",
  },
];
const embedBuild = {
  id: buildFile(
    "embed-appex",
    "PageToPaperExtension.appex in Embed Foundation Extensions",
    extProduct,
    "PageToPaperExtension.appex",
    { ATTRIBUTES: ["CodeSignOnCopy", "RemoveHeadersOnCopy"] },
  ),
  comment: "PageToPaperExtension.appex in Embed Foundation Extensions",
};

const appSourcesPhase = phase("app-sources", "Sources", "PBXSourcesBuildPhase", appSourceBuilds);
const extSourcesPhase = phase("ext-sources", "Sources", "PBXSourcesBuildPhase", extSourceBuilds);
const appFrameworksPhase = phase("app-frameworks", "Frameworks", "PBXFrameworksBuildPhase", appFrameworkBuilds);
const extFrameworksPhase = phase("ext-frameworks", "Frameworks", "PBXFrameworksBuildPhase", extFrameworkBuilds);
const appResourcesPhase = phase("app-resources", "Resources", "PBXResourcesBuildPhase", appResourceBuilds);
const extResourcesPhase = phase("ext-resources", "Resources", "PBXResourcesBuildPhase", extResourceBuilds);
const embedPhase = phase("embed", "Embed Foundation Extensions", "PBXCopyFilesBuildPhase", [embedBuild], {
  dstPath: "",
  dstSubfolderSpec: 13,
  name: "Embed Foundation Extensions",
});

const viewsGroup = add("views-group", "Views", {
  isa: "PBXGroup",
  children: viewRefs.map((id, index) => ref(id, viewNames[index])),
  path: "Views",
  sourceTree: "<group>",
});
const appGroup = add("app-group", "App", {
  isa: "PBXGroup",
  children: [
    ...appRefs.map((id, index) => ref(id, appSwift[index][0])),
    ref(viewsGroup, "Views"),
    ref(appInfo, "Info.plist"),
    ref(appEntitlements, "PageToPaper.entitlements"),
    ref(appPrivacy, "PrivacyInfo.xcprivacy"),
    ref(assets, "Assets.xcassets"),
  ],
  path: "App",
  sourceTree: "<group>",
});
const resourcesGroup = add("resources-group", "Resources", {
  isa: "PBXGroup",
  children: resourceRefs.map((id, index) => ref(id, resourceSpecs[index][0])),
  path: "Resources",
  sourceTree: "<group>",
});
const extensionGroup = add("extension-group", "Extension", {
  isa: "PBXGroup",
  children: [
    ref(handler, "SafariWebExtensionHandler.swift"),
    ref(extInfo, "Info.plist"),
    ref(extEntitlements, "PageToPaperExtension.entitlements"),
    ref(extPrivacy, "PrivacyInfo.xcprivacy"),
    ref(resourcesGroup, "Resources"),
  ],
  path: "Extension",
  sourceTree: "<group>",
});
const sharedGroup = add("shared-group", "Shared", {
  isa: "PBXGroup",
  children: sharedRefs.map((id, index) => ref(id, sharedNames[index])),
  path: "Shared",
  sourceTree: "<group>",
});
const folderGroup = add("folder-group", "PageToPaper", {
  isa: "PBXGroup",
  children: [ref(appGroup, "App"), ref(extensionGroup, "Extension"), ref(sharedGroup, "Shared")],
  path: "PageToPaper",
  sourceTree: "<group>",
});
const frameworksGroup = add("frameworks-group", "Frameworks", {
  isa: "PBXGroup",
  children: [ref(securityFramework, "Security.framework"), ref(safariFramework, "SafariServices.framework")],
  name: "Frameworks",
  sourceTree: "<group>",
});
const productsGroup = add("products-group", "Products", {
  isa: "PBXGroup",
  children: [ref(appProduct, "PageToPaper.app"), ref(extProduct, "PageToPaperExtension.appex")],
  name: "Products",
  sourceTree: "<group>",
});
const mainGroup = add("main-group", "Main", {
  isa: "PBXGroup",
  children: [ref(folderGroup, "PageToPaper"), ref(frameworksGroup, "Frameworks"), ref(productsGroup, "Products")],
  sourceTree: "<group>",
});

const projectId = uid("project");
const proxy = add("proxy", "PBXContainerItemProxy", {
  isa: "PBXContainerItemProxy",
  containerPortal: ref(projectId, "Project object"),
  proxyType: 1,
  remoteGlobalIDString: uid.names["ext-target"] ?? "PENDING",
  remoteInfo: "PageToPaperExtension",
});

const extTarget = add("ext-target", "PageToPaperExtension", {
  isa: "PBXNativeTarget",
  buildConfigurationList: "PENDING_EXT_CONFIG",
  buildPhases: [
    ref(extSourcesPhase, "Sources"),
    ref(extFrameworksPhase, "Frameworks"),
    ref(extResourcesPhase, "Resources"),
  ],
  buildRules: [],
  dependencies: [],
  name: "PageToPaperExtension",
  productName: "PageToPaperExtension",
  productReference: ref(extProduct, "PageToPaperExtension.appex"),
  productType: "com.apple.product-type.app-extension",
});

const dependency = add("dependency", "PBXTargetDependency", {
  isa: "PBXTargetDependency",
  target: ref(extTarget, "PageToPaperExtension"),
  targetProxy: ref(proxy, "PBXContainerItemProxy"),
});

const appTarget = add("app-target", "PageToPaper", {
  isa: "PBXNativeTarget",
  buildConfigurationList: "PENDING_APP_CONFIG",
  buildPhases: [
    ref(appSourcesPhase, "Sources"),
    ref(appFrameworksPhase, "Frameworks"),
    ref(appResourcesPhase, "Resources"),
    ref(embedPhase, "Embed Foundation Extensions"),
  ],
  buildRules: [],
  dependencies: [ref(dependency, "PBXTargetDependency")],
  name: "PageToPaper",
  productName: "PageToPaper",
  productReference: ref(appProduct, "PageToPaper.app"),
  productType: "com.apple.product-type.application",
});

const proxyObject = objects.find((item) => item.id === proxy);
proxyObject.body.remoteGlobalIDString = extTarget;

const projectLevel = {
  ALWAYS_SEARCH_USER_PATHS: "NO",
  CLANG_ANALYZER_NONNULL: "YES",
  CLANG_CXX_LANGUAGE_STANDARD: "gnu++20",
  CLANG_ENABLE_MODULES: "YES",
  CLANG_ENABLE_OBJC_ARC: "YES",
  CLANG_ENABLE_OBJC_WEAK: "YES",
  CLANG_WARN_BLOCK_CAPTURE_AUTORELEASING: "YES",
  CLANG_WARN_BOOL_CONVERSION: "YES",
  CLANG_WARN_COMMA: "YES",
  CLANG_WARN_CONSTANT_CONVERSION: "YES",
  CLANG_WARN_DEPRECATED_OBJC_IMPLEMENTATIONS: "YES",
  CLANG_WARN_DIRECT_OBJC_ISA_USAGE: "YES_ERROR",
  CLANG_WARN_EMPTY_BODY: "YES",
  CLANG_WARN_ENUM_CONVERSION: "YES",
  CLANG_WARN_INFINITE_RECURSION: "YES",
  CLANG_WARN_INT_CONVERSION: "YES",
  CLANG_WARN_NON_LITERAL_NULL_CONVERSION: "YES",
  CLANG_WARN_OBJC_IMPLICIT_RETAIN_SELF: "YES",
  CLANG_WARN_OBJC_LITERAL_CONVERSION: "YES",
  CLANG_WARN_OBJC_ROOT_CLASS: "YES_ERROR",
  CLANG_WARN_QUOTED_INCLUDE_IN_FRAMEWORK_HEADER: "YES",
  CLANG_WARN_RANGE_LOOP_ANALYSIS: "YES",
  CLANG_WARN_STRICT_PROTOTYPES: "YES",
  CLANG_WARN_SUSPICIOUS_MOVE: "YES",
  CLANG_WARN_UNREACHABLE_CODE: "YES",
  COPY_PHASE_STRIP: "NO",
  DEBUG_INFORMATION_FORMAT: "dwarf",
  ENABLE_NS_ASSERTIONS: "YES",
  ENABLE_STRICT_OBJC_MSGSEND: "YES",
  ENABLE_USER_SCRIPT_SANDBOXING: "YES",
  GCC_C_LANGUAGE_STANDARD: "gnu11",
  GCC_NO_COMMON_BLOCKS: "YES",
  GCC_WARN_64_TO_32_BIT_CONVERSION: "YES",
  GCC_WARN_ABOUT_RETURN_TYPE: "YES_ERROR",
  GCC_WARN_UNINITIALIZED_AUTOS: "YES_AGGRESSIVE",
  GCC_WARN_UNUSED_FUNCTION: "YES",
  GCC_WARN_UNUSED_VARIABLE: "YES",
  IPHONEOS_DEPLOYMENT_TARGET: "15.4",
  MTL_ENABLE_DEBUG_INFO: "INCLUDE_SOURCE",
  MTL_FAST_MATH: "YES",
  ONLY_ACTIVE_ARCH: "YES",
  SDKROOT: "iphoneos",
  SWIFT_ACTIVE_COMPILATION_CONDITIONS: "DEBUG",
  SWIFT_OPTIMIZATION_LEVEL: "-Onone",
  SWIFT_VERSION: "5.9",
  TARGETED_DEVICE_FAMILY: "1,2",
};

const projectDebug = {
  ...projectLevel,
  DEBUG_INFORMATION_FORMAT: "dwarf",
  ENABLE_TESTABILITY: "YES",
  GCC_DYNAMIC_NO_PIC: "NO",
  GCC_OPTIMIZATION_LEVEL: "0",
  GCC_PREPROCESSOR_DEFINITIONS: ["DEBUG=1", "$(inherited)"],
  MTL_ENABLE_DEBUG_INFO: "INCLUDE_SOURCE",
  ONLY_ACTIVE_ARCH: "YES",
  SWIFT_ACTIVE_COMPILATION_CONDITIONS: "DEBUG",
  SWIFT_OPTIMIZATION_LEVEL: "-Onone",
};
const projectRelease = {
  ...projectLevel,
  DEBUG_INFORMATION_FORMAT: "dwarf-with-dsym",
  ENABLE_NS_ASSERTIONS: "NO",
  MTL_ENABLE_DEBUG_INFO: "NO",
  SWIFT_COMPILATION_MODE: "wholemodule",
  SWIFT_OPTIMIZATION_LEVEL: "-O",
  VALIDATE_PRODUCT: "YES",
};
delete projectRelease.ONLY_ACTIVE_ARCH;
delete projectRelease.SWIFT_ACTIVE_COMPILATION_CONDITIONS;

const sharedTarget = {
  CODE_SIGN_STYLE: "Automatic",
  CURRENT_PROJECT_VERSION: "1",
  GENERATE_INFOPLIST_FILE: "NO",
  IPHONEOS_DEPLOYMENT_TARGET: "15.4",
  MARKETING_VERSION: "0.1.0",
  PRODUCT_NAME: "$(TARGET_NAME)",
  SDKROOT: "iphoneos",
  SUPPORTED_PLATFORMS: "iphoneos iphonesimulator",
  SUPPORTS_MACCATALYST: "NO",
  SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD: "NO",
  SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD: "NO",
  SWIFT_EMIT_LOC_STRINGS: "YES",
  SWIFT_VERSION: "5.9",
  TARGETED_DEVICE_FAMILY: "1,2",
  DERIVE_MACCATALYST_PRODUCT_BUNDLE_IDENTIFIER: "NO",
};

const appSettings = {
  ...sharedTarget,
  ASSETCATALOG_COMPILER_APPICON_NAME: "AppIcon",
  ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: "AccentColor",
  CODE_SIGN_ENTITLEMENTS: "PageToPaper/App/PageToPaper.entitlements",
  ENABLE_PREVIEWS: "YES",
  INFOPLIST_FILE: "PageToPaper/App/Info.plist",
  LD_RUNPATH_SEARCH_PATHS: ["$(inherited)", "@executable_path/Frameworks"],
  PRODUCT_BUNDLE_IDENTIFIER: "com.example.pagetopaper",
  PRODUCT_MODULE_NAME: "PageToPaper",
};
const extSettings = {
  ...sharedTarget,
  APPLICATION_EXTENSION_API_ONLY: "YES",
  CODE_SIGN_ENTITLEMENTS: "PageToPaper/Extension/PageToPaperExtension.entitlements",
  INFOPLIST_FILE: "PageToPaper/Extension/Info.plist",
  LD_RUNPATH_SEARCH_PATHS: ["$(inherited)", "@executable_path/Frameworks", "@executable_path/../../Frameworks"],
  PRODUCT_BUNDLE_IDENTIFIER: "com.example.pagetopaper.extension",
  PRODUCT_MODULE_NAME: "PageToPaperExtension",
  SKIP_INSTALL: "YES",
};

function config(name, comment, settings) {
  return add(name, comment, { isa: "XCBuildConfiguration", buildSettings: settings, name: comment });
}

const projDebug = config("proj-debug", "Debug", projectDebug);
const projRelease = config("proj-release", "Release", projectRelease);
const appDebug = config("app-debug", "Debug", appSettings);
const appRelease = config("app-release", "Release", appSettings);
const extDebug = config("ext-debug", "Debug", extSettings);
const extRelease = config("ext-release", "Release", extSettings);

function configList(name, comment, configs, defaultName) {
  return add(name, comment, {
    isa: "XCConfigurationList",
    buildConfigurations: configs.map((item) => ref(item.id, item.comment)),
    defaultConfigurationIsVisible: 0,
    defaultConfigurationName: defaultName,
  });
}

const projList = configList(
  "proj-list",
  "PBXProject configuration list",
  [
    { id: projDebug, comment: "Debug" },
    { id: projRelease, comment: "Release" },
  ],
  "Release",
);
const appList = configList(
  "app-list",
  "PageToPaper configuration list",
  [
    { id: appDebug, comment: "Debug" },
    { id: appRelease, comment: "Release" },
  ],
  "Release",
);
const extList = configList(
  "ext-list",
  "PageToPaperExtension configuration list",
  [
    { id: extDebug, comment: "Debug" },
    { id: extRelease, comment: "Release" },
  ],
  "Release",
);

objects.find((item) => item.id === appTarget).body.buildConfigurationList = ref(appList, "PageToPaper configuration list");
objects.find((item) => item.id === extTarget).body.buildConfigurationList = ref(
  extList,
  "PageToPaperExtension configuration list",
);

const project = {
  id: projectId,
  comment: "Project object",
  body: {
    isa: "PBXProject",
    attributes: {
      BuildIndependentTargetsInParallel: 1,
      LastSwiftUpdateCheck: 1500,
      LastUpgradeCheck: 1500,
      ORGANIZATIONNAME: "Page to Paper",
      TargetAttributes: {
        [appTarget]: { CreatedOnToolsVersion: "15.0" },
        [extTarget]: { CreatedOnToolsVersion: "15.0" },
      },
    },
    buildConfigurationList: ref(projList, "PBXProject configuration list"),
    compatibilityVersion: "Xcode 14.0",
    developmentRegion: "en",
    hasScannedForEncodings: 0,
    knownRegions: ["en", "Base"],
    mainGroup: ref(mainGroup, "Main"),
    productRefGroup: ref(productsGroup, "Products"),
    projectDirPath: "",
    projectRoot: "",
    targets: [ref(appTarget, "PageToPaper"), ref(extTarget, "PageToPaperExtension")],
  },
};
objects.push(project);

const sectionOrder = [
  "PBXBuildFile",
  "PBXContainerItemProxy",
  "PBXCopyFilesBuildPhase",
  "PBXFileReference",
  "PBXFrameworksBuildPhase",
  "PBXGroup",
  "PBXNativeTarget",
  "PBXProject",
  "PBXResourcesBuildPhase",
  "PBXSourcesBuildPhase",
  "PBXTargetDependency",
  "XCBuildConfiguration",
  "XCConfigurationList",
];

const bySection = new Map(sectionOrder.map((name) => [name, []]));
for (const item of objects) {
  const isa = item.body.isa;
  if (!bySection.has(isa)) throw new Error(`unexpected isa ${isa}`);
  bySection.get(isa).push(item);
}

let body = "";
for (const name of sectionOrder) {
  body += `\n/* Begin ${name} section */\n`;
  for (const item of bySection.get(name)) {
    body += `\t\t${item.id} /* ${item.comment} */ = ${fmt(item.body, 2)};\n`;
  }
  body += `/* End ${name} section */\n`;
}

const pbx = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 56;
	objects = {${body}\t};
	rootObject = ${projectId} /* Project object */;
}
`;

const projDir = path.join(root, "PageToPaper.xcodeproj");
fs.mkdirSync(path.join(projDir, "project.xcworkspace"), { recursive: true });
fs.mkdirSync(path.join(projDir, "xcshareddata/xcschemes"), { recursive: true });
fs.writeFileSync(path.join(projDir, "project.pbxproj"), pbx);

const workspace = `<?xml version="1.0" encoding="UTF-8"?>
<Workspace
   version = "1.0">
   <FileRef
      location = "self:">
   </FileRef>
</Workspace>
`;
fs.writeFileSync(path.join(projDir, "project.xcworkspace/contents.xcworkspacedata"), workspace);

const scheme = `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1500"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${appTarget}"
               BuildableName = "PageToPaper.app"
               BlueprintName = "PageToPaper"
               ReferencedContainer = "container:PageToPaper.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "${appTarget}"
            BuildableName = "PageToPaper.app"
            BlueprintName = "PageToPaper"
            ReferencedContainer = "container:PageToPaper.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "${appTarget}"
            BuildableName = "PageToPaper.app"
            BlueprintName = "PageToPaper"
            ReferencedContainer = "container:PageToPaper.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
fs.writeFileSync(path.join(projDir, "xcshareddata/xcschemes/PageToPaper.xcscheme"), scheme);
console.log(`wrote PageToPaper.xcodeproj (app target ${appTarget})`);
