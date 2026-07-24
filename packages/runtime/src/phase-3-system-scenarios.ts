import type {
  BattlefieldMapDefinition,
  CombatantHealth,
  CombatantLifecycle,
  CommittedAttack,
  DwarfAttackTargetingEntry,
  DwarfTargetLockCandidate,
  WaveScheduleRequest
} from "@dwarven-depths/contracts";
import { createInitialProfile } from "@dwarven-depths/progression";
import {
  resolveCommittedAttackImpacts,
  resolveCommittedCombatEffects,
  resolveDeathTriggers,
  resolveDwarfAttackTargeting,
  resolveZeroHealthLifecycles
} from "@dwarven-depths/sim-core";
import { resolveBossRewardCheckpoint } from "./boss-reward-checkpoint.js";

const wardenId = "entity.dwarf.warden" as never;
const bossId = "entity.enemy.boss.gatebreaker_captain" as never;
const cutterId = "entity.enemy.goblin_cutter" as never;

const map: BattlefieldMapDefinition = {
  kind: "map",
  id: "map.phase_3_system" as never,
  nodes: [],
  connections: [],
  placementPoints: [],
  enemyEntrances: [],
  aimPoints: [
    { id: "aim.warden" as never, x: 0, y: 0 },
    { id: "aim.boss" as never, x: 3, y: 4 },
    { id: "aim.cutter" as never, x: 6, y: 0 }
  ],
  opaqueRegions: []
};

function candidate(
  entityId: string,
  aimPointId: string,
  currentHealth: number
): DwarfTargetLockCandidate {
  return {
    entityId: entityId as never,
    aimPointId: aimPointId as never,
    isHostile: true,
    currentHealth,
    maximumHealth: 20,
    armor: 0,
    speed: 10,
    isBoss: entityId === bossId,
    isElite: false
  };
}

function targetingEntry(
  attackId: string,
  targetEntityId: string,
  candidates: readonly DwarfTargetLockCandidate[]
): DwarfAttackTargetingEntry {
  return {
    schemaVersion: 1,
    sourceEntityId: wardenId,
    targetLock: {
      map,
      sourceAimPointId: "aim.warden" as never,
      range: 10,
      requiresLineOfSight: true,
      currentTargetEntityId: targetEntityId as never,
      requestedPolicy: "boss_or_elite_first",
      supportedPolicies: ["nearest", "boss_or_elite_first"],
      candidates
    },
    windup: {
      schemaVersion: 1,
      attackId: attackId as never,
      sourceEntityId: wardenId,
      targetEntityId: targetEntityId as never,
      startedAtTick: 10,
      commitAtTick: 12,
      impactAtTick: 15,
      cooldownDurationTicks: 30,
      damage: 20,
      range: 10,
      targetIsValid: false
    }
  };
}

const completeWaveSchedule: WaveScheduleRequest = {
  schemaVersion: 1,
  currentTick: 20,
  level: {
    kind: "level",
    id: "level.shuttergate" as never,
    waveIds: ["wave.final"] as never[]
  },
  waves: [
    {
      kind: "wave",
      id: "wave.final" as never,
      startAtTick: 0,
      durationTicks: 20,
      spawnEvents: [
        {
          id: "spawn.gatebreaker_captain" as never,
          authoredOrder: 0,
          atTick: 1,
          entityId: bossId,
          enemyDefinitionId: "enemy.gatebreaker_captain" as never,
          entranceId: "entrance.west" as never
        }
      ]
    }
  ],
  startedWaveIds: ["wave.final"] as never[],
  firedSpawnIds: ["spawn.gatebreaker_captain"] as never[],
  pendingSpawns: []
};

function committedAttack(
  attackId: string,
  sourceEntityId: string,
  targetEntityId: string,
  damage: number
): CommittedAttack {
  return {
    schemaVersion: 1,
    attackId: attackId as never,
    sourceEntityId: sourceEntityId as never,
    targetEntityId: targetEntityId as never,
    committedAtTick: 12,
    impactAtTick: 15,
    cooldownCompleteAtTick: 42,
    damage,
    range: 10
  };
}

/**
 * Produces compact, reason-coded evidence across the implemented Phase 3 combat
 * boundary. This is verification evidence, not a second authoritative game loop.
 */
