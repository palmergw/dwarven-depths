import {
  type CompiledContent,
  compileContent
} from "@dwarven-depths/content-runtime";
import type {
  DwarfTargetPolicy,
  PlacementPointId,
  SimulationState,
  StableId
} from "@dwarven-depths/contracts";
import { createInitialProfile } from "@dwarven-depths/progression";
import {
  createBattlefieldDwarfDeploymentAuthority,
  createInitialState,
  deployBattlefieldDwarves
} from "@dwarven-depths/sim-core";
import { resolveAuthoritativeCombatCheckpoint } from "./authoritative-combat-checkpoint.js";

const referenceManifestHash =
  "5e9d7bcbafb53208cb016432857a912aff9d032f44c2870ada3bc9361e9c5a3f";
const levelId = "level.shuttergate_hall" as StableId;
const wardenCharacterId = "character.iron_warden" as StableId;
const wardenEntityId = "entity.dwarf.warden" as never;
const referencePlacementPointId =
  "placement.shuttergate_north_guard" as PlacementPointId;
const bossEntityId = "entity.enemy.shuttergate_010" as never;
const deepRangerId = "character.deep_ranger" as StableId;
const targetPolicy: DwarfTargetPolicy = "nearest";
const maximumTick = 4_500;

export interface ShuttergateCalibrationMilestone {
  readonly schemaVersion: 1;
  readonly tick: number;
  readonly startedWaveIds: readonly StableId[];
  readonly firedSpawns: number;
  readonly livingEnemies: number;
  readonly wardenHealth: number;
}

export interface ShuttergateReferenceCalibrationEvidence {
  readonly schemaVersion: 1;
  readonly calibrationId: "calibration.shuttergate.unupgraded_warden.v1";
  readonly contentManifestHash: string;
  readonly seed: string;
  readonly levelId: StableId;
  readonly placementPointId: StableId;
  readonly targetPolicy: DwarfTargetPolicy;
  readonly safetyTickLimit: number;
  readonly terminalTick: number;
  readonly terminalResult: "victory" | "defeat";
  readonly terminalReason: string;
  readonly deepestStartedWaveId: StableId;
  readonly firedSpawns: number;
  readonly scheduledSpawns: number;
  readonly defeatedEnemies: number;
  readonly survivingEnemies: number;
  readonly wardenHealth: number;
  readonly wardenLifecycle: "active" | "downed";
  readonly bossRewardClaimed: boolean;
  readonly deepRangerUnlocked: boolean;
  readonly milestones: readonly ShuttergateCalibrationMilestone[];
}

async function requireReferenceContent(
  content: CompiledContent
): Promise<CompiledContent> {
  // Recompile the canonical bundle so neither a forged manifestHash nor
  // caller-substituted compiled indexes can influence calibration gameplay.
  const recompiled = await compileContent(content.bundle);
  if (
    content.manifestHash !== referenceManifestHash ||
    recompiled.manifestHash !== referenceManifestHash
  )
    throw new RangeError(
      "Shuttergate calibration requires the pinned reference content manifest"
    );
  const level = recompiled.levels.get(levelId);
  if (level === undefined || level.waveIds.length !== 5)
    throw new RangeError(
      "Shuttergate calibration requires the five-wave reference level"
    );
  return recompiled;
}

/**
 * Runs the documented unupgraded one-Warden Shuttergate setup through the
 * authoritative combat, reward, and terminal producer path. The result is a
 * compact calibration artifact rather than a second gameplay loop.
 */
