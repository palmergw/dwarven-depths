import { characterLevelThresholds } from "./character-experience.fixture.js";
import { resolveOwnedCharacterExperienceRewards } from "./owned-character-experience-rewards.js";
import { createInitialProfile } from "./profile-state.js";
import { ironWardenSkillTree } from "./skill-tree.catalog.js";
import {
  deriveCharacterSkillEligibility,
  selectCharacterSkillNode
} from "./skill-tree.js";

export { ironWardenSkillTree };

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
