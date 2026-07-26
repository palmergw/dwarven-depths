import { createInitialProfile } from "./profile-state.js";
import { purchasedUpgradeCatalog } from "./purchased-upgrades.catalog.js";
import {
  derivePurchasedUpgradeCharacterModifiers,
  purchaseUpgradeRank
} from "./purchased-upgrades.js";

export { purchasedUpgradeCatalog };

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
  const modifiers = derivePurchasedUpgradeCharacterModifiers({
    schemaVersion: 1,
    profile: shieldRankTwo.profile,
    catalog: purchasedUpgradeCatalog
  });
  return Object.freeze({
    shieldRankOne,
    powderCask,
    shieldRankTwo,
    modifiers
  });
}
