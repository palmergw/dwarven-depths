import { describe, expect, it } from "vitest";
import {
  ContentValidationError,
  validateContentBundle,
  validateScenario
} from "./index.js";

const validBundle = {
  schemaVersion: 1,
  contentVersion: "milestone-0",
  definitions: [{ kind: "level", id: "level.empty", waveIds: [] }]
};

describe("content validation", () => {
  it("accepts a minimal level bundle", () => {
    expect(validateContentBundle(validBundle).definitions).toHaveLength(1);
  });

  it("reports the exact duplicate stable ID path", () => {
    expect(() =>
      validateContentBundle({
        ...validBundle,
        definitions: [...validBundle.definitions, validBundle.definitions[0]]
      })
    ).toThrow(ContentValidationError);

    try {
      validateContentBundle({
        ...validBundle,
        definitions: [...validBundle.definitions, validBundle.definitions[0]]
      });
    } catch (error) {
      expect((error as ContentValidationError).issues[0]?.path).toBe(
        "$/definitions/1/id"
      );
    }
  });

  it("rejects unknown fields", () => {
    expect(() =>
      validateContentBundle({ ...validBundle, unexpected: true })
    ).toThrow(/Unrecognized key/);
  });
});

describe("scenario validation", () => {
  it("accepts the empty conformance scenario", () => {
    expect(
      validateScenario({
        schemaVersion: 1,
        id: "scenario.conformance.empty",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 1,
        commands: [{ atTick: 0, type: "confirmPreparation" }],
        expectedTerminalResult: "victory"
      }).id
    ).toBe("scenario.conformance.empty");
  });
});