export function createPhase3SystemScenarioEvidence() {
  const bossTargeting = resolveDwarfAttackTargeting({
    schemaVersion: 1,
    currentTick: 12,
    entries: [
      targetingEntry("attack.warden.boss", bossId, [
        candidate(bossId, "aim.boss", 20),
        candidate(cutterId, "aim.cutter", 20)
      ])
    ]
  });
  const bossAttack = bossTargeting.decisions[0]?.commitment.committedAttack;
  if (bossAttack === undefined) throw new Error("boss attack did not commit");

  const bossImpact = resolveCommittedAttackImpacts({
    currentTick: 15,
    attacks: [bossAttack],
    combatants: [
      {
        schemaVersion: 1,
        entityId: bossId,
        currentHealth: 20,
        maximumHealth: 20
      }
    ]
  });
  const bossHealth = bossImpact.health[0];
  if (bossHealth === undefined)
    throw new Error("boss impact lost health evidence");
  const bossLifecycle = resolveZeroHealthLifecycles({
    combatants: [
      {
        schemaVersion: 1,
        entityId: bossId,
        kind: "enemy",
        currentHealth: bossHealth.currentHealth,
        lifecycleState: "active"
      },
      {
        schemaVersion: 1,
        entityId: "entity.deployable.boss_totem" as never,
        kind: "deployable",
        currentHealth: 5,
        lifecycleState: "active"
      }
    ],
    occupancy: [
      { entityId: bossId, nodeId: "node.boss" as never },
      {
        entityId: "entity.deployable.boss_totem" as never,
        nodeId: "node.totem" as never
      }
    ]
  });
  const deathTriggers = resolveDeathTriggers({
    combatants: bossLifecycle.combatants,
    deathEvents: [{ schemaVersion: 1, entityId: bossId }],
    effects: [
      {
        schemaVersion: 1,
        effectId: "effect.boss.death_blast" as never,
        ownerEntityId: bossId,
        targetEntityId: "entity.deployable.boss_totem" as never,
        damage: 5
      }
    ],
    recursionLimit: 2
  });

  const rewardAndVictory = resolveBossRewardCheckpoint({
    schemaVersion: 1,
    bossRewards: {
      schemaVersion: 1,
      profile: createInitialProfile("character.iron_warden" as never),
      bossDeaths: [
        {
          schemaVersion: 1,
          eventId: "death.gatebreaker_captain" as never,
          bossEntityId: bossId
        }
      ],
      rewards: [
        {
          schemaVersion: 1,
          rewardId: "reward.boss.gatebreaker_captain" as never,
          bossEntityId: bossId,
          characterUnlockId: "character.deep_ranger" as never,
          forgeOre: 20
        }
      ]
    },
    terminalEvaluation: {
      schemaVersion: 1,
      waveSchedule: completeWaveSchedule,
      livingDwarfIds: [wardenId],
      livingHostileEnemyIds: [],
      livingHostileDeployableIds: []
    }
  });

  const invalidatedWindup = resolveDwarfAttackTargeting({
    schemaVersion: 1,
    currentTick: 12,
    entries: [
      targetingEntry("attack.warden.invalidated", bossId, [
        candidate(bossId, "aim.boss", 0),
        candidate(cutterId, "aim.cutter", 20)
      ])
    ]
  });

  const simultaneousImpacts = resolveCommittedAttackImpacts({
    currentTick: 15,
    attacks: [
      committedAttack("attack.cutter.lethal", cutterId, wardenId, 10),
      committedAttack("attack.warden.lethal", wardenId, cutterId, 10)
    ],
    combatants: [
      {
        schemaVersion: 1,
        entityId: wardenId,
        currentHealth: 10,
        maximumHealth: 20
      },
      {
        schemaVersion: 1,
        entityId: cutterId,
        currentHealth: 10,
        maximumHealth: 10
      }
    ]
  });
  const lifecycleInputs: CombatantLifecycle[] = simultaneousImpacts.health.map(
    (combatant) => ({
      schemaVersion: 1,
      entityId: combatant.entityId,
      kind: combatant.entityId === wardenId ? "dwarf" : "enemy",
      currentHealth: combatant.currentHealth,
      lifecycleState: "active"
    })
  );
  const simultaneousLifecycles = resolveZeroHealthLifecycles({
    combatants: lifecycleInputs,
    occupancy: [
      { entityId: cutterId, nodeId: "node.cutter" as never },
      { entityId: wardenId, nodeId: "node.warden" as never }
    ]
  });

  const supportEffects = resolveCommittedCombatEffects({
    currentTick: 15,
    healingEffects: [
      {
        schemaVersion: 1,
        effectId: "effect.warden.heal" as never,
        sourceEntityId: "entity.dwarf.support" as never,
        targetEntityId: wardenId,
        committedAtTick: 12,
        impactAtTick: 15,
        healing: 8
      }
    ],
    statusEffects: [
      {
        schemaVersion: 1,
        effectId: "effect.warden.guard" as never,
        sourceEntityId: "entity.dwarf.support" as never,
        targetEntityId: wardenId,
        committedAtTick: 12,
        impactAtTick: 15,
        statusId: "status.guard" as never,
        durationTicks: 10,
        magnitude: 3
      }
    ],
    combatants: [
      {
        schemaVersion: 1,
        entityId: wardenId,
        currentHealth: 15,
        maximumHealth: 20
      }
    ] satisfies readonly CombatantHealth[],
    statuses: []
  });

  return Object.freeze({
    schemaVersion: 1 as const,
    bossPath: Object.freeze({
      targeting: bossTargeting,
      impact: bossImpact,
      lifecycle: bossLifecycle,
      deathTriggers,
      rewardAndVictory
    }),
    invalidatedWindup,
    simultaneousDeath: Object.freeze({
      impacts: simultaneousImpacts,
      lifecycles: simultaneousLifecycles
    }),
    supportEffects
  });
}

export type Phase3SystemScenarioEvidence = ReturnType<
  typeof createPhase3SystemScenarioEvidence
>;