export async function runShuttergateSeedPlacementCalibration(
  content: CompiledContent,
  seed: string,
  placementPointId: PlacementPointId
): Promise<ShuttergateReferenceCalibrationEvidence> {
  if (!/^[1-9]\d{0,9}$/.test(seed) || BigInt(seed) > 0xffff_ffffn) {
    throw new RangeError(
      `Shuttergate calibration requires a canonical uint32 seed (${seed})`
    );
  }
  const referenceContent = await requireReferenceContent(content);
  const level = referenceContent.levels.get(levelId);
  const map =
    level?.mapId === undefined
      ? undefined
      : referenceContent.maps.get(level.mapId);
  if (
    map === undefined ||
    !map.placementPoints.some((point) => point.id === placementPointId)
  ) {
    throw new RangeError(
      `Shuttergate calibration requires an authored placement point (${placementPointId})`
    );
  }
  const initial = createInitialState(referenceContent, levelId, seed);
  if (initial.battlefield === undefined)
    throw new Error("Shuttergate calibration requires battlefield state");
  const authority = createBattlefieldDwarfDeploymentAuthority(
    [
      {
        entityId: wardenEntityId,
        characterDefinitionId: wardenCharacterId,
        placementPointId
      }
    ],
    initial.battlefield,
    referenceContent
  );
  let state: SimulationState = Object.freeze({
    ...initial,
    phase: "COMBAT_RUNNING" as const,
    battlefield: deployBattlefieldDwarves(
      initial.battlefield,
      authority,
      referenceContent
    )
  });
  let profile = createInitialProfile(wardenCharacterId);
  const rewards = Object.freeze([
    Object.freeze({
      schemaVersion: 1 as const,
      rewardId: "reward.boss.gatebreaker_captain" as StableId,
      bossEntityId,
      characterUnlockId: deepRangerId,
      forgeOre: 20
    })
  ]);
  const actionEntries = Object.freeze([
    Object.freeze({
      schemaVersion: 1 as const,
      dwarfEntityId: wardenEntityId,
      requestedPolicy: targetPolicy
    })
  ]);
  const milestones: ShuttergateCalibrationMilestone[] = [];
  let previousStartedWaveCount = -1;

  for (let tick = 0; tick <= maximumTick; tick += 1) {
    state = Object.freeze({ ...state, tick });
    const checkpoint = resolveAuthoritativeCombatCheckpoint(
      {
        schemaVersion: 1,
        state,
        dwarfActionEntries: actionEntries,
        profile,
        rewards
      },
      referenceContent,
      authority
    );
    state = checkpoint.combat.state;
    profile = checkpoint.bossRewards.profile;
    const battlefield = state.battlefield;
    if (battlefield === undefined)
      throw new Error("Shuttergate calibration lost battlefield state");
    const warden = battlefield.dwarfCombatants.find(
      (combatant) => combatant.entityId === wardenEntityId
    );
    if (warden === undefined)
      throw new Error("Shuttergate calibration lost the deployed Warden");
    const terminalResult = checkpoint.terminalEvaluation.terminalResult;
    if (
      battlefield.startedWaveIds.length !== previousStartedWaveCount ||
      terminalResult !== undefined
    ) {
      milestones.push(
        Object.freeze({
          schemaVersion: 1,
          tick,
          startedWaveIds: Object.freeze([...battlefield.startedWaveIds]),
          firedSpawns: battlefield.firedSpawnIds.length,
          livingEnemies: battlefield.enemyCombatants.filter(
            (combatant) => combatant.lifecycleState === "active"
          ).length,
          wardenHealth: warden.currentHealth
        })
      );
      previousStartedWaveCount = battlefield.startedWaveIds.length;
    }
    if (terminalResult === undefined) continue;
    const deepestStartedWaveId = battlefield.startedWaveIds.at(-1);
    if (deepestStartedWaveId === undefined)
      throw new Error(
        "Shuttergate calibration terminated before any wave started"
      );
    return Object.freeze({
      schemaVersion: 1,
      calibrationId: "calibration.shuttergate.unupgraded_warden.v1",
      contentManifestHash: referenceContent.manifestHash,
      seed,
      levelId,
      placementPointId,
      targetPolicy,
      safetyTickLimit: maximumTick,
      terminalTick: tick,
      terminalResult,
      terminalReason: checkpoint.terminalEvaluation.reason,
      deepestStartedWaveId,
      firedSpawns: checkpoint.terminalEvaluation.firedSpawns,
      scheduledSpawns: checkpoint.terminalEvaluation.scheduledSpawns,
      defeatedEnemies: battlefield.enemyCombatants.filter(
        (combatant) => combatant.lifecycleState === "destroyed"
      ).length,
      survivingEnemies: checkpoint.terminalEvaluation.livingHostileEnemies,
      wardenHealth: warden.currentHealth,
      wardenLifecycle: warden.lifecycleState,
      bossRewardClaimed: profile.claimedRewardIds.includes(
        "reward.boss.gatebreaker_captain" as StableId
      ),
      deepRangerUnlocked: profile.unlockedCharacterIds.includes(deepRangerId),
      milestones: Object.freeze(milestones)
    });
  }
  throw new RangeError(
    `Shuttergate calibration did not terminate by safety tick ${maximumTick}`
  );
}

export async function runShuttergatePlacementCalibration(
  content: CompiledContent,
  placementPointId: PlacementPointId
): Promise<ShuttergateReferenceCalibrationEvidence> {
  return runShuttergateSeedPlacementCalibration(content, "1", placementPointId);
}

export async function runShuttergateReferenceCalibration(
  content: CompiledContent
): Promise<ShuttergateReferenceCalibrationEvidence> {
  return runShuttergatePlacementCalibration(content, referencePlacementPointId);
}
