import { readFileSync } from "node:fs";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const HEAD_PATTERN = /^[0-9a-f]{40}$/;
const PACKAGE_NAME = "com.dwarvendepths.game";
const ACTIVITY_NAME = `${PACKAGE_NAME}/.MainActivity`;
const RUNTIME_IMAGE = "system-images;android-35;default;x86_64";

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
  const object = plainObject(value, label);
  const actual = Object.keys(object);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} keys must be exactly ${expected.join(", ")} in canonical order; received ${actual.join(", ")}`
    );
  }
  return object;
}

function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} must be ${JSON.stringify(expected)}`);
  }
}

function trueValue(actual, label) {
  equal(actual, true, label);
}

export function validateMobileAndroidRuntimeEvidence(
  value,
  { expectedApkSha256, expectedSourceHead } = {}
) {
  const evidence = exactKeys(
    value,
    [
      "schemaVersion",
      "sourceHead",
      "apkSha256",
      "packageName",
      "activityName",
      "runtime",
      "observations"
    ],
    "Android runtime evidence"
  );
  equal(evidence.schemaVersion, 1, "evidence schema version");
  if (!HEAD_PATTERN.test(evidence.sourceHead)) {
    throw new Error(
      "source head must be a lowercase 40-character Git object ID"
    );
  }
  if (!SHA256_PATTERN.test(evidence.apkSha256)) {
    throw new Error("APK SHA-256 must be a lowercase 64-character digest");
  }
  if (expectedSourceHead !== undefined) {
    equal(evidence.sourceHead, expectedSourceHead, "evidence source head");
  }
  if (expectedApkSha256 !== undefined) {
    equal(evidence.apkSha256, expectedApkSha256, "evidence APK SHA-256");
  }
  equal(evidence.packageName, PACKAGE_NAME, "Android package name");
  equal(evidence.activityName, ACTIVITY_NAME, "Android activity name");

  const runtime = exactKeys(
    evidence.runtime,
    ["image", "imageRevision", "apiLevel", "acceleration", "viewport"],
    "Android runtime"
  );
  equal(runtime.image, RUNTIME_IMAGE, "Android runtime image");
  equal(runtime.imageRevision, 2, "Android runtime image revision");
  equal(runtime.apiLevel, 35, "Android runtime API level");
  equal(runtime.acceleration, "off", "Android runtime acceleration");
  const viewport = exactKeys(
    runtime.viewport,
    ["width", "height", "densityDpi"],
    "Android runtime viewport"
  );
  equal(viewport.width, 320, "Android runtime viewport width");
  equal(viewport.height, 720, "Android runtime viewport height");
  equal(viewport.densityDpi, 160, "Android runtime density");

  const observations = exactKeys(
    evidence.observations,
    [
      "checkpointReached",
      "touchJourneyCompleted",
      "backgroundPause",
      "automaticResume",
      "processRestartPersistence",
      "terminalResult",
      "evidenceExport",
      "internetPermission",
      "runtimeCrashCount"
    ],
    "Android runtime observations"
  );
  trueValue(observations.checkpointReached, "checkpoint observation");
  trueValue(observations.touchJourneyCompleted, "touch journey observation");
  trueValue(observations.backgroundPause, "background pause observation");
  equal(observations.automaticResume, false, "automatic resume observation");
  trueValue(
    observations.processRestartPersistence,
    "process restart persistence observation"
  );
  if (
    observations.terminalResult !== "victory" &&
    observations.terminalResult !== "defeat"
  ) {
    throw new Error("terminal result must be victory or defeat");
  }
  if (
    observations.evidenceExport !== "downloaded" &&
    observations.evidenceExport !== "blocked-mobile-blob-download"
  ) {
    throw new Error(
      "evidence export must be downloaded or blocked-mobile-blob-download"
    );
  }
  equal(observations.internetPermission, false, "Android internet permission");
  equal(observations.runtimeCrashCount, 0, "Android runtime crash count");
  return evidence;
}

export function canonicalMobileAndroidRuntimeEvidence(value, expectations) {
  const evidence = validateMobileAndroidRuntimeEvidence(value, expectations);
  return `${JSON.stringify(evidence, null, 2)}\n`;
}

export function readMobileAndroidRuntimeEvidence(path, expectations) {
  const source = readFileSync(path, "utf8");
  const parsed = JSON.parse(source);
  const canonical = canonicalMobileAndroidRuntimeEvidence(parsed, expectations);
  if (source !== canonical) {
    throw new Error(
      "Android runtime evidence must use canonical JSON encoding"
    );
  }
  return parsed;
}

export const mobileAndroidRuntimeContract = Object.freeze({
  activityName: ACTIVITY_NAME,
  packageName: PACKAGE_NAME,
  runtimeImage: RUNTIME_IMAGE
});
