import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { bossDeaths, bossRewards } from "./boss-rewards.fixture.js";
import {
  createInitialProfile,
  derivePurchasedUpgradeCharacterModifiers,
  purchaseUpgradeRank,
  resolveBossDeathRewards,
  resolveOwnedCharacterExperienceRewards,
  selectCharacterSkillNode
} from "./index.js";
import {
  ownedExperienceEvents,
  ownedExperienceThresholdSets
} from "./owned-character-experience-rewards.fixture.js";
import {
  purchasedUpgradeCatalog,
  purchasedUpgradeParityEvidence
} from "./purchased-upgrades.fixture.js";
import { ironWardenSkillTree } from "./skill-tree.fixture.js";

const checksum =
  "ede93ac2992ec7b5069647e1afe79d77bb704cb048bcfee90350df56f7742dc9";

function fundedProfile(forgeOre = 60) {
  return {
    ...createInitialProfile("character.iron_warden" as never),
    forgeOre,
    unlockedItemIds: ["item.powder_cask" as never]
  };
}

function catalogUpgrade(index: number) {
  const upgrade = purchasedUpgradeCatalog.upgrades[index];
  if (upgrade === undefined)
    throw new Error(`missing fixture upgrade ${index}`);
  return upgrade;
}

describe("Forge Ore purchased upgrades", () => {
  it("purchases authored ranks and preserves exact spend in stable order", async () => {
    const evidence = purchasedUpgradeParityEvidence();
    expect(evidence.shieldRankTwo.profile).toEqual({
      ...createInitialProfile("character.iron_warden" as never),
      revision: 3,
      forgeOre: 10,
      unlockedItemIds: ["item.powder_cask"],
      purchasedUpgrades: [
        {
          schemaVersion: 1,
          upgradeId: "upgrade.ability.shield_slam",
          rank: 2,
          forgeOreSpent: 35
        },
        {
          schemaVersion: 1,
          upgradeId: "upgrade.item.powder_cask",
          rank: 1,
          forgeOreSpent: 15
        }
      ]
    });
    expect(evidence.shieldRankTwo.decision).toEqual({
      schemaVersion: 1,
      upgradeId: "upgrade.ability.shield_slam",
      kind: "ability_rank",
      previousRank: 1,
      purchasedRank: 2,
      forgeOreSpent: 25,
      forgeOreRemaining: 10,
      status: "purchased",
      reason: "upgrade_rank_purchased"
    });
    expect(evidence.modifiers).toEqual([
      {
        schemaVersion: 1,
        characterId: "character.iron_warden",
        maximumHealthAdd: 50,
        attackDamageAdd: 2,
        attackRangeAdd: 0,
        futureCooldownReductionTicks: 0,
        sourceUpgradeIds: ["upgrade.ability.shield_slam"]
      }
    ]);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });

  it("is input-order independent, detached, immutable, and non-mutating", () => {
    const profile = fundedProfile();
    const request = {
      schemaVersion: 1 as const,
      profile,
      catalog: {
        ...purchasedUpgradeCatalog,
        upgrades: [...purchasedUpgradeCatalog.upgrades].reverse()
      },
      upgradeId: "upgrade.ability.shield_slam" as never
    };
    const before = structuredClone(request);
    const result = purchaseUpgradeRank(request);
    const forward = purchaseUpgradeRank({
      ...request,
      catalog: purchasedUpgradeCatalog
    });
    expect(result).toEqual(forward);
    expect(request).toEqual(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.profile)).toBe(true);
    expect(Object.isFrozen(result.profile.purchasedUpgrades)).toBe(true);
    expect(Object.isFrozen(result.profile.purchasedUpgrades[0])).toBe(true);
    expect(Object.isFrozen(result.decision)).toBe(true);
  });

  it("preserves purchases through XP, skill choice, and boss reward transitions", () => {
    const purchased = purchaseUpgradeRank({
      schemaVersion: 1,
      profile: fundedProfile(),
      catalog: purchasedUpgradeCatalog,
      upgradeId: "upgrade.ability.shield_slam" as never
    });
    const experienced = resolveOwnedCharacterExperienceRewards({
      schemaVersion: 1,
      profile: purchased.profile,
      events: ownedExperienceEvents,
      thresholdSets: ownedExperienceThresholdSets
    });
    const selected = selectCharacterSkillNode({
      schemaVersion: 1,
      profile: experienced.profile,
      tree: ironWardenSkillTree,
      nodeId: "skill.iron_warden.stone_guard" as never
    });
    const rewarded = resolveBossDeathRewards({
      schemaVersion: 1,
      profile: selected.profile,
      bossDeaths: [bossDeaths[0]],
      rewards: bossRewards
    });
    expect(experienced.profile.purchasedUpgrades).toEqual(
      purchased.profile.purchasedUpgrades
    );
    expect(selected.profile.purchasedUpgrades).toEqual(
      purchased.profile.purchasedUpgrades
    );
    expect(rewarded.profile.purchasedUpgrades).toEqual(
      purchased.profile.purchasedUpgrades
    );
  });

  it("rejects missing prerequisites, insufficient currency, and maximum ranks atomically", () => {
    const profile = fundedProfile();
    const before = structuredClone(profile);
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile,
        catalog: purchasedUpgradeCatalog,
        upgradeId: "upgrade.item.powder_cask" as never
      })
    ).toThrow("prerequisite is not owned");
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: fundedProfile(9),
        catalog: purchasedUpgradeCatalog,
        upgradeId: "upgrade.ability.shield_slam" as never
      })
    ).toThrow("insufficient Forge Ore");
    const evidence = purchasedUpgradeParityEvidence();
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: evidence.shieldRankTwo.profile,
        catalog: purchasedUpgradeCatalog,
        upgradeId: "upgrade.ability.shield_slam" as never
      })
    ).toThrow("already at maximum rank");
    expect(profile).toEqual(before);
  });

  it("rejects ability and item purchases whose owner is not unlocked", () => {
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: {
          ...fundedProfile(),
          unlockedCharacterIds: [],
          characterExperienceStates: []
        },
        catalog: purchasedUpgradeCatalog,
        upgradeId: "upgrade.ability.shield_slam" as never
      })
    ).toThrow("owner is not unlocked");
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: { ...fundedProfile(), unlockedItemIds: [] },
        catalog: purchasedUpgradeCatalog,
        upgradeId: "upgrade.item.powder_cask" as never
      })
    ).toThrow("owner is not unlocked");
  });

  it("rejects forged purchase history, malformed catalogs, cycles, and overflow", () => {
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: {
          ...fundedProfile(),
          purchasedUpgrades: [
            {
              schemaVersion: 1,
              upgradeId: "upgrade.ability.shield_slam" as never,
              rank: 1,
              forgeOreSpent: 11
            }
          ]
        },
        catalog: purchasedUpgradeCatalog,
        upgradeId: "upgrade.ability.shield_slam" as never
      })
    ).toThrow("spend does not match authored costs");
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: {
          ...fundedProfile(Number.MAX_SAFE_INTEGER),
          purchasedUpgrades: [
            {
              schemaVersion: 1,
              upgradeId: "upgrade.ability.shield_slam" as never,
              rank: 1,
              forgeOreSpent: 10
            }
          ]
        },
        catalog: purchasedUpgradeCatalog,
        upgradeId: "upgrade.ability.shield_slam" as never
      })
    ).toThrow("balance and purchased spend exceed safe integer range");
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: {
          ...fundedProfile(),
          purchasedUpgrades: [
            {
              schemaVersion: 1,
              upgradeId: "upgrade.ability.shield_slam" as never,
              rank: 1,
              forgeOreSpent: 10
            }
          ]
        },
        catalog: {
          schemaVersion: 1,
          upgrades: [
            {
              ...catalogUpgrade(0),
              ownerId: "character.deep_ranger" as never
            },
            catalogUpgrade(1)
          ]
        },
        upgradeId: "upgrade.item.powder_cask" as never
      })
    ).toThrow("profile purchased upgrade owner is not unlocked");
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: fundedProfile(),
        catalog: {
          schemaVersion: 1,
          upgrades: [
            {
              ...catalogUpgrade(0),
              prerequisiteUpgradeIds: ["upgrade.item.powder_cask" as never]
            },
            {
              ...catalogUpgrade(1),
              prerequisiteUpgradeIds: ["upgrade.ability.shield_slam" as never]
            }
          ]
        },
        upgradeId: "upgrade.ability.shield_slam" as never
      })
    ).toThrow("prerequisites must be acyclic");
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: { ...fundedProfile(), revision: Number.MAX_SAFE_INTEGER },
        catalog: purchasedUpgradeCatalog,
        upgradeId: "upgrade.ability.shield_slam" as never
      })
    ).toThrow("profile revision exceeds safe integer range");
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: fundedProfile(),
        catalog: {
          ...purchasedUpgradeCatalog,
          upgrades: [{ ...catalogUpgrade(0), unexpected: true }]
        } as never,
        upgradeId: "upgrade.ability.shield_slam" as never
      })
    ).toThrow("must contain exactly");
    expect(() =>
      purchaseUpgradeRank({
        schemaVersion: 1,
        profile: fundedProfile(),
        catalog: {
          schemaVersion: 1,
          upgrades: [
            {
              ...catalogUpgrade(1),
              prerequisiteUpgradeIds: [],
              passiveEffectsByRank: [
                [
                  {
                    schemaVersion: 1,
                    kind: "attack_damage_add",
                    value: 1
                  }
                ]
              ]
            }
          ]
        },
        upgradeId: "upgrade.item.powder_cask" as never
      })
    ).toThrow("item rank cannot define character passive effects");
    expect(
      derivePurchasedUpgradeCharacterModifiers({
        schemaVersion: 1,
        profile: purchasedUpgradeParityEvidence().shieldRankTwo.profile,
        catalog: purchasedUpgradeCatalog
      })
    ).toEqual(purchasedUpgradeParityEvidence().modifiers);
  });
});
