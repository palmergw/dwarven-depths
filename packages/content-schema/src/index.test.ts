import { describe, expect, it } from "vitest";
import {
  ContentValidationError,
  validateContentBundle,
  validateReplay,
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
      const issue = (error as ContentValidationError).issues[0];
      expect(issue).toMatchObject({
        path: "$/definitions/1/id",
        relatedPaths: ["$/definitions/0/id"]
      });
      expect(Object.isFrozen(issue?.relatedPaths)).toBe(true);
    }
  });

  it("rejects unknown fields", () => {
    expect(() =>
      validateContentBundle({ ...validBundle, unexpected: true })
    ).toThrow(/Unrecognized key/);
  });

  it("rejects missing and wrong-kind wave references with exact paths", () => {
    for (const definitions of [
      [{ kind: "level", id: "level.test", waveIds: ["wave.missing"] }],
      [
        { kind: "level", id: "level.test", waveIds: ["level.other"] },
        { kind: "level", id: "level.other", waveIds: [] }
      ]
    ]) {
      try {
        validateContentBundle({
          schemaVersion: 1,
          contentVersion: "milestone-0",
          definitions
        });
        throw new Error("expected validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ContentValidationError);
        expect((error as ContentValidationError).issues[0]?.path).toBe(
          "$/definitions/0/waveIds/0"
        );
      }
    }
  });

  it("accepts a level that references an authored wave", () => {
    const result = validateContentBundle({
      schemaVersion: 1,
      contentVersion: "milestone-0",
      definitions: [
        { kind: "level", id: "level.test", waveIds: ["wave.first"] },
        { kind: "wave", id: "wave.first", durationTicks: 30 }
      ]
    });
    expect(result.definitions).toHaveLength(2);
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

  it.each(["0", "01", "4294967296", "999999999999999999999"])(
    "rejects seed %s outside the PRNG domain",
    (seed) => {
      expect(() =>
        validateScenario({
          schemaVersion: 1,
          id: "scenario.conformance.seed",
          levelId: "level.empty",
          seed,
          maximumTicks: 1,
          commands: []
        })
      ).toThrow(/between 1 and 4294967295/);
    }
  );

  it("rejects preparation commands after gameplay tick zero", () => {
    expect(() =>
      validateScenario({
        schemaVersion: 1,
        id: "scenario.conformance.late_preparation",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 2,
        commands: [{ atTick: 1, type: "confirmPreparation" }]
      })
    ).toThrow(/must be scheduled at gameplay tick 0/);
  });

  it("rejects commands outside the tick budget and duplicate commands", () => {
    expect(() =>
      validateScenario({
        schemaVersion: 1,
        id: "scenario.conformance.commands",
        levelId: "level.empty",
        seed: "1",
        maximumTicks: 1,
        commands: [
          { atTick: 1, type: "confirmPreparation" },
          { atTick: 1, type: "confirmPreparation" }
        ]
      })
    ).toThrow(/less than maximumTicks.*duplicates an earlier/s);
  });
});

const checksum = "0".repeat(64);
const validReplay = {
  schemaVersion: 1,
  simulationSchemaVersion: 1,
  contentVersion: "milestone-0",
  contentManifestHash: checksum,
  scenarioId: "scenario.conformance.empty",
  scenarioHash: checksum,
  levelId: "level.empty",
  seed: "1",
  rngAlgorithm: "xorshift32-v1",
  commands: [
    {
      tick: 0,
      sequence: 0,
      command: { atTick: 0, type: "confirmPreparation" }
    }
  ],
  checkpoints: [
    {
      tick: 0,
      stateChecksum: checksum,
      eventStreamChecksum: checksum
    }
  ],
  expectedTerminalResult: "victory",
  expectedTerminalTick: 0
};

describe("replay validation", () => {
  it("accepts the minimal versioned replay contract", () => {
    const replay = validateReplay(validReplay);
    expect(replay).toMatchObject({
      schemaVersion: 1,
      rngAlgorithm: "xorshift32-v1",
      expectedTerminalResult: "victory"
    });
  });

  it("rejects malformed checksums and unknown fields", () => {
    expect(() =>
      validateReplay({
        ...validReplay,
        contentManifestHash: "ABC",
        unexpected: true
      })
    ).toThrow(/SHA-256.*Unrecognized key/s);
  });

  it("rejects command-envelope mismatches with exact paths", () => {
    try {
      validateReplay({
        ...validReplay,
        commands: [
          {
            tick: 1,
            sequence: 4,
            command: { atTick: 0, type: "confirmPreparation" }
          }
        ]
      });
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ContentValidationError);
      expect((error as ContentValidationError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "$/commands/0/sequence",
            code: "invalid_command_sequence"
          }),
          expect.objectContaining({
            path: "$/commands/0/tick",
            code: "command_tick_mismatch"
          })
        ])
      );
    }
  });

  it("requires exactly one checkpoint ending at the terminal tick", () => {
    expect(() =>
      validateReplay({
        ...validReplay,
        checkpoints: [
          { tick: 0, stateChecksum: checksum, eventStreamChecksum: checksum },
          { tick: 1, stateChecksum: checksum, eventStreamChecksum: checksum }
        ]
      })
    ).toThrow(/exactly one terminal checkpoint/);

    expect(() =>
      validateReplay({
        ...validReplay,
        checkpoints: [
          { tick: 1, stateChecksum: checksum, eventStreamChecksum: checksum }
        ],
        expectedTerminalTick: 2
      })
    ).toThrow(/final checkpoint tick/);
  });
});
