import { compileContent } from "@dwarven-depths/content-runtime";
import type { SimulationState } from "@dwarven-depths/contracts";
import type {
  CharacterSkillTreeDefinition,
  ProfileState
} from "@dwarven-depths/progression";
import {
  createBattlefieldDwarfDeploymentAuthority,
  createInitialState,
  deployBattlefieldDwarves,
  resolveAuthoritativeCombatTick,
  resolveScheduledBattlefieldPhase
} from "@dwarven-depths/sim-core";
import mapContent from "../../../content/fixtures/conformance-map.json" with {
  type: "json"
};
import combatantsContent from "../../../content/fixtures/phase-3-reference-combatants.json" with {
  type: "json"
};
import {
  applySelectedSkillEffectsToBattlefield,
  deployBattlefieldDwarvesWithSelectedSkillEffects
} from "./battlefield-skill-effects.js";

const skillTree = Object.freeze({
  schemaVersion: 1 as const,
  characterId: "character.iron_warden" as never,
  nodes: Object.freeze([
    Object.freeze({
      schemaVersion: 1 as const,
      nodeId: "skill.iron_warden.long_reach" as never,
      prerequisiteNodeIds: Object.freeze([
        "skill.iron_warden.stone_guard" as never
      ]),
      effects: Object.freeze([
        Object.freeze({
          schemaVersion: 1 as const,
          kind: "attack_range_add" as const,
          value: 1
        }),
        Object.freeze({
          schemaVersion: 1 as const,
          kind: "future_cooldown_reduction_ticks" as const,
          value: 2
        })
      ])
    }),
    Object.freeze({
      schemaVersion: 1 as const,
      nodeId: "skill.iron_warden.stone_guard" as never,
      prerequisiteNodeIds: Object.freeze([]),
      effects: Object.freeze([
        Object.freeze({
          schemaVersion: 1 as const,
          kind: "maximum_health_add" as const,
          value: 25
        }),
        Object.freeze({
          schemaVersion: 1 as const,
          kind: "attack_damage_add" as const,
          value: 3
        })
      ])
    })
  ])
} satisfies CharacterSkillTreeDefinition);

function profile(includeSecondNode: boolean): ProfileState {
  return {
    schemaVersion: 1,
    revision: includeSecondNode ? 2 : 1,
    forgeOre: 0,
    unlockedCharacterIds: ["character.iron_warden" as never],
    claimedRewardIds: [],
    characterExperienceStates: [
      {
        schemaVersion: 1,
        characterId: "character.iron_warden" as never,
        experience: includeSecondNode ? 260 : 100,
        level: includeSecondNode ? 3 : 2,
        pendingSkillPointLevels: []
      }
    ],
    claimedExperienceRewardEvents: [],
    selectedSkillNodes: [
      {
        schemaVersion: 1,
        characterId: "character.iron_warden" as never,
        nodeId: "skill.iron_warden.stone_guard" as never,
        spentSkillPointLevel: 2
      },
      ...(includeSecondNode
        ? [
            {
              schemaVersion: 1 as const,
              characterId: "character.iron_warden" as never,
              nodeId: "skill.iron_warden.long_reach" as never,
              spentSkillPointLevel: 3
            }
          ]
        : [])
    ]
  };
}

async function deployedRound(selectedProfile?: ProfileState) {
  const content = await compileContent({
    ...mapContent,
    contentVersion: "phase-4-live-skill-effects-v1",
    definitions: [
      ...mapContent.definitions.map((definition) =>
        definition.kind === "level"
          ? { ...definition, waveIds: ["wave.skill_effects"] }
          : definition
      ),
      {
        kind: "wave" as const,
        id: "wave.skill_effects",
        startAtTick: 0,
        durationTicks: 100,
        spawnEvents: [
          {
            id: "spawn.slinger",
            authoredOrder: 0,
            atTick: 0,
            entityId: "entity.enemy.slinger",
            enemyDefinitionId: "enemy.goblin_slinger",
            entranceId: "entrance.west"
          }
        ]
      },
      ...combatantsContent.definitions.filter(
        (definition) =>
          definition.kind === "character" ||
          (definition.kind === "enemy" &&
            definition.id === "enemy.goblin_slinger")
      )
    ]
  });
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
  const admitted = resolveScheduledBattlefieldPhase(
    initial,
    content,
    [],
    undefined,
    authority
  );
  if (admitted.state.battlefield === undefined)
    throw new Error("missing admitted battlefield");
  const battlefield =
    selectedProfile === undefined
      ? deployBattlefieldDwarves(admitted.state.battlefield, authority, content)
      : deployBattlefieldDwarvesWithSelectedSkillEffects(
          {
            schemaVersion: 1,
            battlefield: admitted.state.battlefield,
            profile: selectedProfile,
            skillTrees: [skillTree]
          },
          content,
          authority
        ).battlefield;
  return {
    content,
    authority,
    state: Object.freeze({
      ...admitted.state,
      phase: "COMBAT_RUNNING" as const,
      battlefield
    }) as SimulationState
  };
}

