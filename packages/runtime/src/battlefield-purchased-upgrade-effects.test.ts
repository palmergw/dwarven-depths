import { canonicalHash } from "@dwarven-depths/contracts";
import { describe, expect, it } from "vitest";
import { battlefieldPurchasedUpgradeEffectParityEvidence } from "./battlefield-skill-effects.fixture.js";

const checksum =
  "ef44ba8d2ee98f3c8bec5d84647a731930afd3181d3c9159c5b6e3452a7da12b";

describe("purchased passive battlefield effects", () => {
  it("deploys absolute purchased modifiers and reapplies idempotently", async () => {
    const evidence = await battlefieldPurchasedUpgradeEffectParityEvidence();
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
    expect(evidence.dwarf).toMatchObject({
      currentHealth: 315,
      maximumHealth: 315,
      basicAttack: { damage: 23, range: 2, cooldownTicks: 24 }
    });
    expect(evidence.appliedModifiers[0]).toMatchObject({
      maximumHealthAdd: 75,
      attackDamageAdd: 5
    });
    expect(evidence.repeatedIsEquivalent).toBe(true);
    expect(Object.isFrozen(evidence.dwarf)).toBe(true);
    expect(await canonicalHash(evidence)).toBe(checksum);
  });
});
