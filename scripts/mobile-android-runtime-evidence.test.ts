import { describe, expect, it } from "vitest";
import {
  canonicalMobileAndroidRuntimeEvidence,
  validateMobileAndroidRuntimeEvidence
} from "./mobile-android-runtime-evidence.mjs";

const sourceHead = "1".repeat(40);
const apkSha256 = "2".repeat(64);

function validEvidence() {
  return {
    schemaVersion: 1,
    sourceHead,
    apkSha256,
    packageName: "com.dwarvendepths.game",
    activityName: "com.dwarvendepths.game/.MainActivity",
    runtime: {
      image: "system-images;android-35;default;x86_64",
      imageRevision: 2,
      apiLevel: 35,
      acceleration: "off",
      viewport: { width: 320, height: 720, densityDpi: 160 }
    },
    observations: {
      checkpointReached: true,
      touchJourneyCompleted: true,
      backgroundPause: true,
      automaticResume: false,
      processRestartPersistence: true,
      terminalResult: "defeat",
      evidenceExport: "blocked-mobile-blob-download",
      internetPermission: false,
      runtimeCrashCount: 0
    }
  };
}

describe("Android packaged-runtime evidence", () => {
  it("accepts and canonically encodes the bounded evaluation result", () => {
    const evidence = validEvidence();
    expect(() =>
      validateMobileAndroidRuntimeEvidence(evidence, {
        expectedApkSha256: apkSha256,
        expectedSourceHead: sourceHead
      })
    ).not.toThrow();
    expect(canonicalMobileAndroidRuntimeEvidence(evidence)).toBe(
      `${JSON.stringify(evidence, null, 2)}\n`
    );
  });

  it("rejects extra properties and noncanonical key ordering", () => {
    expect(() =>
      validateMobileAndroidRuntimeEvidence({ ...validEvidence(), extra: true })
    ).toThrow(/keys must be exactly/);
    const evidence = validEvidence();
    evidence.runtime = {
      apiLevel: 35,
      image: evidence.runtime.image,
      imageRevision: 2,
      acceleration: "off",
      viewport: evidence.runtime.viewport
    };
    expect(() => validateMobileAndroidRuntimeEvidence(evidence)).toThrow(
      /canonical order/
    );
  });

  it("binds the exact source head and APK digest", () => {
    expect(() =>
      validateMobileAndroidRuntimeEvidence(validEvidence(), {
        expectedSourceHead: "3".repeat(40)
      })
    ).toThrow(/evidence source head/);
    expect(() =>
      validateMobileAndroidRuntimeEvidence(validEvidence(), {
        expectedApkSha256: "4".repeat(64)
      })
    ).toThrow(/evidence APK SHA-256/);
  });

  it("rejects incomplete lifecycle, terminal, export, and crash claims", () => {
    const mutations = [
      (evidence: ReturnType<typeof validEvidence>) => {
        evidence.observations.backgroundPause = false;
      },
      (evidence: ReturnType<typeof validEvidence>) => {
        evidence.observations.automaticResume = true;
      },
      (evidence: ReturnType<typeof validEvidence>) => {
        evidence.observations.processRestartPersistence = false;
      },
      (evidence: ReturnType<typeof validEvidence>) => {
        evidence.observations.terminalResult = "timeout";
      },
      (evidence: ReturnType<typeof validEvidence>) => {
        evidence.observations.evidenceExport = "unknown";
      },
      (evidence: ReturnType<typeof validEvidence>) => {
        evidence.observations.internetPermission = true;
      },
      (evidence: ReturnType<typeof validEvidence>) => {
        evidence.observations.runtimeCrashCount = 1;
      }
    ];
    for (const mutate of mutations) {
      const evidence = validEvidence();
      mutate(evidence);
      expect(() => validateMobileAndroidRuntimeEvidence(evidence)).toThrow();
    }
  });
});
