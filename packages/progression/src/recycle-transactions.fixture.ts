import { normalizeProfileState } from "./profile-state.js";
import { purchasedUpgradeCatalog } from "./purchased-upgrades.fixture.js";
import { purchaseUpgradeRank } from "./purchased-upgrades.js";
import { recycleProgression } from "./recycle-transactions.js";
import {
  characterSkillTreeParityEvidence,
  ironWardenSkillTree
} from "./skill-tree.fixture.js";

export const referenceCampaign = Object.freeze({
  schemaVersion: 1 as const,
  campaignId: "campaign.shuttergate" as never,
  levelIds: Object.freeze([
    "level.shuttergate" as never,
    "level.deep_roads" as never,
    "level.forge_heart" as never
  ])
});

export const progressedCampaignAccess = Object.freeze({
  schemaVersion: 1 as const,
  campaignId: "campaign.shuttergate" as never,
  currentLevelId: "level.deep_roads" as never,
  unlockedLevelIds: Object.freeze([
    "level.forge_heart" as never,
    "level.shuttergate" as never,
    "level.deep_roads" as never
  ])
});

export function createRecyclableProfile() {
  const skilled = characterSkillTreeParityEvidence().second.profile;
  const retained = normalizeProfileState({
    ...skilled,
    forgeOre: 100,
    unlockedCharacterIds: ["character.deep_ranger", "character.iron_warden"],
    unlockedItemIds: ["item.powder_cask"],
    claimedRewardIds: ["reward.boss.gatebreaker_captain"],
    characterExperienceStates: [
      ...skilled.characterExperienceStates,
      {
        schemaVersion: 1,
        characterId: "character.deep_ranger",
        experience: 100,
        level: 2,
        pendingSkillPointLevels: []
      }
    ],
    selectedSkillNodes: [
      ...skilled.selectedSkillNodes,
      {
        schemaVersion: 1,
        characterId: "character.deep_ranger",
        nodeId: "skill.deep_ranger.first_step",
        spentSkillPointLevel: 2
      }
    ]
  });
  const shield = purchaseUpgradeRank({
    schemaVersion: 1,
    profile: retained,
    catalog: purchasedUpgradeCatalog,
    upgradeId: "upgrade.ability.shield_slam" as never
  });
  return purchaseUpgradeRank({
    schemaVersion: 1,
    profile: shield.profile,
    catalog: purchasedUpgradeCatalog,
    upgradeId: "upgrade.item.powder_cask" as never
  }).profile;
}

/** Shared nonempty evidence executed unchanged by Node and browsers. */
export function progressionRecycleParityEvidence() {
  const profile = createRecyclableProfile();
  const character = recycleProgression({
    schemaVersion: 1,
    profile,
    campaign: referenceCampaign,
    campaignAccess: progressedCampaignAccess,
    scope: {
      schemaVersion: 1,
      kind: "character_skill_tree",
      characterId: "character.iron_warden" as never,
      tree: ironWardenSkillTree
    }
  });
  const shared = recycleProgression({
    schemaVersion: 1,
    profile,
    campaign: referenceCampaign,
    campaignAccess: progressedCampaignAccess,
    scope: {
      schemaVersion: 1,
      kind: "shared_purchased_upgrades",
      catalog: {
        ...purchasedUpgradeCatalog,
        upgrades: [...purchasedUpgradeCatalog.upgrades].reverse()
      }
    }
  });
  return Object.freeze({ character, shared });
}
