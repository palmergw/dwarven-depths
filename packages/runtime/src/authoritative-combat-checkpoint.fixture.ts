import { compileContent } from "@dwarven-depths/content-runtime";
import type {
  ContentBundle,
  DwarfActionPhaseEntry,
  SimulationState
} from "@dwarven-depths/contracts";
import { createInitialProfile } from "@dwarven-depths/progression";
import {
  createBattlefieldDwarfDeploymentAuthority,
  createInitialState,
  deployBattlefieldDwarves
} from "@dwarven-depths/sim-core";
import conformanceContent from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import referenceCombatants from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import shuttergateInput from "../../../content/fixtures/phase-3-shuttergate.json" with {
  type: "json"
};
import { resolveAuthoritativeCombatCheckpoint } from "./authoritative-combat-checkpoint.js";

const wardenEntry: DwarfActionPhaseEntry = Object.freeze({
  schemaVersion: 1,
  dwarfEntityId: "entity.dwarf.warden" as never,
  requestedPolicy: "nearest"
});

async function simultaneousBossAndDwarfDeath() {
  const definitions = referenceCombatants.definitions
    .filter(
      (definition) =>
        definition.id === "character.iron_warden" ||
        definition.id === "enemy.gatebreaker_captain"
    )
    .map((definition) => ({
      ...definition,
      maximumHealth: 10,
      ...(definition.kind === "enemy" ? { movementIntervalTicks: 8 } : {}),
      basicAttack: {
        ...definition.basicAttack,
        windupTicks: 1,
        impactDelayTicks: 0,
        cooldownTicks: 4,
        damage: 10,
        range: 2,
        requiresLineOfSight: false
      }
    }));
  const content = await compileContent({
    ...conformanceContent,
    contentVersion: "phase-3-combat-checkpoint-v1",
    definitions: [
      ...conformanceContent.definitions.map((definition) =>
        definition.kind === "level"
          ? { ...definition, waveIds: ["wave.combat_checkpoint"] }
          : definition
      ),
      ...definitions,
      {
        kind: "wave",
        id: "wave.combat_checkpoint",
        startAtTick: 0,
        durationTicks: 2,
        spawnEvents: [
          {
            id: "spawn.combat_checkpoint.captain",
            authoredOrder: 0,
            atTick: 0,
            entityId: "entity.enemy.captain",
            enemyDefinitionId: "enemy.gatebreaker_captain",
            entranceId: "entrance.west"
          }
        ]
      }
    ]
  } as unknown as ContentBundle);
  const initial = createInitialState(
    content,
    "level.conformance_map" as never,
    "1"
  );
  if (initial.battlefield === undefined) throw new Error("missing battlefield");
  const authority = createBattlefieldDwarfDeploymentAuthority(
    [
      {
        entityId: "entity.dwarf.warden" as never,
        characterDefinitionId: "character.iron_warden" as never,
        placementPointId: "placement.goal" as never
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
  const rewards = Object.freeze([
    Object.freeze({
      schemaVersion: 1 as const,
      rewardId: "reward.boss.gatebreaker_captain" as never,
      bossEntityId: "entity.enemy.captain" as never,
      characterUnlockId: "character.deep_ranger" as never,
      forgeOre: 20
    })
  ]);
  const tick0 = resolveAuthoritativeCombatCheckpoint(
    {
      schemaVersion: 1,
      state,
      dwarfActionEntries: [wardenEntry],
      profile: createInitialProfile("character.iron_warden" as never),
      rewards
    },
    content,
    authority
  );
  state = Object.freeze({ ...tick0.combat.state, tick: 1 });
  const tick1 = resolveAuthoritativeCombatCheckpoint(
    {
      schemaVersion: 1,
      state,
      dwarfActionEntries: [wardenEntry],
      profile: tick0.bossRewards.profile,
      rewards
    },
    content,
    authority
  );
  return Object.freeze({ tick0, tick1 });
}

async function shuttergateInProgress() {
  const content = await compileContent(shuttergateInput);
  const initial = createInitialState(
    content,
    "level.shuttergate_hall" as never,
    "1"
  );
  if (initial.battlefield === undefined)
    throw new Error("missing Shuttergate battlefield");
  const authority = createBattlefieldDwarfDeploymentAuthority(
    [
      {
        entityId: "entity.dwarf.warden_north" as never,
        characterDefinitionId: "character.iron_warden" as never,
        placementPointId: "placement.shuttergate_north_guard" as never
      },
      {
        entityId: "entity.dwarf.warden_keep" as never,
        characterDefinitionId: "character.iron_warden" as never,
        placementPointId: "placement.shuttergate_keep_guard" as never
      }
    ],
    initial.battlefield,
    content
  );
  const state: SimulationState = Object.freeze({
    ...initial,
    phase: "COMBAT_RUNNING" as const,
    battlefield: deployBattlefieldDwarves(
      initial.battlefield,
      authority,
      content
    )
  });
  return resolveAuthoritativeCombatCheckpoint(
    {
      schemaVersion: 1,
      state,
      dwarfActionEntries: [
        {
          schemaVersion: 1,
          dwarfEntityId: "entity.dwarf.warden_keep" as never,
          requestedPolicy: "nearest"
        },
        {
          schemaVersion: 1,
          dwarfEntityId: "entity.dwarf.warden_north" as never,
          requestedPolicy: "lowest_health"
        }
      ],
      profile: createInitialProfile("character.iron_warden" as never),
      rewards: []
    },
    content,
    authority
  );
}

export async function authoritativeCombatCheckpointParityEvidence() {
  const simultaneous = await simultaneousBossAndDwarfDeath();
  const shuttergate = await shuttergateInProgress();
  const validationErrors: string[] = [];
  for (const request of [
    { schemaVersion: 2 },
    {
      schemaVersion: 1,
      state: simultaneous.tick1.combat.state,
      dwarfActionEntries: [],
      profile: simultaneous.tick1.bossRewards.profile,
      rewards: [],
      livingDwarfIds: []
    }
  ]) {
    try {
      resolveAuthoritativeCombatCheckpoint(
        request as never,
        {} as never,
        {} as never
      );
    } catch (error) {
      validationErrors.push(
        error instanceof Error ? error.message : String(error)
      );
    }
  }
  return Object.freeze({
    simultaneous,
    shuttergate,
    validationErrors: Object.freeze(validationErrors)
  });
}