/** Shared nonempty evidence executed unchanged by Node and browsers. */
export async function battlefieldSkillEffectParityEvidence() {
  const upgradedDeployment = await deployedRound(profile(true));
  const live = await deployedRound();
  let damaged = live.state;
  for (let index = 0; index < 13; index += 1) {
    damaged = resolveAuthoritativeCombatTick(
      {
        schemaVersion: 1,
        state: Object.freeze({ ...damaged, tick: index }),
        dwarfActionEntries: [
          {
            schemaVersion: 1,
            dwarfEntityId: "entity.dwarf.warden" as never,
            requestedPolicy: "nearest"
          }
        ]
      },
      live.content,
      live.authority
    ).state;
  }
  if (damaged.battlefield === undefined)
    throw new Error("missing damaged battlefield");
  const afterRoot = applySelectedSkillEffectsToBattlefield(
    {
      schemaVersion: 1,
      battlefield: damaged.battlefield,
      profile: profile(false),
      skillTrees: [skillTree]
    },
    live.content,
    live.authority
  );
  const afterSecond = applySelectedSkillEffectsToBattlefield(
    {
      schemaVersion: 1,
      battlefield: afterRoot.battlefield,
      profile: profile(true),
      skillTrees: [skillTree]
    },
    live.content,
    live.authority
  );
  const repeated = applySelectedSkillEffectsToBattlefield(
    {
      schemaVersion: 1,
      battlefield: afterSecond.battlefield,
      profile: profile(true),
      skillTrees: [skillTree]
    },
    live.content,
    live.authority
  );

  const commitment = await deployedRound();
  let committedState = commitment.state;
  for (let index = 0; index < 9; index += 1) {
    committedState = resolveAuthoritativeCombatTick(
      {
        schemaVersion: 1,
        state: Object.freeze({ ...committedState, tick: index }),
        dwarfActionEntries: [
          {
            schemaVersion: 1,
            dwarfEntityId: "entity.dwarf.warden" as never,
            requestedPolicy: "nearest"
          }
        ]
      },
      commitment.content,
      commitment.authority
    ).state;
  }
  if (committedState.battlefield === undefined)
    throw new Error("missing committed battlefield");
  const committedBefore = committedState.battlefield.pendingCommittedAttacks[0];
  const upgradedCommitment = applySelectedSkillEffectsToBattlefield(
    {
      schemaVersion: 1,
      battlefield: committedState.battlefield,
      profile: profile(true),
      skillTrees: [skillTree]
    },
    commitment.content,
    commitment.authority
  );

  return Object.freeze({
    upgradedDeployment:
      upgradedDeployment.state.battlefield?.dwarfCombatants[0],
    damagedBefore: damaged.battlefield.dwarfCombatants[0],
    afterRoot,
    afterSecond,
    repeatedIsEquivalent:
      JSON.stringify(repeated.battlefield) ===
      JSON.stringify(afterSecond.battlefield),
    committedBefore,
    committedAfter: upgradedCommitment.battlefield.pendingCommittedAttacks[0],
    upgradedCommittedDwarf: upgradedCommitment.battlefield.dwarfCombatants[0]
  });
}

function captureError(action: () => unknown): string {
  try {
    action();
    return "missing expected error";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export async function battlefieldSkillEffectValidationEvidence() {
  const round = await deployedRound();
  if (round.state.battlefield === undefined)
    throw new Error("missing validation battlefield");
  const base = round.state.battlefield;
  const missingTreeError = captureError(() =>
    applySelectedSkillEffectsToBattlefield(
      {
        schemaVersion: 1,
        battlefield: base,
        profile: profile(false),
        skillTrees: []
      },
      round.content,
      round.authority
    )
  );
  const duplicateTreeError = captureError(() =>
    applySelectedSkillEffectsToBattlefield(
      {
        schemaVersion: 1,
        battlefield: base,
        profile: profile(false),
        skillTrees: [skillTree, skillTree]
      },
      round.content,
      round.authority
    )
  );
  const overflowTree = {
    ...skillTree,
    nodes: skillTree.nodes.map((node) =>
      node.nodeId === "skill.iron_warden.stone_guard"
        ? {
            ...node,
            effects: node.effects.map((effect) =>
              effect.kind === "maximum_health_add"
                ? { ...effect, value: Number.MAX_SAFE_INTEGER }
                : effect
            )
          }
        : node
    )
  };
  const overflowError = captureError(() =>
    applySelectedSkillEffectsToBattlefield(
      {
        schemaVersion: 1,
        battlefield: base,
        profile: profile(false),
        skillTrees: [overflowTree]
      },
      round.content,
      round.authority
    )
  );
  const root = applySelectedSkillEffectsToBattlefield(
    {
      schemaVersion: 1,
      battlefield: base,
      profile: profile(false),
      skillTrees: [skillTree]
    },
    round.content,
    round.authority
  );
  const second = applySelectedSkillEffectsToBattlefield(
    {
      schemaVersion: 1,
      battlefield: root.battlefield,
      profile: profile(true),
      skillTrees: [skillTree]
    },
    round.content,
    round.authority
  );
  const decreaseError = captureError(() =>
    applySelectedSkillEffectsToBattlefield(
      {
        schemaVersion: 1,
        battlefield: second.battlefield,
        profile: profile(false),
        skillTrees: [skillTree]
      },
      round.content,
      round.authority
    )
  );
  const forgedError = captureError(() =>
    applySelectedSkillEffectsToBattlefield(
      {
        schemaVersion: 1,
        battlefield: {
          ...second.battlefield,
          dwarfCombatants: second.battlefield.dwarfCombatants.map((dwarf) => ({
            ...dwarf,
            basicAttack: { ...dwarf.basicAttack, damage: 999 }
          }))
        },
        profile: profile(true),
        skillTrees: [skillTree]
      },
      round.content,
      round.authority
    )
  );
  const recovered = applySelectedSkillEffectsToBattlefield(
    {
      schemaVersion: 1,
      battlefield: second.battlefield,
      profile: profile(true),
      skillTrees: [skillTree]
    },
    round.content,
    round.authority
  );
  return Object.freeze({
    missingTreeError,
    duplicateTreeError,
    overflowError,
    decreaseError,
    forgedError,
    recoveredDwarf: recovered.battlefield.dwarfCombatants[0]
  });
}
