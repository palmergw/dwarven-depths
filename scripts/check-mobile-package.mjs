import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const EXPECTED_ACTIVITY = `package com.dwarvendepths.game;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
`;

function plainObject(value, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const actual = Object.keys(plainObject(value, label)).sort();
  const canonical = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(canonical)) {
    throw new Error(
      `${label} keys must be exactly ${canonical.join(", ")}; received ${actual.join(", ")}`
    );
  }
}

function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  }
}

function includes(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label} must contain ${JSON.stringify(expected)}`);
  }
}

export function validateMobilePackage(
  config,
  manifest,
  activity,
  gradle,
  packageManifest,
  webIndex,
  webStyles
) {
  exactKeys(
    config,
    ["appId", "appName", "webDir", "server", "android"],
    "Capacitor config"
  );
  equal(config.appId, "com.dwarvendepths.game", "mobile application ID");
  equal(config.appName, "Dwarven Depths", "mobile application name");
  equal(config.webDir, "../web/dist", "packaged web source");
  exactKeys(
    config.server,
    ["androidScheme", "cleartext"],
    "Capacitor server config"
  );
  equal(config.server.androidScheme, "https", "Android local scheme");
  equal(config.server.cleartext, false, "cleartext transport setting");
  exactKeys(
    config.android,
    ["webContentsDebuggingEnabled"],
    "Capacitor Android config"
  );
  equal(
    config.android.webContentsDebuggingEnabled,
    false,
    "production WebView debugging"
  );

  if (/<uses-permission\b/.test(manifest)) {
    throw new Error("mobile shell may not request Android permissions");
  }
  includes(manifest, 'android:allowBackup="false"', "Android manifest");
  includes(
    manifest,
    'android:usesCleartextTraffic="false"',
    "Android manifest"
  );
  if (
    /android:exported="true"/.test(
      manifest.replace(/<activity[\s\S]*?<\/activity>/, "")
    )
  ) {
    throw new Error("only the launcher activity may be exported");
  }
  equal(activity, EXPECTED_ACTIVITY, "Android activity source");
  includes(
    gradle,
    'namespace = "com.dwarvendepths.game"',
    "Android Gradle config"
  );
  includes(
    gradle,
    'applicationId "com.dwarvendepths.game"',
    "Android Gradle config"
  );
  includes(gradle, "versionCode 1", "Android version code");
  includes(gradle, 'versionName "1.0"', "Android version name");

  exactKeys(
    packageManifest,
    [
      "name",
      "version",
      "private",
      "type",
      "scripts",
      "dependencies",
      "devDependencies"
    ],
    "mobile package manifest"
  );
  exactKeys(
    packageManifest.dependencies,
    ["@capacitor/android", "@capacitor/core"],
    "mobile runtime dependencies"
  );
  exactKeys(
    packageManifest.devDependencies,
    ["@capacitor/cli"],
    "mobile development dependencies"
  );
  equal(
    packageManifest.scripts["mobile:sync"],
    "pnpm --filter @dwarven-depths/web build && cap sync android",
    "mobile sync command"
  );

  includes(webIndex, "viewport-fit=cover", "web viewport metadata");
  includes(webStyles, "env(safe-area-inset-top)", "mobile safe-area styles");
  includes(webStyles, "min-height: 2.75rem", "minimum touch target");
}

export function validateMobilePackageAt(root = ROOT) {
  const mobileRoot = resolve(root, "apps/mobile");
  validateMobilePackage(
    JSON.parse(
      readFileSync(resolve(mobileRoot, "capacitor.config.json"), "utf8")
    ),
    readFileSync(
      resolve(mobileRoot, "android/app/src/main/AndroidManifest.xml"),
      "utf8"
    ),
    readFileSync(
      resolve(
        mobileRoot,
        "android/app/src/main/java/com/dwarvendepths/game/MainActivity.java"
      ),
      "utf8"
    ),
    readFileSync(resolve(mobileRoot, "android/app/build.gradle"), "utf8"),
    JSON.parse(readFileSync(resolve(mobileRoot, "package.json"), "utf8")),
    readFileSync(resolve(root, "apps/web/index.html"), "utf8"),
    readFileSync(resolve(root, "apps/web/src/styles.css"), "utf8")
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    validateMobilePackageAt();
    process.stdout.write(
      `${JSON.stringify({ ok: true, target: "android-debug-apk", authority: "web-worker", sourceManifestPermissions: [] })}\n`
    );
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: "mobile_package_contract_failed",
        message: error instanceof Error ? error.message : String(error)
      })}\n`
    );
    process.exitCode = 1;
  }
}
