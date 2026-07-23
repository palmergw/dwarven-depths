import { describe, expect, it } from "vitest";
import {
  ContentValidationError,
  compileContent,
  compileReplay,
  compileScenario
} from "./index.js";

describe("content compilation", () => {
  it("sorts definitions and builds kind-specific indexes", async () => {
    const content = await compileContent({
      schemaVersion: 1,
      contentVersion: "test",
      definitions: [
        { kind: "wave", id: "wave.first", durationTicks: 30 },
        { kind: "level", id: "level.first", waveIds: ["wave.first"] }
      ]
    });

    expect(
      content.bundle.definitions.map((definition) => definition.id)
    ).toEqual(["level.first", "wave.first"]);
    expect(content.levels.has("level.first" as never)).toBe(true);
    expect(content.waves.has("wave.first" as never)).toBe(true);
    expect(Object.isFrozen(content.bundle)).toBe(true);
    expect(Object.isFrozen(content.bundle.definitions)).toBe(true);
    expect(Object.isFrozen(content.bundle.definitions[0])).toBe(true);
    expect("set" in content.levels).toBe(false);

    const scenario = compileScenario(
      {
        schemaVersion: 1,
        id: "scenario.test.first",
        levelId: "level.first",
        seed: "1",
        maximumTicks: 1,
        commands: [{ atTick: 0, type: "confirmPreparation" }]
      },
      content
    );
    expect(Object.isFrozen(scenario)).toBe(true);
    expect(Object.isFrozen(scenario.commands)).toBe(true);
    expect(Object.isFrozen(scenario.commands[0])).toBe(true);
  });

  it("freezes replay commands and checkpoints", () => {
    const checksum = "0".repeat(64);
    const replay = compileReplay({
      schemaVersion: 1,
      simulationSchemaVersion: 1,
      contentVersion: "test",
      contentManifestHash: checksum,
      scenarioId: "scenario.test.replay",
      scenarioHash: checksum,
      levelId: "level.test",
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
    });

    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.commands)).toBe(true);
    expect(Object.isFrozen(replay.commands[0])).toBe(true);
    expect(Object.isFrozen(replay.commands[0]?.command)).toBe(true);
    expect(Object.isFrozen(replay.checkpoints)).toBe(true);
    expect(Object.isFrozen(replay.checkpoints[0])).toBe(true);
  });

  it("reports unknown scenario levels as validation issues", async () => {
    const content = await compileContent({
      schemaVersion: 1,
      contentVersion: "test",
      definitions: []
    });

    expect(() =>
      compileScenario(
        {
          schemaVersion: 1,
          id: "scenario.test.missing_level",
          levelId: "level.missing",
          seed: "1",
          maximumTicks: 1,
          commands: []
        },
        content
      )
    ).toThrowError(ContentValidationError);

    try {
      compileScenario(
        {
          schemaVersion: 1,
          id: "scenario.test.missing_level",
          levelId: "level.missing",
          seed: "1",
          maximumTicks: 1,
          commands: []
        },
        content
      );
    } catch (error) {
      expect((error as ContentValidationError).issues).toEqual([
        {
          path: "$/levelId",
          code: "unknown_reference",
          message: "references unknown level ID (level.missing)"
        }
      ]);
    }
  });
});
