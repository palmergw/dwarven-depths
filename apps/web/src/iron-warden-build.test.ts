import type { StableId } from "@dwarven-depths/contracts";
import {
  createInitialProfile,
  ironWardenSkillTree,
  purchasedUpgradeCatalog,
  purchaseUpgradeRank,
  selectCharacterSkillNode
} from "@dwarven-depths/progression";
import { describe, expect, it } from "vitest";
import { deriveIronWardenBuildSummary } from "./iron-warden-build.js";

const characterId = "character.iron_warden" as StableId;

function skillReadyProfile() {
  return {
    ...createInitialProfile(characterId),
    forgeOre: 60,
    characterExperienceStates: [
      {
        schemaVersion: 1 as const,
        characterId,
        experience: 260,
        level: 3,
        pendingSkillPointLevels: [2, 3]
      }
    ]
  };
}

describe("Iron Warden build summary", () => {
  it("derives zero totals without mutating an unupgraded profile", () => {
    const profile = createInitialProfile(characterId);
    const before = structuredClone(profile);
    expect(deriveIronWardenBuildSummary(profile)).toEqual({
      maximumHealthAdd: 0,
      attackDamageAdd: 0,
      attackRangeAdd: 0,
      futureCooldownReductionTicks: 0,
      sourceIds: []
    });
    expect(profile).toEqual(before);
  });

  it("ignores preserved unknown records while summarizing authored effects", () => {
    const profile = {
      ...createInitialProfile(characterId),
      purchasedUpgrades: [
        {
          schemaVersion: 1 as const,
          upgradeId: "upgrade.ability.future_training" as StableId,
          rank: 1,
          forgeOreSpent: 1
        }
      ]
    };
    const before = structuredClone(profile);
    expect(deriveIronWardenBuildSummary(profile)).toMatchObject({
      maximumHealthAdd: 0,
      sourceIds: []
    });
    expect(profile).toEqual(before);
  });

  it("rejects an over-ranked purchase instead of displaying clamped totals", () => {
    const profile = {
      ...createInitialProfile(characterId),
      purchasedUpgrades: [
        {
          schemaVersion: 1 as const,
          upgradeId: "upgrade.ability.shield_slam" as StableId,
          rank: 3,
          forgeOreSpent: 60
        }
      ]
    };

    expect(() => deriveIronWardenBuildSummary(profile)).toThrow(
      "purchased upgrade rank exceeds authored maximum"
    );
  });

  it("rejects a selected branch whose prerequisite is absent", () => {
    const profile = {
      ...skillReadyProfile(),
      selectedSkillNodes: [
        {
          schemaVersion: 1 as const,
          characterId,
          nodeId: "skill.iron_warden.disciplined_slam" as StableId,
          spentSkillPointLevel: 3
        }
      ],
      characterExperienceStates: [
        {
          schemaVersion: 1 as const,
          characterId,
          experience: 260,
          level: 3,
          pendingSkillPointLevels: [2]
        }
      ]
    };

    expect(() => deriveIronWardenBuildSummary(profile)).toThrow(
      "selected skill node has an unselected prerequisite"
    );
  });

  it("combines purchased and selected effects in canonical source order", () => {
    const purchased = purchaseUpgradeRank({
      schemaVersion: 1,
      profile: skillReadyProfile(),
      catalog: purchasedUpgradeCatalog,
      upgradeId: "upgrade.ability.shield_slam" as StableId
    }).profile;
    const foundation = selectCharacterSkillNode({
      schemaVersion: 1,
      profile: purchased,
      tree: ironWardenSkillTree,
      nodeId: "skill.iron_warden.stone_guard" as StableId
    }).profile;
    const disciplined = selectCharacterSkillNode({
      schemaVersion: 1,
      profile: foundation,
      tree: ironWardenSkillTree,
      nodeId: "skill.iron_warden.disciplined_slam" as StableId
    }).profile;

    expect(deriveIronWardenBuildSummary(disciplined)).toEqual({
      maximumHealthAdd: 625,
      attackDamageAdd: 5,
      attackRangeAdd: 4,
      futureCooldownReductionTicks: 2,
      sourceIds: [
        "skill.iron_warden.disciplined_slam",
        "skill.iron_warden.stone_guard",
        "upgrade.ability.shield_slam"
      ]
    });
  });

  it("keeps the level-three branch tactically distinct", () => {
    const foundation = selectCharacterSkillNode({
      schemaVersion: 1,
      profile: skillReadyProfile(),
      tree: ironWardenSkillTree,
      nodeId: "skill.iron_warden.stone_guard" as StableId
    }).profile;
    const disciplined = selectCharacterSkillNode({
      schemaVersion: 1,
      profile: foundation,
      tree: ironWardenSkillTree,
      nodeId: "skill.iron_warden.disciplined_slam" as StableId
    }).profile;
    const reach = selectCharacterSkillNode({
      schemaVersion: 1,
      profile: foundation,
      tree: ironWardenSkillTree,
      nodeId: "skill.iron_warden.long_reach" as StableId
    }).profile;

    expect(deriveIronWardenBuildSummary(disciplined)).toMatchObject({
      attackRangeAdd: 0,
      futureCooldownReductionTicks: 2
    });
    expect(deriveIronWardenBuildSummary(reach)).toMatchObject({
      attackRangeAdd: 1,
      futureCooldownReductionTicks: 0
    });
  });
});
