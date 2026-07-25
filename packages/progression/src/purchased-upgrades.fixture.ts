import { createInitialProfile } from "./profile-state.js";
import { purchaseUpgradeRank } from "./purchased-upgrades.js";

export const purchasedUpgradeCatalog = Object.freeze({
  schemaVersion: 1 as const,
  upgrades: Object.freeze([
    Object.freeze({
      schemaVersion: 1 as const,
      upgradeId: "upgrade.ability.shield_slam" as never,
      kind: "ability_rank" as const,
      ownerId: "character.iron_warden" as never,
      prerequisiteUpgradeIds: Object.freeze([]),
      rankCosts: Object.freeze([10, 25])
    }),
    Object.freeze({
      schemaVersion: 1 as const,
      upgradeId: "upgrade.item.powder_cask" as never,
      kind: "item_rank" as const,
      ownerId: "item.powder_cask" as never,
      prerequisiteUpgradeIds: Object.freeze([
        "upgrade.ability.shield_slam" as never
      ]),
      rankCosts: Object.freeze([15])
    })
  ])
});

export function purchasedUpgradeParityEvidence() {
  const initial = Object.freeze({
    ...createInitialProfile("character.iron_warden" as never),
    forgeOre: 60,
    unlockedItemIds: Object.freeze(["item.powder_cask" as never])
  });
  const shieldRankOne = purchaseUpgradeRank({
    schemaVersion: 1,
    profile: initial,
    catalog: {
      ...purchasedUpgradeCatalog,
      upgrades: [...purchasedUpgradeCatalog.upgrades].reverse()
    },
    upgradeId: "upgrade.ability.shield_slam" as never
  });
  const powderCask = purchaseUpgradeRank({
    schemaVersion: 1,
    profile: shieldRankOne.profile,
    catalog: purchasedUpgradeCatalog,
    upgradeId: "upgrade.item.powder_cask" as never
  });
  const shieldRankTwo = purchaseUpgradeRank({
    schemaVersion: 1,
    profile: powderCask.profile,
    catalog: purchasedUpgradeCatalog,
    upgradeId: "upgrade.ability.shield_slam" as never
  });
  return Object.freeze({ shieldRankOne, powderCask, shieldRankTwo });
}
