import { compileContent } from "@dwarven-depths/content-runtime";
import { type ContentBundle, canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  runShuttergatePlacementCalibration,
  runShuttergateReferenceCalibration
} from "./shuttergate-reference-calibration.js";

export const shuttergateCalibrationChecksum =
  "4076169e8e506f82e5e1825ecd5a9cab210245a053edf7ebc12a0475ba4dd669";

describe("Shuttergate reference balance calibration", () => {
  it("records the bounded unupgraded one-Warden defeat", async () => {
    const content = await compileContent(shuttergateInput);
    const evidence = await runShuttergateReferenceCalibration(content);

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      calibrationId: "calibration.shuttergate.unupgraded_warden.v1",
      seed: "1",
      levelId: "level.shuttergate_hall",
      placementPointId: "placement.shuttergate_north_guard",
      targetPolicy: "nearest",
      terminalResult: "defeat",
      terminalReason: "all_dwarves_downed",
      deepestStartedWaveId: "wave.shuttergate_3",
      scheduledSpawns: 18,
      wardenHealth: 0,
      wardenLifecycle: "downed",
      bossRewardClaimed: false,
      deepRangerUnlocked: false
    });
    // Calibration bands express design intent without making every balance
    // number an exact mechanics contract.
    expect(evidence.terminalTick).toBeGreaterThanOrEqual(1_800);
    expect(evidence.terminalTick).toBeLessThan(2_700);
    expect(evidence.firedSpawns).toBeGreaterThanOrEqual(7);
    expect(evidence.firedSpawns).toBeLessThan(10);
    expect(evidence.defeatedEnemies).toBeGreaterThanOrEqual(4);
    expect(evidence.survivingEnemies).toBeGreaterThan(0);
    expect(evidence.milestones.map((milestone) => milestone.tick)).toEqual([
      0,
      900,
      1_800,
      evidence.terminalTick
    ]);
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.milestones)).toBe(true);
    expect(
      evidence.milestones.every(
        (milestone) =>
          Object.isFrozen(milestone) &&
          Object.isFrozen(milestone.startedWaveIds)
      )
    ).toBe(true);
    expect(await canonicalHash(evidence)).toBe(shuttergateCalibrationChecksum);
  });

  it("rejects content other than the pinned reference manifest", async () => {
    const source = structuredClone(
      shuttergateInput
    ) as unknown as ContentBundle;
    const changedInput: ContentBundle = {
      ...source,
      definitions: source.definitions.map((definition) =>
        definition.id === "character.iron_warden" &&
        definition.kind === "character"
          ? { ...definition, maximumHealth: 241 }
          : definition
      )
    };
    const content = await compileContent(changedInput);
    const forgedManifest = {
      ...content,
      manifestHash:
        "5e9d7bcbafb53208cb016432857a912aff9d032f44c2870ada3bc9361e9c5a3f"
    };

    await expect(
      runShuttergateReferenceCalibration(forgedManifest)
    ).rejects.toThrow("pinned reference content manifest");
  });

  it("runs each authored Warden placement through the same authority", async () => {
    const content = await compileContent(shuttergateInput);
    const keepGuard = await runShuttergatePlacementCalibration(
      content,
      "placement.shuttergate_keep_guard" as never
    );

    expect(keepGuard).toMatchObject({
      schemaVersion: 1,
      placementPointId: "placement.shuttergate_keep_guard",
      terminalTick: 1_869,
      terminalResult: "defeat",
      terminalReason: "all_dwarves_downed",
      deepestStartedWaveId: "wave.shuttergate_3",
      firedSpawns: 7,
      defeatedEnemies: 5,
      survivingEnemies: 2,
      wardenHealth: 0,
      wardenLifecycle: "downed",
      bossRewardClaimed: false,
      deepRangerUnlocked: false
    });
    expect(Object.isFrozen(keepGuard)).toBe(true);
    expect(Object.isFrozen(keepGuard.milestones)).toBe(true);
    expect(await canonicalHash(keepGuard)).toBe(
      "e49176bf2a18740ab8d0b4a5aed12bd6be4fca0abc170ca239b320930d391391"
    );
  });

  it("rejects placement points outside the pinned Shuttergate map", async () => {
    const content = await compileContent(shuttergateInput);

    await expect(
      runShuttergatePlacementCalibration(
        content,
        "placement.some_other_map" as never
      )
    ).rejects.toThrow(
      "requires an authored placement point (placement.some_other_map)"
    );
  });

  it("recompiles canonical bundle data instead of trusting supplied indexes", async () => {
    const content = await compileContent(shuttergateInput);
    const forgedIndexes = {
      ...content,
      levels: new Map(),
      waves: new Map(),
      maps: new Map(),
      characters: new Map(),
      enemies: new Map()
    } as typeof content;

    const evidence = await runShuttergateReferenceCalibration(forgedIndexes);
    expect(await canonicalHash(evidence)).toBe(shuttergateCalibrationChecksum);
  });
});
