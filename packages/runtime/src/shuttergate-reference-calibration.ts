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
import {
  type CompletedAttemptRewardEvent,
  createInitialProfile,
  type PurchasedUpgradeCatalog,
  type PurchasedUpgradeCharacterModifiers,
  purchaseUpgradeRank
} from "@dwarven-depths/progression";
import {
  createBattlefieldDwarfDeploymentAuthority,
  createInitialState,
  deployBattlefieldDwarves
} from "@dwarven-depths/sim-core";
import { resolveAuthoritativeCombatCheckpoint } from "./authoritative-combat-checkpoint.js";
import { deployBattlefieldDwarvesWithPurchasedUpgradeEffects } from "./battlefield-purchased-upgrade-effects.js";

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
const targetPolicies: readonly DwarfTargetPolicy[] = Object.freeze([
  "nearest",
  "lowest_health",
  "highest_health",
  "highest_armor",
  "fastest",
  "boss_or_elite_first"
]);
const maximumTick = 4_500;
const shieldSlamUpgradeId = "upgrade.ability.shield_slam" as StableId;
export const shuttergateReferenceBuildCatalog: PurchasedUpgradeCatalog =
  Object.freeze({
    schemaVersion: 1,
    upgrades: Object.freeze([
      Object.freeze({
        schemaVersion: 1,
        upgradeId: shieldSlamUpgradeId,
        kind: "ability_rank" as const,
        ownerId: wardenCharacterId,
        prerequisiteUpgradeIds: Object.freeze([]),
        rankCosts: Object.freeze([10]),
        passiveEffectsByRank: Object.freeze([
          Object.freeze([
            Object.freeze({
              schemaVersion: 1,
              kind: "maximum_health_add" as const,
              value: 20
            }),
            Object.freeze({
              schemaVersion: 1,
              kind: "attack_damage_add" as const,
              value: 2
            })
          ])
        ])
      })
    ])
  });

export type ShuttergateCalibrationBuildId =
  | "build.profile.new_campaign.v1"
  | "build.warden.shield_slam_rank_1.v1";

export const shuttergateCalibrationBuildIds = Object.freeze([
  "build.profile.new_campaign.v1",
  "build.warden.shield_slam_rank_1.v1"
] as const satisfies readonly ShuttergateCalibrationBuildId[]);
const referenceSkillTrees = Object.freeze([
  Object.freeze({
    schemaVersion: 1 as const,
    characterId: wardenCharacterId,
    nodes: Object.freeze([
      Object.freeze({
        schemaVersion: 1 as const,
        nodeId: "skill.iron_warden.calibration_placeholder" as StableId,
        prerequisiteNodeIds: Object.freeze([]),
        effects: Object.freeze([
          Object.freeze({
            schemaVersion: 1 as const,
            kind: "maximum_health_add" as const,
            value: 1
          })
        ])
      })
    ])
  })
]);

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

export interface ShuttergateBuildCalibrationEvidence
  extends Omit<
    ShuttergateReferenceCalibrationEvidence,
    "schemaVersion" | "calibrationId"
  > {
  readonly schemaVersion: 2;
  readonly calibrationId: "calibration.shuttergate.warden_build.v1";
  readonly buildId: ShuttergateCalibrationBuildId;
  readonly deployedWardenMaximumHealth: number;
  readonly deployedWardenAttackDamage: number;
  readonly purchasedModifiers: readonly PurchasedUpgradeCharacterModifiers[];
}

export interface ShuttergateAttemptRequest {
  readonly schemaVersion: 1;
  readonly attemptId: StableId;
  readonly seed: string;
  readonly placementPointId: PlacementPointId;
  readonly targetPolicy: DwarfTargetPolicy;
  readonly buildId: ShuttergateCalibrationBuildId;
}

