import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { createInitialProfile } from "./profile-state.js";
import { purchasedUpgradeCatalog } from "./purchased-upgrades.fixture.js";
import {
  createRecyclableProfile,
  progressedCampaignAccess,
  progressionRecycleParityEvidence,
  referenceCampaign
} from "./recycle-transactions.fixture.js";
import { recycleProgression } from "./recycle-transactions.js";
import { ironWardenSkillTree } from "./skill-tree.fixture.js";

const checksum =
  "c3d521b2c7937db45f38bb9540127140d4551f22fe816ad8b8f163aa6c4cbd57";

function characterRequest(profile = createRecyclableProfile()) {
  return {
    schemaVersion: 1 as const,
    profile,
    campaign: referenceCampaign,
    campaignAccess: progressedCampaignAccess,
    scope: {
      schemaVersion: 1 as const,
      kind: "character_skill_tree" as const,
      characterId: "character.iron_warden" as never,
      tree: ironWardenSkillTree
    }
  };
}

function sharedRequest(profile = createRecyclableProfile()) {
  return {
    schemaVersion: 1 as const,
    profile,
    campaign: referenceCampaign,
    campaignAccess: progressedCampaignAccess,
    scope: {
      schemaVersion: 1 as const,
      kind: "shared_purchased_upgrades" as const,
      catalog: purchasedUpgradeCatalog
    }
  };
}

