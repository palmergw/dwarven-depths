import { characterLevelThresholds } from "./character-experience.fixture.js";
import { resolveOwnedCharacterExperienceRewards } from "./owned-character-experience-rewards.js";
import { createInitialProfile } from "./profile-state.js";
import {
  type CharacterSkillTreeDefinition,
  deriveCharacterSkillEligibility,
  selectCharacterSkillNode
} from "./skill-tree.js";

export const ironWardenSkillTree = Object.freeze({
  schemaVersion: 1 as const,
  characterId: "character.iron_warden" as never,
  nodes: Object.freeze([
    Object.freeze({
      schemaVersion: 1 as const,
      nodeId: "skill.iron_warden.disciplined_slam" as never,
      prerequisiteNodeIds: Object.freeze([
        "skill.iron_warden.stone_guard" as never
      ]),
      effects: Object.freeze([
        Object.freeze({
          schemaVersion: 1 as const,
          kind: "future_cooldown_reduction_ticks" as const,
          value: 2
        })
      ])
    }),
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

export function createProfileWithTwoPendingSkillPoints() {
  return resolveOwnedCharacterExperienceRewards({
    schemaVersion: 1,
    profile: createInitialProfile("character.iron_warden" as never),
    events: [
      {
        schemaVersion: 1,
        eventId: "event.reward.xp.skill_fixture" as never,
        characterId: "character.iron_warden" as never,
        experience: 260
      }
    ],
    thresholdSets: [
      {
        schemaVersion: 1,
        characterId: "character.iron_warden" as never,
        thresholds: characterLevelThresholds
      }
    ]
  }).profile;
}

/** Shared nonempty evidence executed unchanged by Node and browsers. */
export function characterSkillTreeParityEvidence() {
  const initialProfile = createProfileWithTwoPendingSkillPoints();
  const initialEligibility = deriveCharacterSkillEligibility({
    schemaVersion: 1,
    profile: initialProfile,
    tree: ironWardenSkillTree
  });
  const first = selectCharacterSkillNode({
    schemaVersion: 1,
    profile: initialProfile,
    tree: ironWardenSkillTree,
    nodeId: "skill.iron_warden.stone_guard" as never
  });
  const reopenedEligibility = deriveCharacterSkillEligibility({
    schemaVersion: 1,
    profile: first.profile,
    tree: {
      ...ironWardenSkillTree,
      nodes: [...ironWardenSkillTree.nodes].reverse()
    }
  });
  const second = selectCharacterSkillNode({
    schemaVersion: 1,
    profile: first.profile,
    tree: ironWardenSkillTree,
    nodeId: "skill.iron_warden.disciplined_slam" as never
  });
  return Object.freeze({
    initialEligibility,
    first,
    reopenedEligibility,
    second
  });
}
