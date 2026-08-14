import type { StableId } from "@dwarven-depths/contracts";
import type { ProfileState } from "./profile-state.js";
import { ironWardenSkillTree } from "./skill-tree.catalog.js";
import { deriveCharacterSkillModifiers } from "./skill-tree.js";

const shieldSlamId = "ability.iron_warden.shield_slam" as StableId;
const linebreakerId = "ability.iron_warden.linebreaker" as StableId;
const rallyingRoarId = "ability.iron_warden.rallying_roar" as StableId;

/**
 * Derives the bounded authoritative Iron Warden loadout from persisted skill
 * choices. Shield Slam is the foundation ability; each additional slot is
 * unlocked by the corresponding authored branch node.
 */
export function deriveIronWardenActiveAbilityIds(
  profile: ProfileState
): readonly StableId[] {
  // Validate the complete persisted selection before trusting any unlock.
  deriveCharacterSkillModifiers({
    schemaVersion: 1,
    profile,
    tree: ironWardenSkillTree
  });
  const selected = new Set(
    profile.selectedSkillNodes
      .filter(
        (selection) => selection.characterId === ironWardenSkillTree.characterId
      )
      .map((selection) => selection.nodeId)
  );
  return Object.freeze(
    [
      shieldSlamId,
      ...(selected.has("skill.iron_warden.linebreaker" as StableId)
        ? [linebreakerId]
        : []),
      ...(selected.has("skill.iron_warden.war_cry" as StableId)
        ? [rallyingRoarId]
        : [])
    ].sort()
  );
}
