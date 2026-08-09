import { compileContent } from "@dwarven-depths/content-runtime";
import { type ContentBundle, canonicalHash } from "@dwarven-depths/contracts";
import * as progressionPublicApi from "@dwarven-depths/progression";
import { describe, expect, it } from "vitest";
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import {
  runShuttergateAttempt,
  runShuttergatePlacementCalibration,
  runShuttergateReferenceCalibration,
  runShuttergateSeedPlacementCalibration,
  runShuttergateSeedPlacementControllerBuildCalibration,
  runShuttergateSeedPlacementControllerCalibration
} from "./shuttergate-reference-calibration.js";

export const shuttergateCalibrationChecksum =
  "6ab8bd8643a045d1d8b25969107ad3275a533ca66f421d018d59205f2a143bf2";

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
  }, 15_000);

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
        "431bf145c82caf64f6c544c7516fafef6b50319ecb8277a748123dc3da6bb60d"
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
      "510ec9b3a35b245a6901f4963fbd5cd0106c400064f95c01c50d65d882f9b904"
    );
  }, 15_000);

  it("binds a selected sweep seed into placement calibration evidence", async () => {
    const content = await compileContent(shuttergateInput);
    const evidence = await runShuttergateSeedPlacementCalibration(
      content,
      "2",
      "placement.shuttergate_north_guard" as never
    );

    expect(evidence).toMatchObject({
      seed: "2",
      placementPointId: "placement.shuttergate_north_guard",
      terminalResult: "defeat",
      terminalTick: 1_833
    });
    expect(await canonicalHash(evidence)).toBe(
      "c82c9d931afcc6d17a9b71b6b776acad4f8d41690e7529fb50315bc2c119a671"
    );
    await expect(
      runShuttergateSeedPlacementCalibration(
        content,
        "0",
        "placement.shuttergate_north_guard" as never
      )
    ).rejects.toThrow("canonical uint32 seed (0)");
  }, 15_000);

  it("binds an authored target-policy controller into calibration evidence", async () => {
    const content = await compileContent(shuttergateInput);
    const evidence = await runShuttergateSeedPlacementControllerCalibration(
      content,
      "2",
      "placement.shuttergate_north_guard" as never,
      "lowest_health"
    );

    expect(evidence).toMatchObject({
      seed: "2",
      placementPointId: "placement.shuttergate_north_guard",
      targetPolicy: "lowest_health",
      terminalResult: "defeat"
    });
    expect(await canonicalHash(evidence)).toBe(
      "58e799fb40ee20696d00b3f4fad973f1987a01ece38645f5127f8ea55d41bcb2"
    );
  }, 15_000);

  it("binds purchased passive build effects into authoritative calibration", async () => {
    const content = await compileContent(shuttergateInput);
    const unupgraded =
      await runShuttergateSeedPlacementControllerBuildCalibration(
        content,
        "2",
        "placement.shuttergate_north_guard" as never,
        "nearest",
        "build.profile.new_campaign.v1"
      );
    const upgraded =
      await runShuttergateSeedPlacementControllerBuildCalibration(
        content,
        "2",
        "placement.shuttergate_north_guard" as never,
        "nearest",
        "build.warden.shield_slam_rank_1.v1"
      );

    expect(unupgraded).toMatchObject({
      schemaVersion: 2,
      calibrationId: "calibration.shuttergate.warden_build.v1",
      buildId: "build.profile.new_campaign.v1",
      deployedWardenMaximumHealth: 240,
      deployedWardenAttackDamage: 18,
      purchasedModifiers: []
    });
    expect(upgraded).toMatchObject({
      schemaVersion: 2,
      buildId: "build.warden.shield_slam_rank_1.v1",
      deployedWardenMaximumHealth: 1000,
      deployedWardenAttackDamage: 20,
      purchasedModifiers: [
        {
          characterId: "character.iron_warden",
          maximumHealthAdd: 760,
          attackDamageAdd: 2,
          sourceUpgradeIds: ["upgrade.ability.shield_slam"]
        }
      ]
    });
    expect(upgraded.terminalTick).toBeGreaterThan(unupgraded.terminalTick);
    expect(Object.isFrozen(upgraded.purchasedModifiers)).toBe(true);
    expect(await canonicalHash(unupgraded)).toBe(
      "d9c405406faaf57b474cc17404b21aef95f0a4ac6ccf10cd66bfb9ae61570e82"
    );
    expect(await canonicalHash(upgraded)).toBe(
      "f58bc024c5f583593bd2eb434b04bac0abf093d92b2c7870435d02f5595ee42e"
    );
  }, 60_000);

  it("produces attempt reward evidence from the authoritative encounter", async () => {
    const content = await compileContent(shuttergateInput);
    const result = await runShuttergateAttempt(content, {
      schemaVersion: 1,
      attemptId: "attempt.shuttergate.a0001" as never,
      seed: "1",
      placementPointId: "placement.shuttergate_north_guard" as never,
      targetPolicy: "nearest",
      buildId: "build.profile.new_campaign.v1"
    });

    expect(result.rewardEvent).toEqual({
      schemaVersion: 1,
      rewardId: "reward.attempt.shuttergate.a0001",
      attemptId: "attempt.shuttergate.a0001",
      levelId: "level.shuttergate_hall",
      terminalResult: "defeat",
      defeatedEnemies: result.calibration.defeatedEnemies,
      startedWaveIds: [
        "wave.shuttergate_1",
        "wave.shuttergate_2",
        "wave.shuttergate_3"
      ]
    });
    expect(result.calibration.terminalResult).toBe(
      result.rewardEvent.terminalResult
    );
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rewardEvent.startedWaveIds)).toBe(true);
    expect(await canonicalHash(result.rewardEvent)).toBe(
      "562b435c2f90110cdf3fa6b6a5bcf48676777ba6b7a1d6b132624054db50dcff"
    );
    expect("resolveAttemptProgressRewards" in progressionPublicApi).toBe(false);

    const upgradedKeep = await runShuttergateAttempt(content, {
      schemaVersion: 1,
      attemptId: "attempt.shuttergate.a0002" as never,
      seed: "2",
      placementPointId: "placement.shuttergate_keep_guard" as never,
      targetPolicy: "lowest_health",
      buildId: "build.warden.shield_slam_rank_1.v1"
    });
    expect(upgradedKeep.rewardEvent).toMatchObject({
      rewardId: "reward.attempt.shuttergate.a0002",
      attemptId: "attempt.shuttergate.a0002",
      defeatedEnemies: upgradedKeep.calibration.defeatedEnemies,
      terminalResult: upgradedKeep.calibration.terminalResult
    });
    expect(upgradedKeep.calibration).toMatchObject({
      placementPointId: "placement.shuttergate_keep_guard",
      targetPolicy: "lowest_health",
      buildId: "build.warden.shield_slam_rank_1.v1"
    });
  }, 30_000);

  it("rejects malformed attempt identity before compiling encounter content", async () => {
    const content = await compileContent(shuttergateInput);
    const forgedContent = {
      ...content,
      bundle: { ...content.bundle, schemaVersion: 999 }
    } as never;

    await expect(
      runShuttergateAttempt(forgedContent, {
        schemaVersion: 1,
        attemptId: "attempt.INVALID" as never,
        seed: "1",
        placementPointId: "placement.shuttergate_north_guard" as never,
        targetPolicy: "nearest",
        buildId: "build.profile.new_campaign.v1"
      })
    ).rejects.toThrow("canonical attempt ID");
  });

  it("rejects accessor-backed attempt identity before encounter execution", async () => {
    const content = await compileContent(shuttergateInput);
    const request = {
      schemaVersion: 1,
      seed: "1",
      placementPointId: "placement.shuttergate_north_guard",
      targetPolicy: "nearest",
      buildId: "build.profile.new_campaign.v1"
    } as Record<string, unknown>;
    Object.defineProperty(request, "attemptId", {
      enumerable: true,
      get: () => "attempt.shuttergate.a0001"
    });

    await expect(
      runShuttergateAttempt(content, request as never)
    ).rejects.toThrow("plain data properties");
  });

  it("rejects hidden and symbol attempt request fields", async () => {
    const content = await compileContent(shuttergateInput);
    const request = {
      schemaVersion: 1,
      attemptId: "attempt.shuttergate.a0001",
      seed: "1",
      placementPointId: "placement.shuttergate_north_guard",
      targetPolicy: "nearest",
      buildId: "build.profile.new_campaign.v1"
    } as Record<PropertyKey, unknown>;
    Object.defineProperty(request, "hidden", { value: true });
    request[Symbol("hidden")] = true;

    await expect(
      runShuttergateAttempt(content, request as never)
    ).rejects.toThrow("invalid fields");
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
  }, 15_000);
});
