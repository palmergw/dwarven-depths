import type { CompiledContent } from "@dwarven-depths/content-runtime";
import type {
  DwarfTargetPolicy,
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
const placementPointId = "placement.shuttergate_north_guard" as never;
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
  readonly seed: "1";
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

function requireReferenceContent(content: CompiledContent): void {
  if (content.manifestHash !== referenceManifestHash)
    throw new RangeError(
      "Shuttergate calibration requires the pinned reference content manifest"
    );
  const level = content.levels.get(levelId);
  if (level === undefined || level.waveIds.length !== 5)
    throw new RangeError(
      "Shuttergate calibration requires the five-wave reference level"
    );
}

/**
 * Runs the documented unupgraded one-Warden Shuttergate setup through the
 * authoritative combat, reward, and terminal producer path. The result is a
 * compact calibration artifact rather than a second gameplay loop.
 */
export function runShuttergateReferenceCalibration(
  content: CompiledContent
): ShuttergateReferenceCalibrationEvidence {
  requireReferenceContent(content);
  const initial = createInitialState(content, levelId, "1");
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
    content
  );
  let state: SimulationState = Object.freeze({
    ...initial,
    phase: "COMBAT_RUNNING" as const,
    battlefield: deployBattlefieldDwarves(
      initial.battlefield,
      authority,
      content
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
      content,
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
      contentManifestHash: content.manifestHash,
      seed: "1",
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
