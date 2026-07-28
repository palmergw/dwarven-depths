import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const APP_ID = "com.dwarvendepths.game";
const APP_PERMISSION = `${APP_ID}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;
const SIGNER_SHA256 =
  "3fe8701446bc27a303d3a8caa19737cc231860698dbc83eb87ad9da26f6b2031";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function productionAssetHashes(root, relative = "", result = new Map()) {
  for (const entry of readdirSync(resolve(root, relative), {
    withFileTypes: true
  })) {
    const child =
      relative.length === 0 ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) productionAssetHashes(root, child, result);
    else if (entry.isFile())
      result.set(child, sha256(readFileSync(resolve(root, child))));
    else throw new Error(`production web asset must be a file: ${child}`);
  }
  return result;
}

function expectedPackagedAssetHashes(root) {
  const result = productionAssetHashes(root);
  const emptyHash = sha256(Buffer.alloc(0));
  result.set("cordova.js", emptyHash);
  result.set("cordova_plugins.js", emptyHash);
  return result;
}

function packagedAssetHashes(apk) {
  const prefix = "assets/public/";
  const entries = execFileSync("unzip", ["-Z1", apk], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  })
    .trim()
    .split("\n")
    .filter((entry) => entry.startsWith(prefix) && !entry.endsWith("/"));
  return new Map(
    entries.map((entry) => [
      entry.slice(prefix.length),
      sha256(
        execFileSync("unzip", ["-p", apk, entry], {
          maxBuffer: 32 * 1024 * 1024
        })
      )
    ])
  );
}

export function validatePackagedWebAssets(packaged, production) {
  const packagedEntries = [...packaged.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
  const productionEntries = [...production.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  );
  if (JSON.stringify(packagedEntries) !== JSON.stringify(productionEntries)) {
    throw new Error(
      "mobile APK web assets must exactly match the production web output"
    );
  }
}

function manifestComponents(manifestTree) {
  const lines = manifestTree.split("\n");
  const components = [];
  for (let index = 0; index < lines.length; index += 1) {
    const element =
      /^(\s*)E: (activity|activity-alias|provider|receiver|service)\b/.exec(
        lines[index]
      );
    if (element === null) continue;
    const indent = element[1].length;
    const attributes = [];
    for (let child = index + 1; child < lines.length; child += 1) {
      const childIndent = /^\s*/.exec(lines[child])?.[0].length ?? 0;
      if (lines[child].trim().length > 0 && childIndent <= indent) break;
      attributes.push(lines[child]);
    }
    const block = attributes.join("\n");
    const name = /:name(?:\([^)]*\))?="([^"]+)"/.exec(block)?.[1];
    const exported = /:exported(?:\([^)]*\))?=(true|false)/.exec(block)?.[1];
    const authorities = /:authorities(?:\([^)]*\))?="([^"]+)"/.exec(block)?.[1];
    components.push(
      `${element[2]}:${name ?? "missing-name"}:${exported ?? "implicit"}:${authorities ?? "none"}`
    );
  }
  return components.sort();
}

export function validateMobileArtifactMetadata(
  badging,
  permissions,
  manifestTree,
  signerCertificates = `Signer #1 certificate SHA-256 digest: ${SIGNER_SHA256}`
) {
  const packageLine = badging.split("\n")[0] ?? "";
  if (!packageLine.includes(`name='${APP_ID}'`)) {
    throw new Error("mobile APK application ID mismatch");
  }
  if (!packageLine.includes("versionCode='1' versionName='1.0'")) {
    throw new Error("mobile APK version mismatch");
  }
  if (!badging.includes("targetSdkVersion:'36'")) {
    throw new Error("mobile APK target SDK mismatch");
  }
  if (!badging.includes("application-debuggable")) {
    throw new Error(
      "mobile evaluation must remain an explicitly debug-only artifact"
    );
  }
  if (
    !badging.includes(
      "launchable-activity: name='com.dwarvendepths.game.MainActivity'"
    )
  ) {
    throw new Error("mobile APK launcher activity mismatch");
  }

  const permissionLines = permissions.trim().split("\n");
  const expected = [
    `package: ${APP_ID}`,
    `permission: ${APP_PERMISSION}`,
    `uses-permission: name='${APP_PERMISSION}'`
  ];
  if (JSON.stringify(permissionLines) !== JSON.stringify(expected)) {
    throw new Error(
      `mobile APK permissions must contain only the app-scoped signature guard; received ${permissionLines.join(", ")}`
    );
  }

  if (/grantUriPermissions(?:\([^)]*\))?=true/.test(manifestTree)) {
    throw new Error("mobile APK may not grant content URI permissions");
  }
  const components = manifestComponents(manifestTree);
  const expectedComponents = [
    "activity:com.dwarvendepths.game.MainActivity:true:none",
    "provider:androidx.startup.InitializationProvider:false:com.dwarvendepths.game.androidx-startup"
  ];
  if (JSON.stringify(components) !== JSON.stringify(expectedComponents)) {
    throw new Error(
      `mobile APK components must match the authority-free shell; received ${components.join(", ")}`
    );
  }
  const signerDigests = [
    ...signerCertificates.matchAll(
      /Signer #[0-9]+ certificate SHA-256 digest: ([a-f0-9]{64})/g
    )
  ].map((match) => match[1]);
  if (JSON.stringify(signerDigests) !== JSON.stringify([SIGNER_SHA256])) {
    throw new Error("mobile APK evaluation signing identity mismatch");
  }
}

export function validateMobileArtifactAt(
  apk = resolve(ROOT, ".ddh/mobile-package/dwarven-depths-debug.apk"),
  androidHome = process.env.ANDROID_HOME
) {
  if (androidHome === undefined) {
    throw new Error("ANDROID_HOME is required to inspect the mobile APK");
  }
  const aapt = resolve(androidHome, "build-tools/35.0.1/aapt2");
  const badging = execFileSync(aapt, ["dump", "badging", apk], {
    encoding: "utf8"
  });
  const permissions = execFileSync(aapt, ["dump", "permissions", apk], {
    encoding: "utf8"
  });
  const manifestTree = execFileSync(
    aapt,
    ["dump", "xmltree", "--file", "AndroidManifest.xml", apk],
    { encoding: "utf8" }
  );
  const apksigner = resolve(androidHome, "build-tools/35.0.1/apksigner");
  const signerCertificates = execFileSync(
    apksigner,
    ["verify", "--print-certs", apk],
    { encoding: "utf8" }
  );
  validateMobileArtifactMetadata(
    badging,
    permissions,
    manifestTree,
    signerCertificates
  );
  validatePackagedWebAssets(
    packagedAssetHashes(apk),
    expectedPackagedAssetHashes(resolve(ROOT, "apps/web/dist"))
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    validateMobileArtifactAt(process.argv[2]);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        target: "android-debug-apk",
        systemPermissions: [],
        appScopedSignaturePermissions: [APP_PERMISSION]
      })}\n`
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: "mobile_artifact_contract_failed",
        message: error instanceof Error ? error.message : String(error)
      })}\n`
    );
    process.exitCode = 1;
  }
}
