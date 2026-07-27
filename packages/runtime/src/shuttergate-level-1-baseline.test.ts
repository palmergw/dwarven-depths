import { compileContent } from "@dwarven-depths/content-runtime";
import { describe, expect, it } from "vitest";
import baselineInput from "../../../content/calibration/shuttergate-level-1-reference-v1.json" with {
  type: "json"
};
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  assertShuttergateCalibrationMatchesBaseline,
  requireShuttergateLevel1Baseline
} from "./shuttergate-level-1-baseline.js";
import { runShuttergateReferenceCalibration } from "./shuttergate-reference-calibration.js";

describe("Shuttergate Level 1 reference baseline", () => {
  it("accepts the authoritative reference calibration", async () => {
    const baseline = requireShuttergateLevel1Baseline(baselineInput);
    const content = await compileContent(shuttergateInput);
    const evidence = await runShuttergateReferenceCalibration(content);

    expect(() =>
      assertShuttergateCalibrationMatchesBaseline(evidence, baseline)
    ).not.toThrow();
    expect(Object.isFrozen(baseline)).toBe(true);
    expect(Object.isFrozen(baseline.ranges)).toBe(true);
    expect(Object.isFrozen(baseline.ranges.terminalTick)).toBe(true);
  }, 15_000);

  it("rejects malformed, unknown-field, and accessor-backed baseline data", () => {
    expect(() =>
      requireShuttergateLevel1Baseline({ ...baselineInput, schemaVersion: 2 })
    ).toThrow("requires schema version 1");
    expect(() =>
      requireShuttergateLevel1Baseline({ ...baselineInput, unexpected: true })
    ).toThrow("invalid fields");

    const accessorBaseline = structuredClone(baselineInput) as Record<
      string,
      unknown
    >;
    Object.defineProperty(accessorBaseline, "seed", {
      enumerable: true,
      get: () => "1"
    });
    expect(() => requireShuttergateLevel1Baseline(accessorBaseline)).toThrow(
      "plain data properties"
    );
  });

  it("rejects mismatched identity and out-of-range evidence", async () => {
    const baseline = requireShuttergateLevel1Baseline(baselineInput);
    const content = await compileContent(shuttergateInput);
    const evidence = await runShuttergateReferenceCalibration(content);

    expect(() =>
      assertShuttergateCalibrationMatchesBaseline(
        { ...evidence, contentManifestHash: "0".repeat(64) },
        baseline
      )
    ).toThrow("content manifest mismatch");
    expect(() =>
      assertShuttergateCalibrationMatchesBaseline(
        { ...evidence, terminalTick: baseline.ranges.terminalTick.maximum + 1 },
        baseline
      )
    ).toThrow("terminalTick");
  }, 15_000);

  it("rejects reversed and nonpositive ranges", () => {
    expect(() =>
      requireShuttergateLevel1Baseline({
        ...baselineInput,
        ranges: {
          ...baselineInput.ranges,
          terminalTick: { minimum: 2, maximum: 1 }
        }
      })
    ).toThrow("minimum exceeds maximum");
    expect(() =>
      requireShuttergateLevel1Baseline({
        ...baselineInput,
        ranges: {
          ...baselineInput.ranges,
          firedSpawns: { minimum: 0, maximum: 9 }
        }
      })
    ).toThrow("positive safe integer");
  });
});