export interface ShuttergateAttemptResult {
  readonly schemaVersion: 1;
  readonly calibration: ShuttergateBuildCalibrationEvidence;
  readonly rewardEvent: CompletedAttemptRewardEvent;
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
async function runShuttergateCalibration(
  content: CompiledContent,
  seed: string,
  placementPointId: PlacementPointId,
  requestedTargetPolicy: DwarfTargetPolicy,
  buildId?: ShuttergateCalibrationBuildId
): Promise<
  ShuttergateReferenceCalibrationEvidence | ShuttergateBuildCalibrationEvidence
> {
  if (!/^[1-9]\d{0,9}$/.test(seed) || BigInt(seed) > 0xffff_ffffn) {
    throw new RangeError(
      `Shuttergate calibration requires a canonical uint32 seed (${seed})`
    );
  }
  const referenceContent = await requireReferenceContent(content);
  if (!targetPolicies.includes(requestedTargetPolicy)) {
    throw new RangeError(
      `Shuttergate calibration requires an authored target policy (${requestedTargetPolicy})`
    );
  }
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
  let profile = createInitialProfile(wardenCharacterId);
  if (buildId === "build.warden.shield_slam_rank_1.v1") {
    profile = purchaseUpgradeRank({
      schemaVersion: 1,
      profile: Object.freeze({ ...profile, forgeOre: 10 }),
      catalog: shuttergateReferenceBuildCatalog,
      upgradeId: shieldSlamUpgradeId
    }).profile;
  } else if (
    buildId !== undefined &&
    buildId !== "build.profile.new_campaign.v1"
  ) {
    throw new RangeError(
      `Shuttergate calibration requires a supported build (${buildId})`
    );
  }
  const deployed =
    buildId === undefined
      ? Object.freeze({
          battlefield: deployBattlefieldDwarves(
            initial.battlefield,
            authority,
            referenceContent
          ),
          purchasedModifiers: Object.freeze(
            [] as PurchasedUpgradeCharacterModifiers[]
          )
        })
      : deployBattlefieldDwarvesWithPurchasedUpgradeEffects(
          {
            schemaVersion: 1,
            battlefield: initial.battlefield,
            profile,
            catalog: shuttergateReferenceBuildCatalog,
            skillTrees: referenceSkillTrees
          },
          referenceContent,
          authority
        );
  const deployedWarden = deployed.battlefield.dwarfCombatants.find(
    (combatant) => combatant.entityId === wardenEntityId
  );
  if (deployedWarden === undefined)
    throw new Error("Shuttergate calibration did not deploy the Warden");
  let state: SimulationState = Object.freeze({
    ...initial,
    phase: "COMBAT_RUNNING" as const,
    battlefield: deployed.battlefield
  });
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
      requestedPolicy: requestedTargetPolicy
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
    const common = Object.freeze({
      contentManifestHash: referenceContent.manifestHash,
      seed,
      levelId,
      placementPointId,
      targetPolicy: requestedTargetPolicy,
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
    if (buildId !== undefined) {
      return Object.freeze({
        schemaVersion: 2,
        calibrationId: "calibration.shuttergate.warden_build.v1",
        buildId,
        deployedWardenMaximumHealth: deployedWarden.maximumHealth,
        deployedWardenAttackDamage: deployedWarden.basicAttack.damage,
        purchasedModifiers: deployed.purchasedModifiers,
        ...common
      });
    }
    return Object.freeze({
      schemaVersion: 1,
      calibrationId: "calibration.shuttergate.unupgraded_warden.v1",
      ...common
    });
  }
  throw new RangeError(
    `Shuttergate calibration did not terminate by safety tick ${maximumTick}`
  );
}

export async function runShuttergateSeedPlacementControllerBuildCalibration(
  content: CompiledContent,
  seed: string,
  placementPointId: PlacementPointId,
  requestedTargetPolicy: DwarfTargetPolicy,
  buildId: ShuttergateCalibrationBuildId
): Promise<ShuttergateBuildCalibrationEvidence> {
  return (await runShuttergateCalibration(
    content,
    seed,
    placementPointId,
    requestedTargetPolicy,
    buildId
  )) as ShuttergateBuildCalibrationEvidence;
}

/** Runs one authoritative encounter and derives its persistent reward evidence. */
export async function runShuttergateAttempt(
  content: CompiledContent,
  request: ShuttergateAttemptRequest
): Promise<ShuttergateAttemptResult> {
  if (typeof request !== "object" || request === null || Array.isArray(request))
    throw new TypeError("Shuttergate attempt request must be an object");
  const prototype = Object.getPrototypeOf(request);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Shuttergate attempt request must be a plain object");
  const expectedKeys = [
    "attemptId",
    "buildId",
    "placementPointId",
    "schemaVersion",
    "seed",
    "targetPolicy"
  ];
  const ownKeys = Reflect.ownKeys(request);
  const actualKeys = ownKeys
    .filter((key): key is string => typeof key === "string")
    .sort();
  if (
    actualKeys.length !== ownKeys.length ||
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  )
    throw new TypeError("Shuttergate attempt request has invalid fields");
  const descriptors = Object.getOwnPropertyDescriptors(request);
  if (
    expectedKeys.some((key) => {
      const descriptor = descriptors[key];
      return (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !("value" in descriptor)
      );
    })
  )
    throw new TypeError(
      "Shuttergate attempt request fields must be plain data properties"
    );
  const normalizedRequest = Object.freeze({
    schemaVersion: descriptors.schemaVersion?.value,
    attemptId: descriptors.attemptId?.value,
    seed: descriptors.seed?.value,
    placementPointId: descriptors.placementPointId?.value,
    targetPolicy: descriptors.targetPolicy?.value,
    buildId: descriptors.buildId?.value
  }) as ShuttergateAttemptRequest;
  if (normalizedRequest.schemaVersion !== 1)
    throw new RangeError(
      "Shuttergate attempt request has unsupported schemaVersion"
    );
  if (
    typeof normalizedRequest.attemptId !== "string" ||
    !/^attempt\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(
      normalizedRequest.attemptId
    )
  )
    throw new RangeError(
      `Shuttergate attempt requires a canonical attempt ID (${String(normalizedRequest.attemptId)})`
    );

  const calibration =
    await runShuttergateSeedPlacementControllerBuildCalibration(
      content,
      normalizedRequest.seed,
      normalizedRequest.placementPointId,
      normalizedRequest.targetPolicy,
      normalizedRequest.buildId
    );
  const terminalMilestone = calibration.milestones.at(-1);
  if (terminalMilestone === undefined)
    throw new Error("Shuttergate attempt has no terminal milestone evidence");
  const rewardEvent: CompletedAttemptRewardEvent = Object.freeze({
    schemaVersion: 1,
    rewardId: `reward.${normalizedRequest.attemptId}` as StableId,
    attemptId: normalizedRequest.attemptId,
    levelId: calibration.levelId,
    terminalResult: calibration.terminalResult,
    defeatedEnemies: calibration.defeatedEnemies,
    startedWaveIds: Object.freeze([...terminalMilestone.startedWaveIds])
  });
  return Object.freeze({ schemaVersion: 1, calibration, rewardEvent });
}

export async function runShuttergateSeedPlacementControllerCalibration(
  content: CompiledContent,
  seed: string,
  placementPointId: PlacementPointId,
  requestedTargetPolicy: DwarfTargetPolicy
): Promise<ShuttergateReferenceCalibrationEvidence> {
  return (await runShuttergateCalibration(
    content,
    seed,
    placementPointId,
    requestedTargetPolicy
  )) as ShuttergateReferenceCalibrationEvidence;
}

export async function runShuttergateSeedPlacementCalibration(
  content: CompiledContent,
  seed: string,
  placementPointId: PlacementPointId
): Promise<ShuttergateReferenceCalibrationEvidence> {
  return runShuttergateSeedPlacementControllerCalibration(
    content,
    seed,
    placementPointId,
    targetPolicy
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
