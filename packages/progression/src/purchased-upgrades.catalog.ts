import type { PurchasedUpgradeCatalog } from "./purchased-upgrades.js";

/** Finite authored purchased-upgrade catalog for the vertical slice. */
export const purchasedUpgradeCatalog: PurchasedUpgradeCatalog = Object.freeze({
  schemaVersion: 1,
  upgrades: Object.freeze([
    Object.freeze({
      schemaVersion: 1,
      upgradeId: "upgrade.ability.shield_slam" as never,
      kind: "ability_rank",
      ownerId: "character.iron_warden" as never,
      prerequisiteUpgradeIds: Object.freeze([]),
      rankCosts: Object.freeze([10, 25]),
      passiveEffectsByRank: Object.freeze([
        Object.freeze([
          Object.freeze({
            schemaVersion: 1,
            kind: "maximum_health_add",
            value: 20
          }),
          Object.freeze({
            schemaVersion: 1,
            kind: "attack_damage_add",
            value: 2
          })
        ]),
        Object.freeze([
          Object.freeze({
            schemaVersion: 1,
            kind: "maximum_health_add",
            value: 30
          })
        ])
      ])
    }),
    Object.freeze({
      schemaVersion: 1,
      upgradeId: "upgrade.item.powder_cask" as never,
      kind: "item_rank",
      ownerId: "item.powder_cask" as never,
      prerequisiteUpgradeIds: Object.freeze([
        "upgrade.ability.shield_slam" as never
      ]),
      rankCosts: Object.freeze([15]),
      passiveEffectsByRank: Object.freeze([Object.freeze([])])
    })
  ])
});