describe("full progression recycle transactions", () => {
  it("recycles one complete character tree and restores every spent point", () => {
    const before = createRecyclableProfile();
    const result = recycleProgression(characterRequest(before));
    expect(result.decision).toEqual({
      schemaVersion: 1,
      scope: "character_skill_tree",
      characterId: "character.iron_warden",
      refundedSkillPointLevels: [2, 3],
      refundedForgeOre: 0,
      previousUnlockedLevelIds: [
        "level.shuttergate",
        "level.deep_roads",
        "level.forge_heart"
      ],
      resetLevelId: "level.shuttergate",
      status: "recycled",
      reason: "character_skill_tree_recycled"
    });
    expect(result.profile.revision).toBe(before.revision + 1);
    expect(result.profile.characterExperienceStates).toEqual([
      {
        schemaVersion: 1,
        characterId: "character.deep_ranger",
        experience: 100,
        level: 2,
        pendingSkillPointLevels: []
      },
      {
        ...before.characterExperienceStates.find(
          (state) => state.characterId === "character.iron_warden"
        ),
        pendingSkillPointLevels: [2, 3]
      }
    ]);
    expect(result.profile.selectedSkillNodes).toEqual([
      {
        schemaVersion: 1,
        characterId: "character.deep_ranger",
        nodeId: "skill.deep_ranger.first_step",
        spentSkillPointLevel: 2
      }
    ]);
    expect(result.profile.purchasedUpgrades).toEqual(before.purchasedUpgrades);
    expect(result.profile.claimedRewardIds).toEqual(before.claimedRewardIds);
    expect(result.profile.claimedExperienceRewardEvents).toEqual(
      before.claimedExperienceRewardEvents
    );
  });

  it("recycles every shared purchase and conserves Forge Ore exactly", () => {
    const before = createRecyclableProfile();
    const totalBefore =
      before.forgeOre +
      before.purchasedUpgrades.reduce(
        (total, purchase) => total + purchase.forgeOreSpent,
        0
      );
    const result = recycleProgression(sharedRequest(before));
    expect(result.decision).toMatchObject({
      scope: "shared_purchased_upgrades",
      characterId: null,
      refundedSkillPointLevels: [],
      refundedForgeOre: 25,
      status: "recycled",
      reason: "shared_purchased_upgrades_recycled"
    });
    expect(result.profile.forgeOre).toBe(totalBefore);
    expect(result.profile.purchasedUpgrades).toEqual([]);
    expect(result.profile.selectedSkillNodes).toEqual(
      before.selectedSkillNodes
    );
    expect(result.profile.characterExperienceStates).toEqual(
      before.characterExperienceStates
    );
    expect(result.profile.unlockedCharacterIds).toEqual(
      before.unlockedCharacterIds
    );
    expect(result.profile.unlockedItemIds).toEqual(before.unlockedItemIds);
  });

  it("resets campaign access to the authored first level for both scopes", () => {
    const evidence = progressionRecycleParityEvidence();
    for (const result of [evidence.character, evidence.shared]) {
      expect(result.campaignAccess).toEqual({
        schemaVersion: 1,
        campaignId: "campaign.shuttergate",
        currentLevelId: "level.shuttergate",
        unlockedLevelIds: ["level.shuttergate"]
      });
    }
  });

  it("is input-order independent, detached, immutable, and parity pinned", async () => {
    const request = characterRequest();
    const before = structuredClone(request);
    const result = recycleProgression(request);
    const reordered = recycleProgression({
      ...request,
      campaignAccess: {
        ...request.campaignAccess,
        unlockedLevelIds: [...request.campaignAccess.unlockedLevelIds].reverse()
      },
      scope: {
        ...request.scope,
        tree: {
          ...request.scope.tree,
          nodes: [...request.scope.tree.nodes].reverse()
        }
      }
    });
    expect(result).toEqual(reordered);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.profile)).toBe(true);
    expect(Object.isFrozen(result.campaignAccess)).toBe(true);
    expect(Object.isFrozen(result.campaignAccess.unlockedLevelIds)).toBe(true);
    expect(Object.isFrozen(result.decision)).toBe(true);
    expect(Object.isFrozen(result.decision.refundedSkillPointLevels)).toBe(
      true
    );
    expect(await canonicalHash(progressionRecycleParityEvidence())).toBe(
      checksum
    );
  });

  it("rejects empty, partial, foreign, forged, and overflowing scopes atomically", () => {
    const profile = createRecyclableProfile();
    const before = structuredClone(profile);
    expect(() =>
      recycleProgression(
        characterRequest({
          ...profile,
          characterExperienceStates: profile.characterExperienceStates.map(
            (state) =>
              state.characterId === "character.iron_warden"
                ? { ...state, pendingSkillPointLevels: [2, 3] }
                : state
          ),
          selectedSkillNodes: profile.selectedSkillNodes.filter(
            (entry) => entry.characterId !== "character.iron_warden"
          )
        })
      )
    ).toThrow("has no selections");
    expect(() =>
      recycleProgression({
        ...characterRequest(profile),
        scope: {
          ...characterRequest(profile).scope,
          characterId: "character.deep_ranger" as never
        }
      })
    ).toThrow("owner does not match tree");
    expect(() =>
      recycleProgression(
        sharedRequest({
          ...profile,
          purchasedUpgrades: profile.purchasedUpgrades.map((purchase) =>
            purchase.upgradeId === "upgrade.ability.shield_slam"
              ? { ...purchase, forgeOreSpent: 11 }
              : purchase
          )
        })
      )
    ).toThrow("spend does not match authored costs");
    expect(() =>
      recycleProgression({
        ...sharedRequest(profile),
        scope: {
          ...sharedRequest(profile).scope,
          unexpected: true
        }
      } as never)
    ).toThrow("must contain exactly");
    expect(() =>
      recycleProgression(
        sharedRequest({ ...profile, revision: Number.MAX_SAFE_INTEGER })
      )
    ).toThrow("profile revision exceeds safe integer range");
    expect(profile).toEqual(before);
  });

  it("rejects incoherent campaign access and requests with nothing to recycle", () => {
    expect(() =>
      recycleProgression({
        ...characterRequest(),
        campaignAccess: {
          ...progressedCampaignAccess,
          unlockedLevelIds: [
            "level.shuttergate" as never,
            "level.forge_heart" as never
          ]
        }
      })
    ).toThrow("must be an authored prefix");
    expect(() =>
      recycleProgression({
        ...sharedRequest(),
        campaignAccess: {
          ...progressedCampaignAccess,
          campaignId: "campaign.other" as never
        }
      })
    ).toThrow("does not belong to campaign definition");
    expect(() =>
      recycleProgression(
        sharedRequest({
          ...createInitialProfile("character.iron_warden" as never),
          unlockedItemIds: ["item.powder_cask" as never]
        })
      )
    ).toThrow("has no purchases");
  });
});
