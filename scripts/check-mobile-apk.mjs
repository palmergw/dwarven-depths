import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const APP_ID = "com.dwarvendepths.game";
const APP_PERMISSION = `${APP_ID}.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`;

export function validateMobileArtifactMetadata(badging, permissions) {
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
  validateMobileArtifactMetadata(badging, permissions);
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
